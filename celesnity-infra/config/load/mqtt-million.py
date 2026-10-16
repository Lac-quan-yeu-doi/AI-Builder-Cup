"""QoS 1 MQTT load generator used by the M5 certification gate."""

from __future__ import annotations

import json
import os
import threading
import time
import uuid

import paho.mqtt.client as mqtt

EVENTS = int(os.environ.get("MQTT_LOAD_EVENTS", "1000000"))
ADAPTER_KEY = os.environ.get("MQTT_LOAD_ADAPTER_KEY", "adp_000000000000")
DEVICES = int(os.environ.get("MQTT_LOAD_DEVICES", "1000"))
TENANT = os.environ.get("MQTT_LOAD_TENANT", "tnt_7f3a2c19d8e4")
HOST = os.environ.get("MQTT_LOAD_HOST", "emqx")
PORT = int(os.environ.get("MQTT_LOAD_PORT", "1883"))
USERNAME = os.environ["MQTT_DEVICE_USERNAME"]
PASSWORD = os.environ["MQTT_DEVICE_PASSWORD"]
MAX_INFLIGHT = int(os.environ.get("MQTT_LOAD_MAX_INFLIGHT", "1000"))

condition = threading.Condition()
acknowledged = 0


def on_publish(_client: mqtt.Client, _userdata: object, _mid: int, _reason: object, _props: object) -> None:
    global acknowledged
    with condition:
        acknowledged += 1
        condition.notify_all()


def main() -> None:
    run_id = str(uuid.uuid4())
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"m5-load-{run_id}")
    client.username_pw_set(USERNAME, PASSWORD)
    client.max_inflight_messages_set(MAX_INFLIGHT)
    client.on_publish = on_publish
    client.connect(HOST, PORT, keepalive=60)
    client.loop_start()
    started = time.time()

    for sequence in range(EVENTS):
        device = f"device-{sequence % DEVICES:06d}"
        topic = f"tenants/{TENANT}/adapters/{ADAPTER_KEY}/devices/{device}/telemetry"
        payload = json.dumps(
            {
                "eventId": f"{run_id}:{sequence}",
                "eventTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "sequence": sequence,
                "temperature": 20.0 + (sequence % 200) / 10,
            },
            separators=(",", ":"),
        )
        result = client.publish(topic, payload, qos=1)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(f"MQTT publish failed at sequence {sequence}: rc={result.rc}")

    with condition:
        deadline = time.monotonic() + 600
        while acknowledged < EVENTS and time.monotonic() < deadline:
            condition.wait(timeout=1)

    elapsed = time.time() - started
    client.disconnect()
    client.loop_stop()
    if acknowledged != EVENTS:
        raise RuntimeError(f"Only {acknowledged}/{EVENTS} QoS 1 publishes were acknowledged")
    print(
        json.dumps(
            {
                "runId": run_id,
                "events": EVENTS,
                "acknowledged": acknowledged,
                "elapsedSeconds": round(elapsed, 3),
                "eventsPerSecond": round(EVENTS / elapsed, 2),
                "tenantStorageKey": TENANT,
                "adapterKey": ADAPTER_KEY,
                "devices": DEVICES,
            }
        )
    )


if __name__ == "__main__":
    main()
