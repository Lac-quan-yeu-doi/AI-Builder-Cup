"""Replay generated sensor readings into a Celesnity MQTT streaming adapter.

The device simulator only emits fixed demo metrics (temperature, battery, RSSI).
Demo Data 2 (coffee capsules) needs specific, drifting signals — dosing-auger
current and vibration, seal-heater current, AHU desiccant-wheel current,
filling-room humidity — so this publishes rows from a CSV produced by
`mock-data/demo2-coffee-capsules/generate.mjs --end-date 2026-10-09 --out <dir>`
(`<dir>/sensor_live_48h.csv`: ts, tag, asset, metric, unit, value).

Any other CSV with a `ts` column works the same way: pick the device id column
with `--device-column` and the gateway with `--gateway`.

Topic and credentials follow the streaming adapter contract used by
`simulator.py`: `tenants/<tenant>/adapters/<publicKey>/devices/<deviceId>/<topic-key>`,
MQTT username = the adapter's public key. The device id is the `--device-column`
value of each row (default `asset`). Every CSV column except `ts` is carried in
the payload; numeric-looking values are sent as numbers.

    python3 replay_publisher.py out/sensor_live_48h.csv \
        --tenant tnt_demo2capsules01 --adapter-key adp_… --password … \
        [--host localhost --port 1883] [--speed 60] [--loop] [--realtime-stamps]

`--speed 60` replays one recorded minute per wall-clock second. By default each
message keeps its recorded timestamp (`eventTime`), so the warehouse sees the
48 hours that follow the generated history; `--realtime-stamps` rewrites
eventTime to "now" instead.
"""

from __future__ import annotations

import argparse
import csv
import json
import time
import uuid
from datetime import UTC, datetime, timedelta


def load(path: str) -> list[dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    rows.sort(key=lambda row: (row["ts"], row["tag"]))
    return rows


def scalar(value: str) -> object:
    """CSV text as a JSON scalar: numbers stay numbers, everything else a string."""
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return float(value)
    except ValueError:
        return value


def envelope(
    row: dict[str, str],
    sequence: int,
    realtime: bool,
    gateway: str = "GW_DEMO2_01",
    device_column: str = "asset",
) -> dict[str, object]:
    observed = (
        datetime.now(UTC).isoformat()
        if realtime
        else datetime.fromisoformat(row["ts"].replace(" ", "T")).replace(tzinfo=UTC).isoformat()
    )
    fields = {key: scalar(value) for key, value in row.items() if key != "ts"}
    if "value" in row:
        fields["value"] = float(row["value"])
    return {
        **fields,
        "eventId": str(uuid.uuid4()),
        "eventTime": observed,
        "gatewayId": gateway,
        "deviceId": row[device_column],
        "sequence": sequence,
        "transport": "SIMULATED_REPLAY",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("csv")
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--adapter-key", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--speed", type=float, default=60.0, help="recorded seconds per wall-clock second")
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--realtime-stamps", action="store_true")
    parser.add_argument("--gateway", default="GW_DEMO2_01", help="gatewayId carried in every message")
    parser.add_argument("--device-column", default="asset", help="CSV column used as the device id")
    parser.add_argument("--topic-key", default="telemetry", help="last topic segment")
    parser.add_argument("--dry-run", action="store_true", help="print the first messages instead of publishing")
    args = parser.parse_args()

    rows = load(args.csv)
    topic = lambda device: f"tenants/{args.tenant}/adapters/{args.adapter_key}/devices/{device}/{args.topic_key}"
    message = lambda row, sequence: envelope(row, sequence, args.realtime_stamps, args.gateway, args.device_column)

    if args.dry_run:
        for index, row in enumerate(rows[:5]):
            print(topic(row[args.device_column]), json.dumps(message(row, index), ensure_ascii=False))
        print(f"{len(rows)} rows ready")
        return 0

    import paho.mqtt.client as mqtt

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
    client.username_pw_set(args.adapter_key, args.password)
    client.connect(args.host, args.port, keepalive=30)
    client.loop_start()
    sequence = 0
    try:
        while True:
            previous: datetime | None = None
            for row in rows:
                recorded = datetime.fromisoformat(row["ts"].replace(" ", "T"))
                if previous is not None and recorded > previous:
                    time.sleep(max(0.0, (recorded - previous) / timedelta(seconds=1) / args.speed))
                previous = recorded
                sequence += 1
                info = client.publish(topic(row[args.device_column]), json.dumps(message(row, sequence)), qos=1)
                info.wait_for_publish(timeout=10)
                if sequence % 500 == 0:
                    print(json.dumps({"published": sequence, "recordedAt": row["ts"]}), flush=True)
            if not args.loop:
                break
    finally:
        client.disconnect()
        client.loop_stop()
    print(json.dumps({"published": sequence, "done": True}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
