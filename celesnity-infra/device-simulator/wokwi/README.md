# Wokwi ESP32 gateway validation

This circuit models one ESP32 gateway reading an analog temperature sensor and
publishing the same gateway-attributed telemetry envelope used by the Python
virtual-factory scenario. It subscribes to its own topic and prints
`VALIDATION mqtt_publish_and_echo=PASS` after the broker returns the message.
The publisher uses MQTT QoS 1, matching the default Celesnity adapter/device
authorization. It obtains an ISO-8601 UTC event time over NTP when available
and sends `null` while time synchronization is unavailable, which the bronze
envelope accepts; telemetry is not halted by a transient NTP failure.

## Browser smoke test

Open a new ESP32 project on Wokwi, copy `sketch.ino`, `diagram.json`, and
`libraries.txt`, then start the simulation. The checked-in defaults use Wokwi's
`Wokwi-GUEST` network and a uniquely named public HiveMQ topic. They contain no
Celesnity credentials or private data.

## Celesnity end-to-end test

The browser's public gateway cannot reach local services. Enable the Wokwi
Private IoT Gateway, then change the firmware configuration to:

- host: `host.wokwi.internal`
- port: `1883`
- username/password: the one-time values returned when the gateway is registered
- topic: the registered gateway's `topics.telemetry`
- firmware command topic: the registered gateway's `topics.firmwareCommands`
- Core API base URL: `http://host.wokwi.internal:3301/api/v1`

Run the isolated Core stack on port `3301` and register the ESP32 through the
Device Management UI first. Do not put a local-owner token or signing key in the
firmware: registration is a human/control-plane operation, while MQTT uses the
device's restricted principal.

The device heartbeat endpoint accepts the same restricted Basic credential used
for MQTT. A gateway may report itself and sensors bound to it; the firmware must
never carry a human session.

For a LoRa sensor frame, keep the gateway MQTT connection but publish to the
bound sensor's registered `topics.telemetry`, and put the same sensor UUID in
the payload's `deviceId`. Sensors do not receive an EMQX username or password.
Core regenerates the gateway's exact-topic ACL whenever a bound sensor becomes
active, faulty, suspended, or decommissioned.

When a firmware command arrives, the sketch validates its deployment-bound
callback path, managed artifact fields, resumable-download policy, artifact
size, A/B strategy, and boot-confirmation deadline, then reports the
ordered OTA states through `REBOOTING` to Core with the one-time event token. It
then prints `awaiting_post_reboot_heartbeat`; Core must receive a separate
authenticated heartbeat carrying the target firmware version before it marks
the deployment `SUCCEEDED`. This is a control-plane simulation: it deliberately does not
download, cryptographically verify, or flash a binary. Production firmware must
download into an inactive partition, verify
the SHA-256 and signature against an embedded trusted public key, boot with a
health confirmation deadline, and roll back on failure.
