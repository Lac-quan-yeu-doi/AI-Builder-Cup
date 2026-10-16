#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

docker run --rm \
  --network celesnity-poc \
  -e MQTT_LOAD_EVENTS="${MQTT_LOAD_EVENTS:-1000000}" \
  -e MQTT_LOAD_ADAPTER_KEY="${MQTT_LOAD_ADAPTER_KEY:-adp_000000000000}" \
  -e MQTT_LOAD_DEVICES="${MQTT_LOAD_DEVICES:-1000}" \
  -e MQTT_LOAD_TENANT="${MQTT_LOAD_TENANT:-tnt_7f3a2c19d8e4}" \
  -e MQTT_DEVICE_USERNAME="${MQTT_DEVICE_USERNAME:-celesnity-device}" \
  -e MQTT_DEVICE_PASSWORD="${MQTT_DEVICE_PASSWORD:-celesnity_device_password}" \
  -v "${repository_root}/config/load/mqtt-million.py:/work/mqtt-million.py:ro" \
  python:3.13.7-slim \
  /bin/sh -ceu 'python -m pip install --no-cache-dir paho-mqtt==2.1.0 >/dev/null && python /work/mqtt-million.py'
