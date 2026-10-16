#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

docker run --rm -it \
  -e MQTT_BROKER_URL="${MQTT_BROKER_URL:-mqtt://host.docker.internal:1883}" \
  -e MQTT_USERNAME="${MQTT_USERNAME:-}" \
  -e MQTT_PASSWORD="${MQTT_PASSWORD:-}" \
  -e MQTT_TOPIC_FILTER="${MQTT_TOPIC_FILTER:-}" \
  -e MQTT_DEVICE_ID="${MQTT_DEVICE_ID:-sensor-001}" \
  -e MQTT_EVENT_COUNT="${MQTT_EVENT_COUNT:-5}" \
  -e MQTT_EVENT_INTERVAL="${MQTT_EVENT_INTERVAL:-1}" \
  -v "${repository_root}/scripts/streaming/publish-mqtt-sample.py:/work/publish-mqtt-sample.py:ro" \
  python:3.13.7-slim \
  /bin/sh -ceu 'python -m pip install --no-cache-dir --root-user-action=ignore --disable-pip-version-check paho-mqtt==2.1.0 >/dev/null && python /work/publish-mqtt-sample.py'
