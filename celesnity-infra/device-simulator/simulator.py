#!/usr/bin/env python3
"""Virtual factory site: LoRa-like sensors relayed by one MQTT gateway."""

from __future__ import annotations

import json
import base64
import hashlib
import hmac
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Callable

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


@dataclass(frozen=True)
class SensorFrame:
    sensor_id: str
    sequence: int
    temperature: float
    battery_percent: int
    rssi: int
    snr: float
    observed_at: str


class VirtualGateway:
    """Accepts only bound sensor frames and produces the cloud telemetry envelope."""

    def __init__(self, gateway_id: str, bound_sensor_ids: set[str]) -> None:
        self.gateway_id = gateway_id
        self.bound_sensor_ids = frozenset(bound_sensor_ids)
        self.rejected_sensor_ids: list[str] = []

    def relay(self, frame: SensorFrame) -> dict[str, object] | None:
        if frame.sensor_id not in self.bound_sensor_ids:
            self.rejected_sensor_ids.append(frame.sensor_id)
            return None
        return {
            "eventId": str(uuid.uuid4()),
            "eventTime": frame.observed_at,
            "gatewayId": self.gateway_id,
            "deviceId": frame.sensor_id,
            "sequence": frame.sequence,
            "temperature": frame.temperature,
            "batteryPercent": frame.battery_percent,
            "radio": {"rssi": frame.rssi, "snr": frame.snr},
            "transport": "SIMULATED_LORA",
        }


@dataclass
class SimulatedPresenceDevice:
    device_id: str
    firmware_version: str
    configuration_version: int = 0


class DevicePresenceSimulator:
    """Keeps devices online and periodically exercises contact loss and recovery."""

    HEALTHY = "HEALTHY"
    OFFLINE = "OFFLINE"

    def __init__(
        self,
        api: CoreApi,
        devices: list[SimulatedPresenceDevice],
        username: str,
        password: str,
        heartbeat_interval_seconds: float = 3,
        healthy_duration_seconds: float = 60,
        offline_duration_seconds: float = 30,
        offline_device_id: str | None = None,
        offline_cycle_enabled: bool = True,
        on_heartbeat: Callable[[SimulatedPresenceDevice], None] | None = None,
        now: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not devices:
            raise ValueError("At least one simulated presence device is required")
        if heartbeat_interval_seconds <= 0:
            raise ValueError("Heartbeat interval must be positive")
        if healthy_duration_seconds <= 0 or offline_duration_seconds <= 0:
            raise ValueError("Presence phase durations must be positive")
        known_device_ids = {device.device_id for device in devices}
        if offline_device_id is not None and offline_device_id not in known_device_ids:
            raise ValueError("Offline target must be one of the simulated devices")

        self.api = api
        self.devices = tuple(devices)
        self.username = username
        self.password = password
        self.heartbeat_interval_seconds = heartbeat_interval_seconds
        self.healthy_duration_seconds = healthy_duration_seconds
        self.offline_duration_seconds = offline_duration_seconds
        self.offline_device_id = offline_device_id
        self.offline_cycle_enabled = offline_cycle_enabled and offline_device_id is not None
        self.on_heartbeat = on_heartbeat
        self.now = now
        self.sleep = sleep
        self.phase = self.HEALTHY
        self.phase_started_at = now()

    def tick(self) -> bool:
        """Send one heartbeat round and return whether the phase changed."""

        current_time = self.now()
        phase_changed = False
        if (
            self.offline_cycle_enabled
            and self.phase == self.HEALTHY
            and current_time - self.phase_started_at >= self.healthy_duration_seconds
        ):
            self.phase = self.OFFLINE
            self.phase_started_at = current_time
            phase_changed = True
        elif (
            self.phase == self.OFFLINE
            and current_time - self.phase_started_at >= self.offline_duration_seconds
        ):
            self.phase = self.HEALTHY
            self.phase_started_at = current_time
            phase_changed = True

        for device in self.devices:
            if self.phase == self.OFFLINE and device.device_id == self.offline_device_id:
                continue
            try:
                self.api.check_in(
                    device.device_id,
                    device.firmware_version,
                    self.username,
                    self.password,
                    device.configuration_version,
                )
                if self.on_heartbeat is not None:
                    self.on_heartbeat(device)
            except Exception as error:
                print(
                    json.dumps(
                        {
                            "presenceHeartbeatError": str(error),
                            "deviceId": device.device_id,
                            "observedAt": datetime.now(UTC).isoformat(),
                        }
                    ),
                    flush=True,
                )
        return phase_changed

    def run_forever(self) -> None:
        print(
            json.dumps(
                {
                    "presencePhase": self.phase,
                    "offlineTargetDeviceId": self.offline_device_id,
                    "heartbeatIntervalSeconds": self.heartbeat_interval_seconds,
                    "healthyDurationSeconds": self.healthy_duration_seconds,
                    "offlineDurationSeconds": self.offline_duration_seconds,
                }
            ),
            flush=True,
        )
        while True:
            phase_changed = self.tick()
            if phase_changed:
                print(
                    json.dumps(
                        {
                            "presencePhase": self.phase,
                            "offlineTargetDeviceId": self.offline_device_id,
                            "changedAt": datetime.now(UTC).isoformat(),
                        }
                    ),
                    flush=True,
                )
            self.sleep(self.heartbeat_interval_seconds)


class ConfigurationCommandProcessor:
    """Atomically applies one newer configuration and acknowledges it to Core."""

    def __init__(self, api: CoreApi, current_version: int = 0) -> None:
        self.api = api
        self.current_version = current_version
        self.parameters: dict[str, object] = {}

    def process(self, command: dict[str, object]) -> int:
        configuration_id = command.get("configurationId")
        version = command.get("version")
        parameters = command.get("parameters")
        event_path = command.get("eventPath")
        event_token = command.get("eventToken")
        if command.get("type") != "configuration.apply":
            raise RuntimeError("Unexpected configuration command type")
        if not isinstance(configuration_id, str) or not isinstance(version, int):
            raise RuntimeError("Configuration identity or version is missing")
        if version <= self.current_version:
            raise RuntimeError("Configuration version is not monotonic")
        if not isinstance(parameters, dict) or not isinstance(event_path, str):
            raise RuntimeError("Configuration payload is invalid")
        if event_path != f"/device-management/device-configurations/{configuration_id}/events":
            raise RuntimeError("Configuration event path is not bound to the command")
        if not isinstance(event_token, str) or not event_token:
            raise RuntimeError("Configuration event token is missing")

        previous_parameters = self.parameters
        previous_version = self.current_version
        try:
            next_parameters = {} if command.get("restoreFactoryDefaults") is True else dict(parameters)
            self.parameters = next_parameters
            self.current_version = version
            self.api.report_configuration_event(event_path, event_token, "APPLIED")
        except Exception:
            self.parameters = previous_parameters
            self.current_version = previous_version
            raise
        return self.current_version


class DeviceAlertBuffer:
    """Buffers alert events offline and applies per-condition threshold hysteresis."""

    def __init__(self, api: CoreApi, username: str, password: str) -> None:
        self.api = api
        self.username = username
        self.password = password
        self.pending: list[dict[str, object]] = []
        self.latched_conditions: set[tuple[str, str]] = set()

    def observe_low_threshold(
        self,
        device_id: str,
        alert_type: str,
        severity: str,
        value: float,
        threshold: float,
        hysteresis: float,
        observed_at: str,
        measurement_name: str,
    ) -> bool:
        condition = (device_id, alert_type)
        if value > threshold + hysteresis:
            self.latched_conditions.discard(condition)
            return False
        if value > threshold or condition in self.latched_conditions:
            return False
        self.latched_conditions.add(condition)
        self.pending.append(
            {
                "deviceId": device_id,
                "eventId": str(uuid.uuid4()),
                "type": alert_type,
                "severity": severity,
                "observedAt": observed_at,
                "snapshot": {
                    measurement_name: value,
                    "threshold": threshold,
                    "hysteresis": hysteresis,
                },
            }
        )
        return True

    def flush(self) -> int:
        sent = 0
        while self.pending:
            event = self.pending[0]
            self.api.report_device_alert(event, self.username, self.password)
            self.pending.pop(0)
            sent += 1
        return sent


class PersistentCircularLogBuffer:
    """Wear-bounded reference buffer that survives restarts and replays in order."""

    LEVEL_PRIORITY = {"ERROR": 0, "WARNING": 1, "INFO": 2, "DEBUG": 3}

    def __init__(
        self,
        api: CoreApi,
        username: str,
        password: str,
        persistent_state: dict[str, object] | None = None,
        capacity: int = 32,
        log_level: str = "WARNING",
    ) -> None:
        if capacity < 1 or capacity > 1024:
            raise RuntimeError("Device log buffer capacity must be between 1 and 1024")
        if log_level not in self.LEVEL_PRIORITY:
            raise RuntimeError("Device log level is invalid")
        self.api = api
        self.username = username
        self.password = password
        self.state = persistent_state if persistent_state is not None else {}
        self.capacity = capacity
        self.state.setdefault("entries", [])
        self.state["logLevel"] = log_level

    @property
    def pending(self) -> list[dict[str, object]]:
        entries = self.state.get("entries")
        if not isinstance(entries, list):
            raise RuntimeError("Persistent device log state is corrupt")
        return entries

    def configure(self, log_level: str) -> None:
        if log_level not in self.LEVEL_PRIORITY:
            raise RuntimeError("Device log level is invalid")
        self.state["logLevel"] = log_level

    def record(
        self,
        device_id: str,
        level: str,
        kind: str,
        message: str,
        context: dict[str, object],
        observed_at: str,
    ) -> bool:
        configured = str(self.state["logLevel"])
        if level not in self.LEVEL_PRIORITY:
            raise RuntimeError("Device log level is invalid")
        if kind not in {"OPERATIONAL", "FAULT"}:
            raise RuntimeError("Device log kind is invalid")
        if self.LEVEL_PRIORITY[level] > self.LEVEL_PRIORITY[configured]:
            return False
        event = {
            "deviceId": device_id,
            "eventId": str(uuid.uuid4()),
            "level": level,
            "kind": kind,
            "message": message,
            "context": context.copy(),
            "observedAt": observed_at,
        }
        if len(self.pending) == self.capacity:
            self.pending.pop(0)
        self.pending.append(event)
        return True

    def capture_fault(
        self,
        device_id: str,
        reset_reason: str,
        program_counter: str,
        stack: list[str],
        firmware_version: str,
        observed_at: str,
    ) -> bool:
        return self.record(
            device_id,
            "ERROR",
            "FAULT",
            f"Device restarted after {reset_reason.lower()} reset",
            {
                "resetReason": reset_reason,
                "programCounter": program_counter,
                "stack": list(stack),
                "firmwareVersion": firmware_version,
            },
            observed_at,
        )

    def flush(self) -> int:
        sent = 0
        while self.pending:
            self.api.report_device_log(self.pending[0], self.username, self.password)
            self.pending.pop(0)
            sent += 1
        return sent


class CoreApi:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token

    def request(
        self,
        method: str,
        path: str,
        body: dict[str, object] | None = None,
        headers: dict[str, str] | None = None,
    ) -> object:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                **(headers or {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                payload = response.read()
                return None if not payload else json.loads(payload)
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            raise RuntimeError(f"Core API {method} {path} failed ({error.code}): {detail}") from error

    def first_active_adapter(self) -> str:
        adapters = self.request("GET", "/streaming/mqtt-adapters")
        if not isinstance(adapters, list):
            raise RuntimeError("Core API returned an invalid adapter list")
        for adapter in adapters:
            if (
                isinstance(adapter, dict)
                and adapter.get("status") == "ACTIVE"
                and adapter.get("desiredState") == "ACTIVE"
                and isinstance(adapter.get("id"), str)
            ):
                return adapter["id"]
        raise RuntimeError("No active MQTT adapter is available for the simulator")

    def register(self, body: dict[str, object]) -> dict[str, object]:
        result = self.request("POST", "/device-management/devices", body)
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid registration")
        return result

    def advance_lifecycle(self, device_id: str, states: list[str]) -> None:
        self.request(
            "POST",
            f"/device-management/devices/{device_id}/provisioning-confirmations",
        )
        for state in states:
            self.request(
                "POST",
                f"/device-management/devices/{device_id}/lifecycle-transitions",
                {"state": state},
            )

    def check_in(
        self,
        device_id: str,
        firmware: str,
        username: str,
        password: str,
        configuration_version: int = 0,
    ) -> None:
        body: dict[str, object] = {
            "deviceId": device_id,
            "observedAt": datetime.now(UTC).isoformat(),
            "currentFirmwareVersion": firmware,
            "configurationVersion": configuration_version,
        }
        encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
        self.request(
            "POST",
            "/device-management/device-heartbeats",
            body,
            {"Authorization": f"Basic {encoded}"},
        )

    def push_configuration(
        self, device_id: str, parameters: dict[str, object]
    ) -> dict[str, object]:
        result = self.request(
            "POST",
            f"/device-management/devices/{device_id}/configurations",
            {"parameters": parameters},
        )
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid device configuration")
        return result

    def create_configuration_template(
        self, name: str, parameters: dict[str, object]
    ) -> dict[str, object]:
        result = self.request(
            "POST",
            "/device-management/device-configuration-templates",
            {"name": name, "parameters": parameters},
        )
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid configuration template")
        return result

    def deploy_configuration_template(
        self,
        template_id: str,
        deployment_site: str | None = None,
        device_type: str | None = None,
    ) -> dict[str, object]:
        body: dict[str, object] = {}
        if deployment_site is not None:
            body["deploymentSite"] = deployment_site
        if device_type is not None:
            body["deviceType"] = device_type
        result = self.request(
            "POST",
            f"/device-management/device-configuration-templates/{template_id}/deployments",
            body,
        )
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid template deployment")
        return result

    def report_configuration_event(
        self, path: str, token: str, status: str, error: str | None = None
    ) -> dict[str, object]:
        result = self.request(
            "POST",
            path,
            {"status": status, **({} if error is None else {"error": error})},
            {"x-device-configuration-token": token},
        )
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid configuration acknowledgement")
        return result

    def list_device_alerts(self, device_id: str) -> list[dict[str, object]]:
        alerts = self.request(
            "GET",
            "/device-management/device-alerts?deviceId="
            + urllib.parse.quote(device_id, safe=""),
        )
        if not isinstance(alerts, list) or any(not isinstance(alert, dict) for alert in alerts):
            raise RuntimeError("Core API returned an invalid device alert list")
        return alerts

    def report_device_alert(
        self, event: dict[str, object], username: str, password: str
    ) -> dict[str, object]:
        encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
        result = self.request(
            "POST",
            "/device-management/device-alert-events",
            event,
            {"Authorization": f"Basic {encoded}"},
        )
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid device alert")
        return result

    def report_device_log(
        self, event: dict[str, object], username: str, password: str
    ) -> dict[str, object]:
        encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
        result = self.request(
            "POST",
            "/device-management/device-log-events",
            event,
            {"Authorization": f"Basic {encoded}"},
        )
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid device log")
        return result

    def list_device_logs(self, device_id: str) -> list[dict[str, object]]:
        logs = self.request(
            "GET",
            f"/device-management/devices/{urllib.parse.quote(device_id, safe='')}/logs",
        )
        if not isinstance(logs, list) or any(not isinstance(entry, dict) for entry in logs):
            raise RuntimeError("Core API returned an invalid device log list")
        return logs

    def create_firmware_release(self, body: dict[str, object]) -> dict[str, object]:
        result = self.request("POST", "/device-management/firmware-releases", body)
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid firmware release")
        return result

    def upload_firmware_release(
        self,
        body: dict[str, str],
        file_name: str,
        firmware: bytes,
    ) -> dict[str, object]:
        boundary = f"----celesnity-{uuid.uuid4().hex}"
        parts: list[bytes] = []
        for name, value in body.items():
            parts.extend(
                [
                    f"--{boundary}\r\n".encode(),
                    f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                    value.encode(),
                    b"\r\n",
                ]
            )
        parts.extend(
            [
                f"--{boundary}\r\n".encode(),
                (
                    'Content-Disposition: form-data; name="file"; '
                    f'filename="{file_name}"\r\n'
                ).encode(),
                b"Content-Type: application/octet-stream\r\n\r\n",
                firmware,
                b"\r\n",
                f"--{boundary}--\r\n".encode(),
            ]
        )
        request = urllib.request.Request(
            f"{self.base_url}/device-management/firmware-releases/upload",
            data=b"".join(parts),
            method="POST",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.token}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.loads(response.read())
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            raise RuntimeError(
                f"Core API firmware upload failed ({error.code}): {detail}"
            ) from error
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid firmware release")
        return result

    def start_firmware_deployment(self, device_id: str, release_id: str) -> dict[str, object]:
        result = self.request(
            "POST",
            f"/device-management/devices/{device_id}/firmware-deployments",
            {"releaseId": release_id},
        )
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid firmware deployment")
        return result

    def create_firmware_campaign(
        self, name: str, release_id: str, device_ids: list[str]
    ) -> dict[str, object]:
        result = self.request(
            "POST",
            "/device-management/firmware-campaigns",
            {
                "name": name,
                "releaseId": release_id,
                "deviceIds": device_ids,
                "canarySize": 1,
                "batchSize": max(1, min(100, len(device_ids) - 1)),
            },
        )
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid firmware campaign")
        return result

    def transition_firmware_campaign(
        self, campaign_id: str, action: str
    ) -> dict[str, object]:
        if action not in {"start", "advance", "pause", "resume", "abort"}:
            raise RuntimeError("Unsupported firmware campaign action")
        result = self.request(
            "POST", f"/device-management/firmware-campaigns/{campaign_id}/{action}"
        )
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid firmware campaign transition")
        return result

    def start_firmware_campaign_target(
        self, campaign_id: str, device_id: str
    ) -> dict[str, object]:
        campaign = self.transition_firmware_campaign(campaign_id, "start")
        targets = campaign.get("targets")
        if not isinstance(targets, list):
            raise RuntimeError("Firmware campaign targets are missing")
        for target in targets:
            if not isinstance(target, dict) or target.get("deviceId") != device_id:
                continue
            deployment_id = target.get("deploymentId")
            if not isinstance(deployment_id, str):
                raise RuntimeError("Firmware campaign target was not dispatched")
            return {"id": deployment_id}
        raise RuntimeError("Firmware campaign does not contain the requested device")

    def list_firmware_deployments(self, device_id: str) -> list[dict[str, object]]:
        deployments = self.request(
            "GET", f"/device-management/devices/{device_id}/firmware-deployments"
        )
        if not isinstance(deployments, list) or any(
            not isinstance(deployment, dict) for deployment in deployments
        ):
            raise RuntimeError("Core API returned an invalid firmware deployment list")
        return deployments

    def report_firmware_event(
        self,
        event_path: str,
        event_token: str,
        status: str,
        progress_percent: int,
    ) -> dict[str, object]:
        result = self.request(
            "POST",
            event_path,
            {"status": status, "progressPercent": progress_percent},
            {"X-Firmware-Event-Token": event_token},
        )
        if not isinstance(result, dict):
            raise RuntimeError("Core API returned an invalid firmware event response")
        return result


class ResumableFirmwareDownloader:
    """Downloads fixed-size ranges while retaining verified progress between retries."""

    def __init__(
        self,
        fetch_range: Callable[[str, int, int], bytes] | None = None,
        partials: dict[str, bytearray] | None = None,
        max_attempts_per_chunk: int = 3,
    ) -> None:
        self.fetch_range = fetch_range or download_firmware_range
        self.partials = partials if partials is not None else {}
        self.max_attempts_per_chunk = max_attempts_per_chunk

    def download(self, deployment_id: str, url: str, size: int, chunk_size: int) -> bytes:
        if size <= 0 or size > 64 * 1024 * 1024:
            raise RuntimeError("Firmware artifact size is outside the supported range")
        if chunk_size <= 0 or chunk_size > 4 * 1024 * 1024:
            raise RuntimeError("Firmware download chunk size is outside the supported range")
        partial = self.partials.setdefault(deployment_id, bytearray())
        if len(partial) > size:
            partial.clear()
        while len(partial) < size:
            start = len(partial)
            end = min(size, start + chunk_size) - 1
            last_error: Exception | None = None
            for _attempt in range(self.max_attempts_per_chunk):
                try:
                    chunk = self.fetch_range(url, start, end)
                    if len(chunk) != end - start + 1:
                        raise RuntimeError("Firmware range response has an unexpected size")
                    partial.extend(chunk)
                    last_error = None
                    break
                except Exception as error:
                    last_error = error
            if last_error is not None:
                raise last_error
        firmware = bytes(partial)
        del self.partials[deployment_id]
        return firmware


class ReferenceABBootloader:
    """Persistent-state model of an A/B bootloader with automatic rollback."""

    def __init__(
        self,
        persistent_state: dict[str, object] | None = None,
        now: Callable[[], float] = time.monotonic,
    ) -> None:
        self.state = persistent_state if persistent_state is not None else {}
        self.now = now
        self.state.setdefault("activeSlot", "A")
        self.state.setdefault("confirmedSlot", "A")
        self.state.setdefault("slots", {"A": "1.0.0-sim", "B": None})

    def stage_and_boot(
        self,
        deployment_id: str,
        version: str,
        firmware: bytes,
        confirmation_timeout: int,
        event_path: str | None = None,
        event_token: str | None = None,
    ) -> str:
        if confirmation_timeout <= 0:
            raise RuntimeError("Boot confirmation timeout must be positive")
        active_slot = str(self.state["activeSlot"])
        target_slot = "B" if active_slot == "A" else "A"
        slots = self.state["slots"]
        if not isinstance(slots, dict):
            raise RuntimeError("Boot slot state is corrupt")
        slots[target_slot] = version
        self.state["pending"] = {
            "deploymentId": deployment_id,
            "previousSlot": active_slot,
            "targetSlot": target_slot,
            "version": version,
            "sha256": hashlib.sha256(firmware).hexdigest(),
            "deadline": self.now() + confirmation_timeout,
            "eventPath": event_path,
            "eventToken": event_token,
        }
        self.state["activeSlot"] = target_slot
        return target_slot

    def confirm(self, version: str) -> bool:
        pending = self.state.get("pending")
        slots = self.state["slots"]
        if not isinstance(pending, dict) or not isinstance(slots, dict):
            return False
        active_slot = str(self.state["activeSlot"])
        if pending.get("version") != version or slots.get(active_slot) != version:
            return False
        self.state["confirmedSlot"] = active_slot
        del self.state["pending"]
        return True

    def recover_if_unconfirmed(self) -> bool:
        pending = self.state.get("pending")
        if not isinstance(pending, dict) or self.now() < float(pending["deadline"]):
            return False
        self.state["activeSlot"] = str(pending["previousSlot"])
        self.state["confirmedSlot"] = str(pending["previousSlot"])
        self.state["lastRollback"] = pending.copy()
        del self.state["pending"]
        return True


class FirmwareCommandProcessor:
    """Resumes, verifies, stages, and boots a managed OTA artifact."""

    def __init__(
        self,
        api: CoreApi,
        download: Callable[[str], bytes] | None = None,
        allow_http: bool = False,
        trusted_public_keys: dict[str, bytes] | None = None,
        downloader: ResumableFirmwareDownloader | None = None,
        bootloader: ReferenceABBootloader | None = None,
    ) -> None:
        self.api = api
        self.download = download or download_firmware
        self.allow_http = allow_http
        self.trusted_public_keys = trusted_public_keys or {}
        self.downloader = downloader or ResumableFirmwareDownloader()
        self.bootloader = bootloader or ReferenceABBootloader()

    def process(self, command: dict[str, object]) -> list[str]:
        required = (
            "deploymentId",
            "version",
            "artifactUrl",
            "artifactSizeBytes",
            "sha256",
            "signature",
            "signingKeyId",
            "signaturePayload",
            "eventPath",
            "eventToken",
            "download",
            "boot",
        )
        if command.get("type") != "firmware.install":
            raise RuntimeError("Unsupported firmware command type")
        string_fields = tuple(key for key in required if key not in {"artifactSizeBytes", "download", "boot"})
        if any(not isinstance(command.get(key), str) or not command[key] for key in string_fields):
            raise RuntimeError("Firmware command is missing a required string")
        artifact_size = command.get("artifactSizeBytes")
        download_policy = command.get("download")
        boot_policy = command.get("boot")
        if not isinstance(artifact_size, int) or artifact_size <= 0:
            raise RuntimeError("Firmware command artifact size is invalid")
        if (
            not isinstance(download_policy, dict)
            or download_policy.get("resumable") is not True
            or not isinstance(download_policy.get("chunkSizeBytes"), int)
        ):
            raise RuntimeError("Firmware command does not require a resumable download")
        if (
            not isinstance(boot_policy, dict)
            or boot_policy.get("strategy") != "A_B"
            or not isinstance(boot_policy.get("confirmationTimeoutSeconds"), int)
        ):
            raise RuntimeError("Firmware command does not require an A/B boot strategy")
        artifact_url = str(command["artifactUrl"])
        if not artifact_url.startswith("https://") and not (
            self.allow_http and artifact_url.startswith("http://")
        ):
            raise RuntimeError("Firmware artifact URL must use HTTPS")
        if len(str(command["sha256"])) != 64:
            raise RuntimeError("Firmware command SHA-256 digest is invalid")
        public_key = self.trusted_public_keys.get(str(command["signingKeyId"]))
        if public_key is None:
            raise RuntimeError("Firmware signing key is not trusted")
        try:
            signature_payload = str(command["signaturePayload"])
            Ed25519PublicKey.from_public_bytes(public_key).verify(
                base64.b64decode(str(command["signature"]), validate=True),
                signature_payload.encode(),
            )
            manifest = json.loads(signature_payload)
        except (InvalidSignature, ValueError, json.JSONDecodeError) as error:
            self.api.report_firmware_event(
                str(command["eventPath"]), str(command["eventToken"]), "FAILED", 25
            )
            raise RuntimeError("Firmware manifest signature verification failed") from error
        expected_manifest = {
            "schemaVersion": 1,
            "version": command["version"],
            "deviceModel": command["deviceModel"],
            "hardwareRevision": command.get("hardwareRevision"),
            "artifactSizeBytes": artifact_size,
            "sha256": command["sha256"],
        }
        if manifest != expected_manifest:
            self.api.report_firmware_event(
                str(command["eventPath"]), str(command["eventToken"]), "FAILED", 25
            )
            raise RuntimeError("Signed firmware manifest does not match the OTA command")
        expected_path = f"/device-management/firmware-deployments/{command['deploymentId']}/events"
        if command["eventPath"] != expected_path:
            raise RuntimeError("Firmware event path does not match the deployment")

        initial_states = [("ACCEPTED", 0), ("DOWNLOADING", 25)]
        for status, progress in initial_states:
            self.api.report_firmware_event(
                str(command["eventPath"]), str(command["eventToken"]), status, progress
            )
        try:
            firmware = (
                self.download(artifact_url)
                if self.download is not download_firmware
                else self.downloader.download(
                    str(command["deploymentId"]),
                    artifact_url,
                    artifact_size,
                    int(download_policy["chunkSizeBytes"]),
                )
            )
            if len(firmware) != artifact_size:
                raise RuntimeError("Downloaded firmware size does not match the release")
            actual_sha256 = hashlib.sha256(firmware).hexdigest()
            if not hmac.compare_digest(actual_sha256, str(command["sha256"]).lower()):
                raise RuntimeError("Downloaded firmware SHA-256 does not match the release")
        except Exception:
            self.api.report_firmware_event(
                str(command["eventPath"]), str(command["eventToken"]), "FAILED", 25
            )
            raise

        install_states = [("VERIFYING", 60), ("INSTALLING", 80)]
        for status, progress in install_states:
            self.api.report_firmware_event(
                str(command["eventPath"]), str(command["eventToken"]), status, progress
            )
        self.bootloader.stage_and_boot(
            str(command["deploymentId"]),
            str(command["version"]),
            firmware,
            int(boot_policy["confirmationTimeoutSeconds"]),
            str(command["eventPath"]),
            str(command["eventToken"]),
        )
        self.api.report_firmware_event(
            str(command["eventPath"]), str(command["eventToken"]), "REBOOTING", 95
        )
        states = [*initial_states, *install_states, ("REBOOTING", 95)]
        return [status for status, _progress in states]

    def recover_unconfirmed_boot(self) -> bool:
        if not self.bootloader.recover_if_unconfirmed():
            return False
        rollback = self.bootloader.state.get("lastRollback")
        if not isinstance(rollback, dict):
            raise RuntimeError("Bootloader rollback metadata is missing")
        event_path = rollback.get("eventPath")
        event_token = rollback.get("eventToken")
        if not isinstance(event_path, str) or not isinstance(event_token, str):
            raise RuntimeError("Bootloader rollback callback is missing")
        self.api.report_firmware_event(event_path, event_token, "ROLLED_BACK", 95)
        return True


def download_firmware(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as response:
        firmware = response.read(64 * 1024 * 1024 + 1)
    if len(firmware) == 0 or len(firmware) > 64 * 1024 * 1024:
        raise RuntimeError("Downloaded firmware must contain between 1 byte and 64 MiB")
    return firmware


def download_firmware_range(url: str, start: int, end: int) -> bytes:
    request = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
    with urllib.request.urlopen(request, timeout=60) as response:
        status = getattr(response, "status", 200)
        chunk = response.read(end - start + 2)
    if status != 206 and start != 0:
        raise RuntimeError("Firmware server did not honor the resume range")
    if len(chunk) > end - start + 1:
        raise RuntimeError("Firmware range response exceeded the requested size")
    return chunk


def parse_firmware_public_keys(value: str) -> dict[str, bytes]:
    result: dict[str, bytes] = {}
    for entry in value.split(","):
        key_id, separator, encoded = entry.partition(":")
        if not separator or not key_id:
            raise RuntimeError("Firmware public key entry is invalid")
        public_key = base64.b64decode(encoded, validate=True)
        if len(public_key) != 32:
            raise RuntimeError(f"Firmware public key {key_id} must contain 32 bytes")
        result[key_id] = public_key
    return result


def device_from(registration: dict[str, object]) -> dict[str, object]:
    device = registration.get("device")
    if not isinstance(device, dict):
        raise RuntimeError("Registration does not contain a device")
    return device


def credentials_from(registration: dict[str, object]) -> tuple[str, str]:
    credential = registration.get("credential")
    if not isinstance(credential, dict):
        raise RuntimeError("Registration does not contain credentials")
    username, password = credential.get("username"), credential.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise RuntimeError("Registration credentials are invalid")
    return username, password


def local_owner_token(signing_key: str, now: int | None = None) -> str:
    """Create the same short-lived local-development identity token as Web."""
    if len(signing_key) < 32:
        raise RuntimeError("DEVICE_SIM_LOCAL_AUTH_SIGNING_KEY must contain at least 32 characters")
    issued_at = int(time.time()) if now is None else now

    def encode(value: dict[str, object]) -> str:
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    header = encode({"alg": "HS256", "typ": "JWT"})
    payload = encode(
        {
            "iss": "celesnity-local-development",
            "aud": "celesnity-core-local",
            "sub": "local-owner",
            "tid": "local",
            "email": "owner@local.celesnity.test",
            "email_verified": True,
            "mfa_verified": True,
            "iat": issued_at,
            "exp": issued_at + 3600,
            "auth_time": issued_at,
            "sid": str(uuid.uuid4()),
        }
    )
    signing_input = f"{header}.{payload}"
    signature = base64.urlsafe_b64encode(
        hmac.new(signing_key.encode(), signing_input.encode(), hashlib.sha256).digest()
    ).rstrip(b"=").decode()
    return f"{signing_input}.{signature}"


def mqtt_publish(
    broker_host: str,
    broker_port: int,
    username: str,
    password: str,
    messages: list[tuple[str, dict[str, object]]],
) -> None:
    import paho.mqtt.client as mqtt

    connected = False
    connection_error: str | None = None

    def on_connect(_client: mqtt.Client, _userdata: object, _flags: object, reason_code: object, _properties: object) -> None:
        nonlocal connected, connection_error
        code = getattr(reason_code, "value", reason_code)
        if int(code) != 0:
            connection_error = f"MQTT connection rejected: {reason_code}"
            return
        connected = True

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
    client.username_pw_set(username, password)
    client.on_connect = on_connect
    client.connect(broker_host, broker_port, keepalive=30)
    client.loop_start()
    deadline = time.monotonic() + 15
    while not connected and connection_error is None and time.monotonic() < deadline:
        time.sleep(0.05)
    if connection_error is not None:
        client.loop_stop()
        raise RuntimeError(connection_error)
    if not connected:
        client.loop_stop()
        raise RuntimeError("Timed out connecting the virtual gateway to MQTT")
    for topic, payload in messages:
        published = client.publish(topic, json.dumps(payload), qos=1, retain=False)
        published.wait_for_publish(timeout=10)
        if not published.is_published():
            raise RuntimeError("Virtual gateway telemetry was not acknowledged")
    client.disconnect()
    client.loop_stop()


def mqtt_validate_configuration(
    broker_host: str,
    broker_port: int,
    username: str,
    password: str,
    command_topic: str,
    processor: ConfigurationCommandProcessor,
    push_configuration: Callable[[], dict[str, object]],
) -> tuple[dict[str, object], int]:
    """Subscribe first, receive the retained command, and acknowledge its atomic apply."""
    import paho.mqtt.client as mqtt

    subscribed = False
    applied_version: int | None = None
    callback_error: Exception | None = None

    def on_connect(
        client: mqtt.Client,
        _userdata: object,
        _flags: object,
        reason_code: object,
        _properties: object,
    ) -> None:
        code = getattr(reason_code, "value", reason_code)
        if int(code) == 0:
            client.subscribe(command_topic, qos=1)

    def on_subscribe(
        _client: mqtt.Client,
        _userdata: object,
        _mid: int,
        _reason_codes: object,
        _properties: object,
    ) -> None:
        nonlocal subscribed
        subscribed = True

    def on_message(
        _client: mqtt.Client, _userdata: object, message: mqtt.MQTTMessage
    ) -> None:
        nonlocal applied_version, callback_error
        if not message.payload:
            return
        try:
            command = json.loads(message.payload)
            if not isinstance(command, dict):
                raise RuntimeError("Configuration command payload is not an object")
            applied_version = processor.process(command)
        except Exception as error:  # surfaced to the main simulator thread
            callback_error = error

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
    client.username_pw_set(username, password)
    client.on_connect = on_connect
    client.on_subscribe = on_subscribe
    client.on_message = on_message
    client.connect(broker_host, broker_port, keepalive=30)
    client.loop_start()
    deadline = time.monotonic() + 15
    while not subscribed and time.monotonic() < deadline:
        time.sleep(0.05)
    if not subscribed:
        client.disconnect()
        client.loop_stop()
        raise RuntimeError("Timed out subscribing to the configuration command topic")

    configuration = push_configuration()
    deadline = time.monotonic() + 15
    while applied_version is None and callback_error is None and time.monotonic() < deadline:
        time.sleep(0.05)
    client.disconnect()
    client.loop_stop()
    if callback_error is not None:
        raise RuntimeError(
            f"Configuration command processing failed: {callback_error}"
        ) from callback_error
    if applied_version is None:
        raise RuntimeError("Timed out waiting for the configuration command")
    return configuration, applied_version


def mqtt_validate_firmware_deployment(
    broker_host: str,
    broker_port: int,
    username: str,
    password: str,
    command_topic: str,
    processor: FirmwareCommandProcessor,
    start_deployment: Callable[[], dict[str, object]],
) -> tuple[dict[str, object], list[str]]:
    """Subscribe first, dispatch through Core, then process the received OTA command."""
    import paho.mqtt.client as mqtt

    connected = False
    subscribed = False
    command_states: list[str] = []
    callback_error: Exception | None = None

    def on_connect(client: mqtt.Client, _userdata: object, _flags: object, reason_code: object, _properties: object) -> None:
        nonlocal connected
        code = getattr(reason_code, "value", reason_code)
        if int(code) != 0:
            return
        connected = True
        client.subscribe(command_topic, qos=1)

    def on_subscribe(_client: mqtt.Client, _userdata: object, _mid: int, _reason_codes: object, _properties: object) -> None:
        nonlocal subscribed
        subscribed = True

    def on_message(_client: mqtt.Client, _userdata: object, message: mqtt.MQTTMessage) -> None:
        nonlocal command_states, callback_error
        try:
            decoded = json.loads(message.payload)
            if not isinstance(decoded, dict):
                raise RuntimeError("Firmware command payload is not an object")
            command_states = processor.process(decoded)
        except Exception as error:  # surfaced to the main simulator thread
            callback_error = error

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
    client.username_pw_set(username, password)
    client.on_connect = on_connect
    client.on_subscribe = on_subscribe
    client.on_message = on_message
    client.connect(broker_host, broker_port, keepalive=30)
    client.loop_start()
    deadline = time.monotonic() + 15
    while not subscribed and time.monotonic() < deadline:
        time.sleep(0.05)
    if not connected or not subscribed:
        client.disconnect()
        client.loop_stop()
        raise RuntimeError("Timed out subscribing to the firmware command topic")

    deployment = start_deployment()
    deadline = time.monotonic() + 30
    while not command_states and callback_error is None and time.monotonic() < deadline:
        time.sleep(0.05)
    client.disconnect()
    client.loop_stop()
    if callback_error is not None:
        raise RuntimeError(f"Firmware command processing failed: {callback_error}") from callback_error
    if not command_states:
        raise RuntimeError("Timed out waiting for the firmware command")
    return deployment, command_states


class PersistentMqttCommandListener:
    """Processes UI-triggered configuration and OTA commands for running devices."""

    def __init__(
        self,
        api: CoreApi,
        broker_host: str,
        broker_port: int,
        username: str,
        password: str,
        devices: list[SimulatedPresenceDevice],
        gateway_id: str,
        device_topics: dict[str, tuple[str, str, str]],
        allow_http: bool,
        trusted_public_keys: dict[str, bytes],
    ) -> None:
        import paho.mqtt.client as mqtt

        self.api = api
        self.devices = {device.device_id: device for device in devices}
        self.gateway_id = gateway_id
        self.telemetry_topics: dict[str, str] = {}
        self.telemetry_sequences: dict[str, int] = {}
        self.topic_routes: dict[str, tuple[str, str]] = {}
        self.configuration_processors: dict[str, ConfigurationCommandProcessor] = {}
        self.firmware_processors: dict[str, FirmwareCommandProcessor] = {}
        for device_id, (
            telemetry_topic,
            configuration_topic,
            firmware_topic,
        ) in device_topics.items():
            device = self.devices[device_id]
            self.telemetry_topics[device_id] = telemetry_topic
            self.telemetry_sequences[device_id] = 0
            self.topic_routes[configuration_topic] = (device_id, "configuration")
            self.topic_routes[firmware_topic] = (device_id, "firmware")
            self.configuration_processors[device_id] = ConfigurationCommandProcessor(
                api, device.configuration_version
            )
            self.firmware_processors[device_id] = FirmwareCommandProcessor(
                api,
                allow_http=allow_http,
                trusted_public_keys=trusted_public_keys,
                bootloader=ReferenceABBootloader(),
            )
        self.connected = False
        self.subscribed = False
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
        self.client.username_pw_set(username, password)
        self.client.on_connect = self._on_connect
        self.client.on_subscribe = self._on_subscribe
        self.client.on_message = self._on_message
        self.client.connect(broker_host, broker_port, keepalive=30)

    def _on_connect(
        self,
        client: object,
        _userdata: object,
        _flags: object,
        reason_code: object,
        _properties: object,
    ) -> None:
        code = getattr(reason_code, "value", reason_code)
        if int(code) != 0:
            self._log_error("mqtt-connect", None, RuntimeError(str(reason_code)))
            return
        self.connected = True
        client.subscribe([(topic, 1) for topic in self.topic_routes])

    def _on_subscribe(
        self,
        _client: object,
        _userdata: object,
        _mid: int,
        _reason_codes: object,
        _properties: object,
    ) -> None:
        self.subscribed = True

    def _on_message(self, _client: object, _userdata: object, message: object) -> None:
        route = self.topic_routes.get(str(message.topic))
        if route is None or not message.payload:
            return
        device_id, command_kind = route
        try:
            command = json.loads(message.payload)
            if not isinstance(command, dict):
                raise RuntimeError("MQTT command payload is not an object")
            device = self.devices[device_id]
            if command_kind == "configuration":
                version = command.get("version")
                if isinstance(version, int) and version <= device.configuration_version:
                    return
                device.configuration_version = self.configuration_processors[
                    device_id
                ].process(command)
                self._log_processed(device_id, command_kind, str(device.configuration_version))
            else:
                self.firmware_processors[device_id].process(command)
                device.firmware_version = str(command["version"])
                self._log_processed(device_id, command_kind, device.firmware_version)
        except Exception as error:
            self._log_error(command_kind, device_id, error)

    def start(self) -> None:
        self.client.loop_start()
        deadline = time.monotonic() + 15
        while not self.subscribed and time.monotonic() < deadline:
            time.sleep(0.05)
        if not self.connected or not self.subscribed:
            self.client.disconnect()
            self.client.loop_stop()
            raise RuntimeError("Timed out subscribing to persistent device command topics")

    def after_heartbeat(self, device: SimulatedPresenceDevice) -> None:
        processor = self.firmware_processors.get(device.device_id)
        if processor is not None:
            processor.bootloader.confirm(device.firmware_version)
        sequence = self.telemetry_sequences[device.device_id] + 1
        self.telemetry_sequences[device.device_id] = sequence
        observed_at = datetime.now(UTC).isoformat()
        if device.device_id == self.gateway_id:
            payload: dict[str, object] = {
                "eventId": str(uuid.uuid4()),
                "eventTime": observed_at,
                "gatewayId": self.gateway_id,
                "deviceId": device.device_id,
                "sequence": sequence,
                "cpuLoadPercent": round(random.uniform(8, 45), 1),
                "memoryUsedPercent": round(random.uniform(25, 60), 1),
                "uplink": "ETHERNET",
                "connectedSensors": len(self.devices) - 1,
                "transport": "SIMULATED_GATEWAY",
            }
        else:
            payload = {
                "eventId": str(uuid.uuid4()),
                "eventTime": observed_at,
                "gatewayId": self.gateway_id,
                "deviceId": device.device_id,
                "sequence": sequence,
                "temperature": round(random.uniform(20, 35), 2),
                "batteryPercent": random.randint(70, 100),
                "radio": {
                    "rssi": random.randint(-115, -70),
                    "snr": round(random.uniform(-5, 10), 1),
                },
                "transport": "SIMULATED_LORA",
            }
        published = self.client.publish(
            self.telemetry_topics[device.device_id],
            json.dumps(payload),
            qos=1,
            retain=False,
        )
        published.wait_for_publish(timeout=10)
        if not published.is_published():
            raise RuntimeError("Continuous telemetry was not acknowledged by MQTT")

    @staticmethod
    def _log_processed(device_id: str, command_kind: str, version: str) -> None:
        print(
            json.dumps(
                {
                    "deviceCommandProcessed": command_kind,
                    "deviceId": device_id,
                    "version": version,
                    "processedAt": datetime.now(UTC).isoformat(),
                }
            ),
            flush=True,
        )

    @staticmethod
    def _log_error(command_kind: str, device_id: str | None, error: Exception) -> None:
        print(
            json.dumps(
                {
                    "deviceCommandError": command_kind,
                    "deviceId": device_id,
                    "error": str(error),
                    "observedAt": datetime.now(UTC).isoformat(),
                }
            ),
            flush=True,
        )


def wait_until_ready(api: CoreApi, device_id: str) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        device = api.request("GET", f"/device-management/devices/{device_id}")
        if isinstance(device, dict) and device.get("status") == "ACTIVE":
            return
        time.sleep(0.5)
    raise RuntimeError(f"Device {device_id} did not become MQTT-ready")


def wait_for_firmware_success(
    api: CoreApi, device_id: str, deployment_id: str, timeout_seconds: float = 10
) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        for deployment in api.list_firmware_deployments(device_id):
            if deployment.get("id") == deployment_id and deployment.get("status") == "SUCCEEDED":
                return
        time.sleep(0.25)
    raise RuntimeError("Firmware deployment was not confirmed by the post-reboot heartbeat")


def wait_for_loss_of_contact_alert(
    api: CoreApi, device_id: str, status: str, timeout_seconds: float
) -> dict[str, object]:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        for alert in api.list_device_alerts(device_id):
            if alert.get("type") == "LOSS_OF_CONTACT" and alert.get("status") == status:
                return alert
        time.sleep(0.5)
    raise RuntimeError(
        f"Device {device_id} did not produce a {status} loss-of-contact alert"
    )


def run() -> dict[str, object]:
    signing_key = os.getenv(
        "DEVICE_SIM_LOCAL_AUTH_SIGNING_KEY",
        "device-simulator-local-signing-key-change-me",
    )
    token = os.getenv("DEVICE_SIM_API_TOKEN") or local_owner_token(signing_key)
    api = CoreApi(os.getenv("DEVICE_SIM_CORE_API_URL", "http://localhost:3301/api/v1"), token)
    adapter_id = os.getenv("DEVICE_SIM_ADAPTER_ID") or api.first_active_adapter()
    run_id = uuid.uuid4().hex[:8]
    site = os.getenv("DEVICE_SIM_SITE", "Virtual Factory 1")
    gateway_registration = api.register(
        {
            "adapterId": adapter_id,
            "externalDeviceId": f"virtual-gateway-{run_id}",
            "deviceType": "GATEWAY",
            "name": "Virtual Factory Gateway",
            "model": "CEL-GW-SIM",
            "hardwareRevision": "sim-a",
            "currentFirmwareVersion": "1.0.0-sim",
            "deploymentSite": site,
            "physicalLocation": "Virtual control room",
        }
    )
    gateway = device_from(gateway_registration)
    gateway_id = str(gateway["id"])
    username, password = credentials_from(gateway_registration)
    gateway_firmware_version = "1.0.0-sim"
    api.advance_lifecycle(gateway_id, ["COMMISSIONED", "ACTIVE"])

    sensors: list[dict[str, object]] = []
    sensor_firmware_versions: dict[str, str] = {}
    for index in range(1, int(os.getenv("DEVICE_SIM_SENSOR_COUNT", "3")) + 1):
        registration = api.register(
            {
                "adapterId": adapter_id,
                "externalDeviceId": f"virtual-sensor-{run_id}-{index}",
                "deviceType": "SENSOR",
                "name": f"Virtual temperature sensor {index}",
                "model": "CEL-T-SIM",
                "hardwareRevision": "sim-a",
                "currentFirmwareVersion": "1.0.0-sim",
                "deploymentSite": site,
                "physicalLocation": f"Virtual production line / station {index}",
                "gatewayId": gateway_id,
                "measurementPointKey": f"virtual-temperature-{run_id}-{index}",
                "measurementPointName": f"Virtual temperature point {index}",
            }
        )
        sensor = device_from(registration)
        sensor_id = str(sensor["id"])
        sensor_firmware_versions[sensor_id] = "1.0.0-sim"
        api.advance_lifecycle(sensor_id, ["COMMISSIONED", "ACTIVE"])
        wait_until_ready(api, sensor_id)
        sensors.append(sensor)

    virtual_gateway = VirtualGateway(gateway_id, {str(sensor["id"]) for sensor in sensors})
    telemetry_messages: list[tuple[str, dict[str, object]]] = []
    for sequence, sensor in enumerate(sensors, start=1):
        observed_at = datetime.now(UTC).isoformat()
        frame = SensorFrame(
            sensor_id=str(sensor["id"]),
            sequence=sequence,
            temperature=round(random.uniform(20, 35), 2),
            battery_percent=random.randint(70, 100),
            rssi=random.randint(-115, -70),
            snr=round(random.uniform(-5, 10), 1),
            observed_at=observed_at,
        )
        relayed = virtual_gateway.relay(frame)
        if relayed is not None:
            sensor_topics = sensor.get("topics")
            if not isinstance(sensor_topics, dict) or not isinstance(
                sensor_topics.get("telemetry"), str
            ):
                raise RuntimeError("Sensor telemetry topic is missing")
            telemetry_messages.append((sensor_topics["telemetry"], relayed))
            api.check_in(frame.sensor_id, "1.0.0-sim", username, password)

    forged = SensorFrame(
        sensor_id=str(uuid.uuid4()),
        sequence=999,
        temperature=99,
        battery_percent=1,
        rssi=-120,
        snr=-20,
        observed_at=datetime.now(UTC).isoformat(),
    )
    if virtual_gateway.relay(forged) is not None:
        raise RuntimeError("Virtual gateway accepted an unbound sensor")

    wait_until_ready(api, gateway_id)
    topics = gateway.get("topics")
    if not isinstance(topics, dict) or not isinstance(topics.get("telemetry"), str):
        raise RuntimeError("Gateway topics are missing")
    mqtt_publish(
        os.getenv("DEVICE_SIM_MQTT_HOST", "localhost"),
        int(os.getenv("DEVICE_SIM_MQTT_PORT", "1883")),
        username,
        password,
        telemetry_messages,
    )
    reported_alert_id: str | None = None
    if sensors and os.getenv("DEVICE_SIM_VALIDATE_DEVICE_ALERTS", "true").lower() == "true":
        alert_buffer = DeviceAlertBuffer(api, username, password)
        alert_buffer.observe_low_threshold(
            str(sensors[0]["id"]),
            "RADIO_DEGRADED",
            "WARNING",
            -118,
            -110,
            5,
            datetime.now(UTC).isoformat(),
            "rssi",
        )
        if alert_buffer.flush() != 1:
            raise RuntimeError("Buffered sensor alert was not delivered")
        device_alerts = api.list_device_alerts(str(sensors[0]["id"]))
        reported = next(
            (alert for alert in device_alerts if alert.get("type") == "RADIO_DEGRADED"),
            None,
        )
        if reported is None:
            raise RuntimeError("Core did not retain the device-originated alert")
        reported_alert_id = str(reported["id"])
    configuration: dict[str, object] | None = None
    applied_configuration_version = 0
    if os.getenv("DEVICE_SIM_VALIDATE_CONFIGURATION", "true").lower() == "true":
        configuration_command_topic = (
            topics["telemetry"][: -len("/telemetry")] + "/commands/configuration"
        )
    configuration_template: dict[str, object] | None = None
    configuration_template_deployment: dict[str, object] | None = None
    if sensors and os.getenv("DEVICE_SIM_VALIDATE_GROUP_CONFIGURATION", "true").lower() == "true":
        configuration_template = api.create_configuration_template(
            f"Virtual factory sensors {run_id}",
            {
                "samplingRateHz": 1,
                "reportingIntervalSeconds": 60,
                "channels": {"temperature": True},
                "logLevel": "WARNING",
            },
        )
        configuration_template_deployment = api.deploy_configuration_template(
            str(configuration_template["id"]), site, "SENSOR"
        )
        target_count = configuration_template_deployment.get("targetCount")
        if not isinstance(target_count, int) or target_count < len(sensors):
            raise RuntimeError("Group configuration did not snapshot every site sensor")
        failures = configuration_template_deployment.get("failures")
        if not isinstance(failures, list) or failures:
            raise RuntimeError("Group configuration dispatch reported a target failure")
        configuration, applied_configuration_version = mqtt_validate_configuration(
            os.getenv("DEVICE_SIM_MQTT_HOST", "localhost"),
            int(os.getenv("DEVICE_SIM_MQTT_PORT", "1883")),
            username,
            password,
            configuration_command_topic,
            ConfigurationCommandProcessor(api),
            lambda: api.push_configuration(
                gateway_id,
                {
                    "samplingRateHz": 2,
                    "reportingIntervalSeconds": 30,
                    "channels": {"temperature": True},
                    "diagnosticLogging": ["CPU_LOAD", "UPTIME"],
                    "logLevel": "WARNING",
                    "alertThresholds": {"batteryPercentLow": 10},
                },
            ),
        )
    reported_device_log_ids: list[str] = []
    if os.getenv("DEVICE_SIM_VALIDATE_DEVICE_LOGS", "true").lower() == "true":
        log_state: dict[str, object] = {}
        log_buffer = PersistentCircularLogBuffer(
            api, username, password, log_state, capacity=8, log_level="WARNING"
        )
        if log_buffer.record(
            gateway_id,
            "INFO",
            "OPERATIONAL",
            "Routine sample completed",
            {"sampleCount": len(telemetry_messages)},
            datetime.now(UTC).isoformat(),
        ):
            raise RuntimeError("Runtime WARNING log level did not suppress INFO diagnostics")
        log_buffer.record(
            gateway_id,
            "WARNING",
            "OPERATIONAL",
            "LTE reconnect required",
            {"retry": 2},
            datetime.now(UTC).isoformat(),
        )
        target_log_device_id = str(sensors[0]["id"]) if sensors else gateway_id
        restarted_log_buffer = PersistentCircularLogBuffer(
            api, username, password, log_state, capacity=8, log_level="WARNING"
        )
        restarted_log_buffer.capture_fault(
            target_log_device_id,
            "WATCHDOG",
            "0x400d1234",
            ["0x400d1234", "0x400812ab"],
            "1.0.0-sim",
            datetime.now(UTC).isoformat(),
        )
        if restarted_log_buffer.flush() != 2:
            raise RuntimeError("Persistent device diagnostics were not delivered")
        for device_id in {gateway_id, target_log_device_id}:
            reported_device_log_ids.extend(
                str(entry["id"])
                for entry in api.list_device_logs(device_id)
                if entry.get("message")
                in {"LTE reconnect required", "Device restarted after watchdog reset"}
            )
        if len(reported_device_log_ids) != 2:
            raise RuntimeError("Core did not retain both simulated device diagnostics")
    api.check_in(
        gateway_id,
        "1.0.0-sim",
        username,
        password,
        applied_configuration_version,
    )
    contact_alert_id: str | None = None
    contact_alert_cleared = False
    if os.getenv("DEVICE_SIM_VALIDATE_LOSS_OF_CONTACT", "true").lower() == "true":
        raised_alert = wait_for_loss_of_contact_alert(
            api,
            gateway_id,
            "RAISED",
            float(os.getenv("DEVICE_SIM_CONTACT_ALERT_TIMEOUT_SECONDS", "30")),
        )
        contact_alert_id = str(raised_alert["id"])
        api.check_in(gateway_id, "1.0.0-sim", username, password)
        cleared_alert = wait_for_loss_of_contact_alert(api, gateway_id, "CLEARED", 10)
        contact_alert_cleared = cleared_alert.get("id") == contact_alert_id
        if not contact_alert_cleared:
            raise RuntimeError("Heartbeat did not clear the gateway loss-of-contact alert")
    firmware_deployment: dict[str, object] | None = None
    firmware_states: list[str] = []
    firmware_campaign: dict[str, object] | None = None
    firmware_campaign_status: str | None = None
    sensor_firmware_deployment: dict[str, object] | None = None
    sensor_firmware_states: list[str] = []
    if os.getenv("DEVICE_SIM_VALIDATE_OTA", "true").lower() == "true":
        firmware_version = f"1.0.1-sim-{run_id}"
        simulated_artifact = f"celesnity-simulated-firmware-{run_id}".encode()
        release = api.upload_firmware_release(
            {
                "version": firmware_version,
                "deviceModel": str(gateway["model"]),
                "hardwareRevision": str(gateway["hardwareRevision"]),
                "releaseNotes": "Managed OTA artifact uploaded and downloaded by the simulator.",
            },
            f"{firmware_version}.bin",
            simulated_artifact,
        )
        command_topic = topics.get("firmwareCommands")
        if not isinstance(command_topic, str):
            raise RuntimeError("Gateway firmware command topic is missing")
        validate_campaign = (
            os.getenv("DEVICE_SIM_VALIDATE_FIRMWARE_CAMPAIGN", "true").lower() == "true"
        )
        if validate_campaign:
            firmware_campaign = api.create_firmware_campaign(
                f"Virtual gateway canary {run_id}", str(release["id"]), [gateway_id]
            )
        start_gateway_deployment = (
            lambda: api.start_firmware_campaign_target(
                str(firmware_campaign["id"]), gateway_id
            )
            if firmware_campaign is not None
            else lambda: api.start_firmware_deployment(gateway_id, str(release["id"]))
        )
        gateway_boot_state: dict[str, object] = {}
        gateway_bootloader = ReferenceABBootloader(gateway_boot_state)
        gateway_firmware_processor = FirmwareCommandProcessor(
            api,
            allow_http=os.getenv("DEVICE_SIM_ALLOW_HTTP_ARTIFACTS", "false").lower()
            == "true",
            trusted_public_keys=parse_firmware_public_keys(
                os.getenv(
                    "DEVICE_SIM_FIRMWARE_SIGNING_PUBLIC_KEYS",
                    "local-dev:11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=",
                )
            ),
            bootloader=gateway_bootloader,
        )
        firmware_deployment, firmware_states = mqtt_validate_firmware_deployment(
            os.getenv("DEVICE_SIM_MQTT_HOST", "localhost"),
            int(os.getenv("DEVICE_SIM_MQTT_PORT", "1883")),
            username,
            password,
            command_topic,
            gateway_firmware_processor,
            start_gateway_deployment,
        )
        api.check_in(
            gateway_id,
            firmware_version,
            username,
            password,
            applied_configuration_version,
        )
        wait_for_firmware_success(api, gateway_id, str(firmware_deployment["id"]))
        if not gateway_bootloader.confirm(firmware_version):
            raise RuntimeError("Gateway bootloader did not confirm the running image")
        gateway_firmware_version = firmware_version
        firmware_states.append("SUCCEEDED")
        if firmware_campaign is not None:
            firmware_campaign = api.transition_firmware_campaign(
                str(firmware_campaign["id"]), "advance"
            )
            firmware_campaign_status = str(firmware_campaign.get("status"))
            if firmware_campaign_status != "COMPLETED":
                raise RuntimeError("Single-device firmware campaign did not complete")
        if sensors and os.getenv("DEVICE_SIM_VALIDATE_SENSOR_OTA", "true").lower() == "true":
            target_sensor = sensors[0]
            sensor_id = str(target_sensor["id"])
            sensor_firmware_version = f"1.0.1-sensor-sim-{run_id}"
            sensor_artifact = f"celesnity-simulated-sensor-firmware-{run_id}".encode()
            sensor_release = api.upload_firmware_release(
                {
                    "version": sensor_firmware_version,
                    "deviceModel": str(target_sensor["model"]),
                    "hardwareRevision": str(target_sensor["hardwareRevision"]),
                    "releaseNotes": "Sensor OTA relayed through its bound virtual gateway.",
                },
                f"{sensor_firmware_version}.bin",
                sensor_artifact,
            )
            sensor_topics = target_sensor.get("topics")
            if not isinstance(sensor_topics, dict) or not isinstance(
                sensor_topics.get("firmwareCommands"), str
            ):
                raise RuntimeError("Sensor firmware command topic is missing")
            sensor_bootloader = ReferenceABBootloader()
            sensor_firmware_deployment, sensor_firmware_states = (
                mqtt_validate_firmware_deployment(
                    os.getenv("DEVICE_SIM_MQTT_HOST", "localhost"),
                    int(os.getenv("DEVICE_SIM_MQTT_PORT", "1883")),
                    username,
                    password,
                    str(sensor_topics["firmwareCommands"]),
                    FirmwareCommandProcessor(
                        api,
                        allow_http=os.getenv(
                            "DEVICE_SIM_ALLOW_HTTP_ARTIFACTS", "false"
                        ).lower()
                        == "true",
                        trusted_public_keys=parse_firmware_public_keys(
                            os.getenv(
                                "DEVICE_SIM_FIRMWARE_SIGNING_PUBLIC_KEYS",
                                "local-dev:11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=",
                            )
                        ),
                        bootloader=sensor_bootloader,
                    ),
                    lambda: api.start_firmware_deployment(
                        sensor_id, str(sensor_release["id"])
                    ),
                )
            )
            api.check_in(sensor_id, sensor_firmware_version, username, password)
            wait_for_firmware_success(
                api, sensor_id, str(sensor_firmware_deployment["id"])
            )
            if not sensor_bootloader.confirm(sensor_firmware_version):
                raise RuntimeError("Sensor bootloader did not confirm the running image")
            sensor_firmware_versions[sensor_id] = sensor_firmware_version
            sensor_firmware_states.append("SUCCEEDED")
    result = {
        "gatewayId": gateway_id,
        "sensorIds": [sensor["id"] for sensor in sensors],
        "publishedTelemetry": len(telemetry_messages),
        "rejectedUnboundSensors": len(virtual_gateway.rejected_sensor_ids),
        "topics": [topic for topic, _payload in telemetry_messages],
        "configurationId": None if configuration is None else configuration["id"],
        "appliedConfigurationVersion": applied_configuration_version,
        "configurationTemplateId": None
        if configuration_template is None
        else configuration_template["id"],
        "configurationTemplateTargetCount": None
        if configuration_template_deployment is None
        else configuration_template_deployment["targetCount"],
        "contactAlertId": contact_alert_id,
        "contactAlertClearedByHeartbeat": contact_alert_cleared,
        "reportedDeviceAlertId": reported_alert_id,
        "reportedDeviceLogIds": reported_device_log_ids,
        "firmwareDeploymentId": None if firmware_deployment is None else firmware_deployment["id"],
        "firmwareStates": firmware_states,
        "firmwareCampaignId": None if firmware_campaign is None else firmware_campaign["id"],
        "firmwareCampaignStatus": firmware_campaign_status,
        "sensorFirmwareDeploymentId": None
        if sensor_firmware_deployment is None
        else sensor_firmware_deployment["id"],
        "sensorFirmwareStates": sensor_firmware_states,
    }
    if os.getenv("DEVICE_SIM_CONTINUOUS", "false").lower() == "true":
        print(json.dumps(result, indent=2), flush=True)
        presence_devices = [
            SimulatedPresenceDevice(
                gateway_id,
                gateway_firmware_version,
                applied_configuration_version,
            ),
            *[
                SimulatedPresenceDevice(
                    str(sensor["id"]),
                    sensor_firmware_versions[str(sensor["id"])],
                )
                for sensor in sensors
            ],
        ]
        configured_offline_target = os.getenv("DEVICE_SIM_OFFLINE_DEVICE_ID")
        offline_target = configured_offline_target or (
            str(sensors[0]["id"]) if sensors else gateway_id
        )
        registered_devices = [gateway, *sensors]
        device_topics: dict[str, tuple[str, str, str]] = {}
        for registered_device in registered_devices:
            registered_device_id = str(registered_device["id"])
            registered_topics = registered_device.get("topics")
            if not isinstance(registered_topics, dict):
                raise RuntimeError("Persistent device command topics are missing")
            telemetry_topic = registered_topics.get("telemetry")
            firmware_topic = registered_topics.get("firmwareCommands")
            if not isinstance(telemetry_topic, str) or not isinstance(
                firmware_topic, str
            ):
                raise RuntimeError("Persistent device command topic is invalid")
            device_topics[registered_device_id] = (
                telemetry_topic,
                telemetry_topic[: -len("/telemetry")] + "/commands/configuration",
                firmware_topic,
            )
        command_listener = PersistentMqttCommandListener(
            api,
            os.getenv("DEVICE_SIM_MQTT_HOST", "localhost"),
            int(os.getenv("DEVICE_SIM_MQTT_PORT", "1883")),
            username,
            password,
            presence_devices,
            gateway_id,
            device_topics,
            allow_http=os.getenv("DEVICE_SIM_ALLOW_HTTP_ARTIFACTS", "false").lower()
            == "true",
            trusted_public_keys=parse_firmware_public_keys(
                os.getenv(
                    "DEVICE_SIM_FIRMWARE_SIGNING_PUBLIC_KEYS",
                    "local-dev:11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=",
                )
            ),
        )
        command_listener.start()
        DevicePresenceSimulator(
            api,
            presence_devices,
            username,
            password,
            heartbeat_interval_seconds=float(
                os.getenv("DEVICE_SIM_HEARTBEAT_INTERVAL_SECONDS", "3")
            ),
            healthy_duration_seconds=float(
                os.getenv("DEVICE_SIM_HEALTHY_DURATION_SECONDS", "60")
            ),
            offline_duration_seconds=float(
                os.getenv("DEVICE_SIM_OFFLINE_DURATION_SECONDS", "30")
            ),
            offline_device_id=offline_target,
            offline_cycle_enabled=os.getenv(
                "DEVICE_SIM_OFFLINE_CYCLE_ENABLED", "true"
            ).lower()
            == "true",
            on_heartbeat=command_listener.after_heartbeat,
        ).run_forever()
    return result


if __name__ == "__main__":
    simulation_result = run()
    if os.getenv("DEVICE_SIM_CONTINUOUS", "false").lower() != "true":
        print(json.dumps(simulation_result, indent=2))
