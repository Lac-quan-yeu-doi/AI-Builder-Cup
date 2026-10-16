#!/usr/bin/env python3
"""Publish sample QoS 1 telemetry to a Celesnity-managed MQTT adapter."""

from __future__ import annotations

import argparse
import getpass
import json
import os
import ssl
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

import paho.mqtt.client as mqtt


def environment(name: str) -> str | None:
    value = os.environ.get(name)
    return value if value else None


def positive_integer(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return parsed


def non_negative_number(value: str) -> float:
    parsed = float(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be zero or greater")
    return parsed


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Publish JSON telemetry using a Celesnity MQTT adapter registration."
    )
    parser.add_argument(
        "--broker-url",
        default=environment("MQTT_BROKER_URL") or "mqtt://localhost:1883",
        help="mqtt:// or mqtts:// endpoint (env: MQTT_BROKER_URL)",
    )
    parser.add_argument(
        "--username",
        default=environment("MQTT_USERNAME"),
        help="Issued adapter username (env: MQTT_USERNAME)",
    )
    parser.add_argument(
        "--password",
        default=environment("MQTT_PASSWORD"),
        help="Issued adapter password (env: MQTT_PASSWORD; otherwise prompt securely)",
    )
    parser.add_argument(
        "--topic-filter",
        default=environment("MQTT_TOPIC_FILTER"),
        help="Issued topic ending in devices/+/telemetry (env: MQTT_TOPIC_FILTER)",
    )
    parser.add_argument(
        "--device-id",
        default=environment("MQTT_DEVICE_ID") or "sensor-001",
        help="Value that replaces the '+' wildcard (default: sensor-001)",
    )
    parser.add_argument(
        "--count",
        type=positive_integer,
        default=int(environment("MQTT_EVENT_COUNT") or "5"),
        help="Number of events to publish (default: 5)",
    )
    parser.add_argument(
        "--interval",
        type=non_negative_number,
        default=float(environment("MQTT_EVENT_INTERVAL") or "1"),
        help="Seconds between events (default: 1)",
    )
    parser.add_argument(
        "--ca-file",
        type=Path,
        default=Path(environment("MQTT_CA_FILE")) if environment("MQTT_CA_FILE") else None,
        help="CA certificate for a self-signed mqtts endpoint (env: MQTT_CA_FILE)",
    )
    parser.add_argument(
        "--timeout",
        type=positive_integer,
        default=15,
        help="Seconds allowed for connect and publish acknowledgements (default: 15)",
    )
    return parser.parse_args()


def required(value: str | None, label: str) -> str:
    if value is None or not value.strip():
        raise ValueError(f"{label} is required")
    return value.strip()


def parse_broker(broker_url: str) -> tuple[str, int, bool]:
    parsed = urlparse(broker_url)
    if parsed.scheme not in {"mqtt", "mqtts"}:
        raise ValueError("Broker URL must start with mqtt:// or mqtts://")
    if not parsed.hostname:
        raise ValueError("Broker URL must include a hostname")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("Broker URL must be an origin without a path, query, or fragment")
    use_tls = parsed.scheme == "mqtts"
    return parsed.hostname, parsed.port or (8883 if use_tls else 1883), use_tls


def concrete_topic(topic_filter: str, device_id: str) -> str:
    topic_filter = required(topic_filter, "Topic filter")
    device_id = required(device_id, "Device ID")
    if any(character in device_id for character in ("/", "+", "#")):
        raise ValueError("Device ID must not contain '/', '+', or '#'")
    segments = topic_filter.split("/")
    if segments.count("+") != 1 or "#" in segments:
        raise ValueError("Topic filter must contain exactly one '+' segment and no '#' wildcard")
    topic = "/".join(device_id if segment == "+" else segment for segment in segments)
    if "+" in topic or "#" in topic:
        raise ValueError("Publish topic must not contain MQTT wildcards")
    return topic


def payload(run_id: str, device_id: str, sequence: int) -> str:
    return json.dumps(
        {
            "eventId": f"{run_id}:{sequence}",
            "eventTime": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "deviceId": device_id,
            "sequence": sequence,
            "temperature": round(22.0 + sequence * 0.1, 1),
            "humidity": round(55.0 + sequence * 0.2, 1),
        },
        separators=(",", ":"),
    )


def main() -> int:
    args = arguments()
    try:
        username = required(args.username, "Username")
        password = required(args.password or getpass.getpass("MQTT password: "), "Password")
        host, port, use_tls = parse_broker(args.broker_url)
        topic = concrete_topic(required(args.topic_filter, "Topic filter"), args.device_id)
        if args.ca_file is not None and not args.ca_file.is_file():
            raise ValueError(f"CA certificate does not exist: {args.ca_file}")
    except ValueError as error:
        print(f"Configuration error: {error}", file=sys.stderr)
        return 2

    run_id = str(uuid.uuid4())
    connected = False
    connection_error: str | None = None

    def on_connect(
        _client: mqtt.Client,
        _userdata: object,
        _flags: mqtt.ConnectFlags,
        reason_code: mqtt.ReasonCode,
        _properties: mqtt.Properties | None,
    ) -> None:
        nonlocal connected, connection_error
        if reason_code.is_failure:
            connection_error = str(reason_code)
        else:
            connected = True

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"celesnity-sample-{run_id}",
        protocol=mqtt.MQTTv5,
    )
    client.username_pw_set(username, password)
    client.on_connect = on_connect
    if use_tls:
        client.tls_set(
            ca_certs=str(args.ca_file) if args.ca_file is not None else None,
            cert_reqs=ssl.CERT_REQUIRED,
            tls_version=ssl.PROTOCOL_TLS_CLIENT,
        )

    try:
        print(f"Connecting to {args.broker_url} as {username} ...")
        client.connect(host, port, keepalive=60)
        client.loop_start()
        deadline = time.monotonic() + args.timeout
        while not connected and connection_error is None and time.monotonic() < deadline:
            time.sleep(0.05)
        if connection_error is not None:
            raise RuntimeError(f"broker rejected the connection: {connection_error}")
        if not connected:
            raise TimeoutError("timed out waiting for the broker acknowledgement")

        print(f"Connected. Publishing {args.count} event(s) to {topic}")
        for sequence in range(1, args.count + 1):
            message = payload(run_id, args.device_id, sequence)
            result = client.publish(topic, message, qos=1, retain=False)
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                raise RuntimeError(f"publish {sequence} failed: {mqtt.error_string(result.rc)}")
            result.wait_for_publish(timeout=args.timeout)
            if not result.is_published():
                raise TimeoutError(f"publish {sequence} was not acknowledged within {args.timeout}s")
            print(f"ACK {sequence}/{args.count}: {message}")
            if sequence < args.count and args.interval:
                time.sleep(args.interval)
    except (OSError, RuntimeError, TimeoutError) as error:
        print(f"MQTT test failed: {error}", file=sys.stderr)
        return 1
    finally:
        if connected:
            client.disconnect()
        client.loop_stop()

    print(f"Success: {args.count}/{args.count} QoS 1 event(s) acknowledged by EMQX.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
