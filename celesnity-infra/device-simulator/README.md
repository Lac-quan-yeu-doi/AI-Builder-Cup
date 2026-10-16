# Virtual factory device simulator

For a UI-first walkthrough covering adapter creation, provisioning, live
telemetry, health, remote configuration, signed OTA, campaigns, replacement,
and lifecycle operations, see the
[Device Management end-to-end guide](../docs/device-management-end-to-end-guide.md).

The simulator models the requirement topology rather than connecting every
sensor directly to MQTT:

- virtual sensors send LoRa-like frames to one virtual gateway;
- the gateway rejects frames from unbound UUIDs;
- sensors receive no cloud MQTT principal; the gateway alone authenticates to
  EMQX and publishes each relayed frame to that bound sensor's exact telemetry
  topic;
- EMQX denies publication to unbound sensor topics, while the ingestion envelope
  derives its trusted device UUID from the broker-authorized topic;
- gateway and gateway-relayed sensor heartbeats authenticate with the gateway's
  restricted MQTT credential and update Device Management contact status and
  `lastSeenAt` without carrying a human session.
- after the validation scenario, the long-running simulator sends authenticated
  heartbeats for the gateway and all sensors every three seconds, keeping their
  platform status healthy;
- every healthy sensor heartbeat also produces a fresh temperature, battery,
  and radio measurement. The gateway publishes it to the sensor's authorized
  MQTT topic, and the shared ingestion path materializes it in
  `tnt_virtualfactory01_bronze.mqtt_events` for Catalog browsing and preview;
- by default, the first sensor stops reporting for 30 seconds after each
  60-second healthy period. The other devices remain healthy, Core raises a
  loss-of-contact alert for only that sensor, and the resumed heartbeat restores
  its connectivity and automatically clears the alert;
- a bound sensor buffers a radio-degradation alert with its original timestamp,
  applies threshold hysteresis to suppress repeats, and replays it through the
  authenticated gateway path when connectivity is available;
- the gateway keeps a capacity-bounded persistent circular diagnostic buffer,
  applies the remotely configured log level, captures watchdog/crash context,
  survives a simulated restart, and replays entries in order through the
  authenticated gateway path without changing their device timestamps;
- the gateway subscribes to its own and its bound sensors' exact firmware
  command topics, receives deployments dispatched by Core, and reports the
  ordered OTA lifecycle through the one-time event-token callback;
- OTA remains in `REBOOTING` until a separate authenticated heartbeat reports
  the target firmware version; the scenario validates this for the gateway and
  one gateway-relayed sensor;
- each OTA command requires a known artifact size, resumable range-download
  policy, A/B slot strategy, and boot-confirmation deadline;
- the gateway OTA is dispatched through a one-device canary campaign by
  default, and the simulator advances the campaign to `COMPLETED` only after
  the post-reboot heartbeat confirms the deployment;
- the gateway subscribes to its retained configuration-command topic, atomically
  applies a higher version, explicitly acknowledges it with the one-time token,
  and reports the running version in its next heartbeat;
- an immutable configuration template targets every active sensor at the
  simulated factory site, snapshots the matching UUIDs, and creates one queued
  versioned configuration command per sensor;
- HTTP setup calls authenticate as the seeded local owner; Core derives every
  lifecycle actor and organization from that verified session.

Unit test:

```sh
python3 -m unittest discover -s device-simulator -p 'test_*.py'
```

The live scenario is run through `compose.device-simulator.yaml` after the
isolated Core stack is healthy.

```sh
cd ../celesnity-core
docker compose -f compose.device-management.yaml up -d --build --wait

cd ../celesnity-infra
docker compose -f compose.device-simulator.yaml up -d --build virtual-factory
docker compose -f compose.device-simulator.yaml logs -f virtual-factory
```

The isolated API binds only to `127.0.0.1:3301`; it does not replace or reuse
the regular `celesnity-core` API container. Both stacks attach to the existing
`celesnity-poc` infrastructure network so the PostgreSQL and EMQX containers
are shared, while Device Management uses its own
`celesnity_device_management` database for tenant and sample data.

Set `DEVICE_SIM_API_TOKEN` to exercise another authenticated persona. Otherwise
the simulator signs a short-lived local-owner token with the same
`LOCAL_DEV_AUTH_SIGNING_KEY` used by the isolated Core stack.

The Compose service runs continuously. Stop it with
`docker compose -f compose.device-simulator.yaml down`. Change
`DEVICE_SIM_HEARTBEAT_INTERVAL_SECONDS`, `DEVICE_SIM_HEALTHY_DURATION_SECONDS`,
or `DEVICE_SIM_OFFLINE_DURATION_SECONDS` to tune the presence cycle. Set
`DEVICE_SIM_OFFLINE_CYCLE_ENABLED=false` when every simulated device should
remain continuously healthy. `DEVICE_SIM_OFFLINE_DEVICE_ID` can select a
specific registered UUID; without it, the first simulated sensor is used.

While it is running, the virtual gateway also stays subscribed to the exact
configuration and firmware command topics for itself and its bound sensors.
This allows releases and configurations initiated manually from the Web UI to
complete against the same simulated devices. Ready-to-use values and a locally
signed artifact are under [`samples/`](samples/README.md).

The Python OTA path signs a generated firmware binary with the isolated RFC 8032
development key, uploads it through Core, confirms
that the release is backed by managed object storage, downloads the private
artifact in resumable HTTP ranges through the short-lived URL in the MQTT
command, verifies its SHA-256 and Ed25519 signature against the configured
trusted public key, and only then stages the inactive slot. The executable A/B
reference state persists through a simulated restart, keeps a confirmed image,
and automatically returns to the prior slot after a missed confirmation
deadline. It does not physically flash an ESP32 partition or protect the trust
anchor in hardware; those final guarantees require target-board integration.

Set `DEVICE_SIM_VALIDATE_SENSOR_OTA=false` to skip the additional bound-sensor
OTA deployment.

Set `DEVICE_SIM_VALIDATE_DEVICE_ALERTS=false` to skip device-originated alert
buffering and ingestion.

Set `DEVICE_SIM_VALIDATE_DEVICE_LOGS=false` to skip persistent operational and
fault-log ingestion. The Python buffer models the retention, replay, and restart
contract; flash wear-leveling and crash-register capture still require the
target microcontroller SDK and physical-board validation.

Set `DEVICE_SIM_VALIDATE_GROUP_CONFIGURATION=false` to skip the site-and-type
configuration template deployment.

Set `DEVICE_SIM_VALIDATE_FIRMWARE_CAMPAIGN=false` to exercise the legacy
single-device deployment endpoint for the gateway instead of the default
campaign flow.

For firmware-level ESP32 validation, use the checked-in
[`wokwi/`](wokwi/README.md) project. Its public-broker smoke test is independent
of Docker; the private-gateway instructions describe how to target the isolated
local EMQX stack without interfering with another `celesnity-core` deployment.
