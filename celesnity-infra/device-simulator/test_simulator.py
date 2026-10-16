import base64
import hashlib
import hmac
import io
import json
import unittest
from contextlib import redirect_stdout

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from simulator import (
    ConfigurationCommandProcessor,
    CoreApi,
    DeviceAlertBuffer,
    DevicePresenceSimulator,
    FirmwareCommandProcessor,
    PersistentCircularLogBuffer,
    ReferenceABBootloader,
    ResumableFirmwareDownloader,
    SensorFrame,
    SimulatedPresenceDevice,
    VirtualGateway,
    local_owner_token,
)


PRIVATE_KEY = base64.b64decode("nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=")
PUBLIC_KEY = base64.b64decode("11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=")


def sign(firmware: bytes) -> str:
    return base64.b64encode(Ed25519PrivateKey.from_private_bytes(PRIVATE_KEY).sign(firmware)).decode()


class FakeFirmwareApi:
    def __init__(self) -> None:
        self.events = []

    def report_firmware_event(self, path, token, status, progress):
        self.events.append((path, token, status, progress))
        return {"status": status, "progressPercent": progress}


class FakeConfigurationApi:
    def __init__(self, fail=False) -> None:
        self.fail = fail
        self.events = []

    def report_configuration_event(self, path, token, status, error=None):
        if self.fail:
            raise RuntimeError("simulated acknowledgement failure")
        self.events.append((path, token, status, error))
        return {"status": status}


class FakeAlertApi:
    def __init__(self, fail=False) -> None:
        self.fail = fail
        self.events = []

    def report_device_alert(self, event, _username, _password):
        if self.fail:
            raise RuntimeError("offline")
        self.events.append(event.copy())
        return event


class FakeLogApi:
    def __init__(self, fail=False) -> None:
        self.fail = fail
        self.events = []

    def report_device_log(self, event, _username, _password):
        if self.fail:
            raise RuntimeError("offline")
        self.events.append(event.copy())
        return event


class FakePresenceApi:
    def __init__(self, fail_device_id=None) -> None:
        self.check_ins = []
        self.fail_device_id = fail_device_id

    def check_in(
        self,
        device_id,
        firmware_version,
        username,
        password,
        configuration_version=0,
    ):
        if device_id == self.fail_device_id:
            raise RuntimeError("temporary Core outage")
        self.check_ins.append(
            (
                device_id,
                firmware_version,
                username,
                password,
                configuration_version,
            )
        )
        return {"id": device_id}


class FakeCampaignCoreApi(CoreApi):
    def __init__(self) -> None:
        self.requests = []

    def request(self, method, path, body=None, headers=None):
        self.requests.append((method, path, body, headers))
        if path == "/device-management/firmware-campaigns":
            return {"id": "campaign-1", "status": "DRAFT", "targets": []}
        if path.endswith("/start"):
            return {
                "id": "campaign-1",
                "status": "RUNNING",
                "targets": [
                    {"deviceId": "device-1", "deploymentId": "deployment-1"}
                ],
            }
        if path.endswith("/advance"):
            return {"id": "campaign-1", "status": "COMPLETED", "targets": []}
        raise AssertionError(f"Unexpected request: {method} {path}")


class FakeConfigurationTemplateCoreApi(CoreApi):
    def __init__(self) -> None:
        self.requests = []

    def request(self, method, path, body=None, headers=None):
        self.requests.append((method, path, body, headers))
        if path == "/device-management/device-configuration-templates":
            return {"id": "template-1", "name": body["name"], "version": 1}
        if path.endswith("/deployments"):
            return {"targetCount": 3, "configurations": [{}, {}, {}], "failures": []}
        raise AssertionError(f"Unexpected request: {method} {path}")


class DevicePresenceSimulatorTest(unittest.TestCase):
    def test_keeps_devices_healthy_then_takes_one_offline_and_recovers_it(self) -> None:
        clock = [0.0]
        api = FakePresenceApi()
        simulator = DevicePresenceSimulator(
            api,
            [
                SimulatedPresenceDevice("gateway", "1.1.0", 3),
                SimulatedPresenceDevice("sensor-1", "1.0.0"),
                SimulatedPresenceDevice("sensor-2", "1.0.0"),
            ],
            "gateway-user",
            "gateway-password",
            heartbeat_interval_seconds=3,
            healthy_duration_seconds=10,
            offline_duration_seconds=20,
            offline_device_id="sensor-1",
            now=lambda: clock[0],
        )

        self.assertFalse(simulator.tick())
        self.assertEqual(
            [check_in[0] for check_in in api.check_ins],
            ["gateway", "sensor-1", "sensor-2"],
        )

        api.check_ins.clear()
        clock[0] = 10.0
        self.assertTrue(simulator.tick())
        self.assertEqual(simulator.phase, DevicePresenceSimulator.OFFLINE)
        self.assertEqual(
            [check_in[0] for check_in in api.check_ins],
            ["gateway", "sensor-2"],
        )

        api.check_ins.clear()
        clock[0] = 30.0
        self.assertTrue(simulator.tick())
        self.assertEqual(simulator.phase, DevicePresenceSimulator.HEALTHY)
        self.assertEqual(
            [check_in[0] for check_in in api.check_ins],
            ["gateway", "sensor-1", "sensor-2"],
        )
        self.assertEqual(api.check_ins[0][-1], 3)

    def test_rejects_an_unknown_offline_target(self) -> None:
        with self.assertRaisesRegex(ValueError, "Offline target"):
            DevicePresenceSimulator(
                FakePresenceApi(),
                [SimulatedPresenceDevice("gateway", "1.0.0")],
                "user",
                "password",
                offline_device_id="not-registered",
            )

    def test_continues_heartbeating_other_devices_after_a_transient_failure(self) -> None:
        api = FakePresenceApi(fail_device_id="sensor-1")
        simulator = DevicePresenceSimulator(
            api,
            [
                SimulatedPresenceDevice("gateway", "1.0.0"),
                SimulatedPresenceDevice("sensor-1", "1.0.0"),
                SimulatedPresenceDevice("sensor-2", "1.0.0"),
            ],
            "user",
            "password",
            offline_cycle_enabled=False,
        )

        output = io.StringIO()
        with redirect_stdout(output):
            simulator.tick()

        self.assertEqual(
            [check_in[0] for check_in in api.check_ins], ["gateway", "sensor-2"]
        )
        self.assertIn("presenceHeartbeatError", output.getvalue())


class VirtualGatewayTest(unittest.TestCase):
    def firmware_command(self, deployment_id, path, firmware):
        command = {
            "type": "firmware.install",
            "deploymentId": deployment_id,
            "version": "1.1.0",
            "artifactUrl": "https://firmware.example.invalid/1.1.0.bin",
            "artifactSizeBytes": len(firmware),
            "sha256": hashlib.sha256(firmware).hexdigest(),
            "signingKeyId": "release-primary",
            "deviceModel": "Virtual gateway",
            "eventPath": path,
            "eventToken": "one-time-token",
            "download": {"resumable": True, "chunkSizeBytes": 4},
            "boot": {"strategy": "A_B", "confirmationTimeoutSeconds": 30},
        }
        signature_payload = json.dumps(
            {
                "schemaVersion": 1,
                "version": command["version"],
                "deviceModel": command["deviceModel"],
                "hardwareRevision": None,
                "artifactSizeBytes": command["artifactSizeBytes"],
                "sha256": command["sha256"],
            },
            separators=(",", ":"),
        )
        command["signaturePayload"] = signature_payload
        command["signature"] = sign(signature_payload.encode())
        return command

    def test_drives_a_single_device_firmware_campaign(self) -> None:
        api = FakeCampaignCoreApi()

        campaign = api.create_firmware_campaign(
            "Gateway canary", "release-1", ["device-1"]
        )
        deployment = api.start_firmware_campaign_target(
            str(campaign["id"]), "device-1"
        )
        completed = api.transition_firmware_campaign(str(campaign["id"]), "advance")

        self.assertEqual(deployment["id"], "deployment-1")
        self.assertEqual(completed["status"], "COMPLETED")
        self.assertEqual(
            api.requests[0][2],
            {
                "name": "Gateway canary",
                "releaseId": "release-1",
                "deviceIds": ["device-1"],
                "canarySize": 1,
                "batchSize": 1,
            },
        )

    def test_deploys_a_configuration_template_by_site_and_device_type(self) -> None:
        api = FakeConfigurationTemplateCoreApi()

        template = api.create_configuration_template(
            "Factory sensors", {"samplingRateHz": 2, "logLevel": "WARNING"}
        )
        deployment = api.deploy_configuration_template(
            str(template["id"]), "Factory 2", "SENSOR"
        )

        self.assertEqual(deployment["targetCount"], 3)
        self.assertEqual(
            api.requests[1][2],
            {"deploymentSite": "Factory 2", "deviceType": "SENSOR"},
        )

    def test_creates_core_compatible_local_owner_token(self) -> None:
        key = "device-simulator-local-signing-key-change-me"
        token = local_owner_token(key, now=1_700_000_000)
        header, payload, signature = token.split(".")
        claims = json.loads(base64.urlsafe_b64decode(payload + "=="))
        expected = base64.urlsafe_b64encode(
            hmac.new(key.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
        ).rstrip(b"=").decode()
        self.assertEqual(claims["sub"], "local-owner")
        self.assertEqual(claims["tid"], "local")
        self.assertEqual(signature, expected)

    def test_relays_bound_sensor_with_gateway_attribution(self) -> None:
        gateway = VirtualGateway("gateway-1", {"sensor-1"})
        payload = gateway.relay(
            SensorFrame("sensor-1", 7, 24.5, 91, -82, 7.5, "2026-08-24T00:00:00+00:00")
        )
        self.assertIsNotNone(payload)
        self.assertEqual(payload["gatewayId"], "gateway-1")
        self.assertEqual(payload["deviceId"], "sensor-1")
        self.assertEqual(payload["transport"], "SIMULATED_LORA")

    def test_rejects_unbound_sensor_without_creating_telemetry(self) -> None:
        gateway = VirtualGateway("gateway-1", {"sensor-1"})
        payload = gateway.relay(
            SensorFrame("sensor-forged", 1, 99, 1, -120, -20, "2026-08-24T00:00:00+00:00")
        )
        self.assertIsNone(payload)
        self.assertEqual(gateway.rejected_sensor_ids, ["sensor-forged"])

    def test_applies_monotonic_configuration_atomically(self) -> None:
        api = FakeConfigurationApi()
        processor = ConfigurationCommandProcessor(api, current_version=2)
        configuration_id = "11111111-1111-4111-8111-111111111111"

        version = processor.process(
            {
                "type": "configuration.apply",
                "configurationId": configuration_id,
                "version": 3,
                "parameters": {"samplingRateHz": 2, "reportingIntervalSeconds": 30},
                "restoreFactoryDefaults": False,
                "eventPath": f"/device-management/device-configurations/{configuration_id}/events",
                "eventToken": "one-time-token",
            }
        )

        self.assertEqual(version, 3)
        self.assertEqual(processor.parameters["samplingRateHz"], 2)
        self.assertEqual(api.events[-1][2], "APPLIED")

    def test_rolls_back_configuration_if_acknowledgement_fails(self) -> None:
        processor = ConfigurationCommandProcessor(FakeConfigurationApi(fail=True), current_version=2)
        processor.parameters = {"samplingRateHz": 1}
        configuration_id = "11111111-1111-4111-8111-111111111111"

        with self.assertRaisesRegex(RuntimeError, "acknowledgement"):
            processor.process(
                {
                    "type": "configuration.apply",
                    "configurationId": configuration_id,
                    "version": 3,
                    "parameters": {"samplingRateHz": 2},
                    "restoreFactoryDefaults": False,
                    "eventPath": f"/device-management/device-configurations/{configuration_id}/events",
                    "eventToken": "one-time-token",
                }
            )

        self.assertEqual(processor.current_version, 2)
        self.assertEqual(processor.parameters, {"samplingRateHz": 1})

    def test_buffers_and_rate_limits_threshold_alerts_with_hysteresis(self) -> None:
        api = FakeAlertApi(fail=True)
        buffer = DeviceAlertBuffer(api, "gateway", "secret")
        observed_at = "2026-09-06T01:00:00+00:00"

        self.assertTrue(
            buffer.observe_low_threshold(
                "sensor-1", "BATTERY_LOW", "WARNING", 8, 10, 2, observed_at, "batteryPercent"
            )
        )
        self.assertFalse(
            buffer.observe_low_threshold(
                "sensor-1", "BATTERY_LOW", "WARNING", 9, 10, 2, observed_at, "batteryPercent"
            )
        )
        with self.assertRaisesRegex(RuntimeError, "offline"):
            buffer.flush()
        self.assertEqual(len(buffer.pending), 1)

        buffer.observe_low_threshold(
            "sensor-1", "BATTERY_LOW", "WARNING", 13, 10, 2, observed_at, "batteryPercent"
        )
        self.assertTrue(
            buffer.observe_low_threshold(
                "sensor-1", "BATTERY_LOW", "WARNING", 7, 10, 2, observed_at, "batteryPercent"
            )
        )
        api.fail = False

        self.assertEqual(buffer.flush(), 2)
        self.assertEqual(api.events[0]["observedAt"], observed_at)
        self.assertEqual(len(buffer.pending), 0)

    def test_persistent_log_buffer_filters_level_and_drops_the_oldest_entry(self) -> None:
        api = FakeLogApi()
        buffer = PersistentCircularLogBuffer(api, "gateway", "secret", capacity=2)

        self.assertFalse(
            buffer.record("device-1", "INFO", "OPERATIONAL", "ignored", {}, "2026-09-06T01:00:00Z")
        )
        self.assertTrue(
            buffer.record("device-1", "ERROR", "FAULT", "first", {}, "2026-09-06T01:00:01Z")
        )
        buffer.record("device-1", "WARNING", "OPERATIONAL", "second", {}, "2026-09-06T01:00:02Z")
        buffer.record("device-1", "ERROR", "FAULT", "third", {}, "2026-09-06T01:00:03Z")

        self.assertEqual([entry["message"] for entry in buffer.pending], ["second", "third"])

    def test_persistent_log_buffer_survives_restart_and_replays_original_timestamp(self) -> None:
        state = {}
        offline_api = FakeLogApi(fail=True)
        observed_at = "2026-09-06T01:00:00+00:00"
        buffer = PersistentCircularLogBuffer(offline_api, "gateway", "secret", state)
        buffer.capture_fault(
            "sensor-1", "WATCHDOG", "0x400d1234", ["0x400d1234"], "1.2.3", observed_at
        )

        with self.assertRaisesRegex(RuntimeError, "offline"):
            buffer.flush()
        self.assertEqual(len(buffer.pending), 1)

        online_api = FakeLogApi()
        restarted = PersistentCircularLogBuffer(online_api, "gateway", "secret", state)
        self.assertEqual(restarted.flush(), 1)
        self.assertEqual(online_api.events[0]["observedAt"], observed_at)
        self.assertEqual(online_api.events[0]["context"]["resetReason"], "WATCHDOG")
        self.assertEqual(online_api.events[0]["context"]["firmwareVersion"], "1.2.3")

    def test_processes_ordered_firmware_command_events(self) -> None:
        api = FakeFirmwareApi()
        firmware = b"managed firmware"
        processor = FirmwareCommandProcessor(
            api, download=lambda _url: firmware, trusted_public_keys={"release-primary": PUBLIC_KEY}
        )
        deployment_id = "11111111-1111-4111-8111-111111111111"
        path = f"/device-management/firmware-deployments/{deployment_id}/events"

        states = processor.process(self.firmware_command(deployment_id, path, firmware))

        self.assertEqual(
            states,
            ["ACCEPTED", "DOWNLOADING", "VERIFYING", "INSTALLING", "REBOOTING"],
        )
        self.assertEqual(api.events[0], (path, "one-time-token", "ACCEPTED", 0))
        self.assertEqual(api.events[-1], (path, "one-time-token", "REBOOTING", 95))

    def test_rejects_downloaded_firmware_with_the_wrong_digest(self) -> None:
        api = FakeFirmwareApi()
        processor = FirmwareCommandProcessor(
            api,
            download=lambda _url: b"tampered",
            trusted_public_keys={"release-primary": PUBLIC_KEY},
        )
        deployment_id = "11111111-1111-4111-8111-111111111111"
        path = f"/device-management/firmware-deployments/{deployment_id}/events"

        with self.assertRaisesRegex(RuntimeError, "SHA-256"):
            processor.process(self.firmware_command(deployment_id, path, b"expected"))

        self.assertEqual(api.events[-1], (path, "one-time-token", "FAILED", 25))

    def test_rejects_firmware_event_path_for_another_deployment(self) -> None:
        processor = FirmwareCommandProcessor(
            FakeFirmwareApi(),
            download=lambda _url: b"unused",
            trusted_public_keys={"release-primary": PUBLIC_KEY},
        )
        with self.assertRaisesRegex(RuntimeError, "event path"):
            command = self.firmware_command(
                "11111111-1111-4111-8111-111111111111",
                "/device-management/firmware-deployments/wrong/events",
                b"unused",
            )
            processor.process(command)

    def test_rejects_firmware_with_an_invalid_ed25519_signature(self) -> None:
        api = FakeFirmwareApi()
        firmware = b"managed firmware"
        processor = FirmwareCommandProcessor(
            api,
            download=lambda _url: firmware,
            trusted_public_keys={"release-primary": PUBLIC_KEY},
        )
        deployment_id = "11111111-1111-4111-8111-111111111111"
        path = f"/device-management/firmware-deployments/{deployment_id}/events"

        with self.assertRaisesRegex(RuntimeError, "manifest signature"):
            command = self.firmware_command(deployment_id, path, firmware)
            command["signature"] = sign(b"another firmware")
            processor.process(command)

        self.assertEqual(api.events[-1], (path, "one-time-token", "FAILED", 25))

    def test_resumes_a_range_download_after_a_transient_interruption(self) -> None:
        firmware = b"abcdefghijkl"
        offsets = []
        failed_once = False

        def fetch_range(_url, start, end):
            nonlocal failed_once
            offsets.append(start)
            if start == 4 and not failed_once:
                failed_once = True
                raise OSError("connection interrupted")
            return firmware[start : end + 1]

        downloader = ResumableFirmwareDownloader(fetch_range=fetch_range)

        downloaded = downloader.download("deployment-1", "https://example.invalid/fw.bin", 12, 4)

        self.assertEqual(downloaded, firmware)
        self.assertEqual(offsets, [0, 4, 4, 8])

    def test_ab_bootloader_rolls_back_an_unconfirmed_image_after_restart(self) -> None:
        clock = [100.0]
        persistent_state = {}
        bootloader = ReferenceABBootloader(persistent_state, now=lambda: clock[0])
        bootloader.stage_and_boot("deployment-1", "1.1.0", b"firmware", 30)
        self.assertEqual(persistent_state["activeSlot"], "B")

        clock[0] = 131.0
        restarted_bootloader = ReferenceABBootloader(persistent_state, now=lambda: clock[0])

        self.assertTrue(restarted_bootloader.recover_if_unconfirmed())
        self.assertEqual(persistent_state["activeSlot"], "A")
        self.assertNotIn("pending", persistent_state)

    def test_ab_bootloader_keeps_a_confirmed_image(self) -> None:
        persistent_state = {}
        bootloader = ReferenceABBootloader(persistent_state, now=lambda: 100.0)
        bootloader.stage_and_boot("deployment-1", "1.1.0", b"firmware", 30)

        self.assertTrue(bootloader.confirm("1.1.0"))
        self.assertFalse(bootloader.recover_if_unconfirmed())
        self.assertEqual(persistent_state["activeSlot"], "B")

    def test_processor_reports_an_automatic_boot_rollback(self) -> None:
        firmware = b"managed firmware"
        clock = [100.0]
        api = FakeFirmwareApi()
        bootloader = ReferenceABBootloader({}, now=lambda: clock[0])
        processor = FirmwareCommandProcessor(
            api,
            download=lambda _url: firmware,
            trusted_public_keys={"release-primary": PUBLIC_KEY},
            bootloader=bootloader,
        )
        deployment_id = "11111111-1111-4111-8111-111111111111"
        path = f"/device-management/firmware-deployments/{deployment_id}/events"
        command = self.firmware_command(deployment_id, path, firmware)

        processor.process(command)
        clock[0] = 131.0

        self.assertTrue(processor.recover_unconfirmed_boot())
        self.assertEqual(api.events[-1], (path, "one-time-token", "ROLLED_BACK", 95))


if __name__ == "__main__":
    unittest.main()
