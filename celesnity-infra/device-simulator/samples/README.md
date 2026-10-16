# Manual Device Management samples

These files target the isolated local Device Management stack on Core port
`3301` and the continuously running virtual factory. They are development-only
test data, not executable production firmware.

## Firmware & OTA

Open **Devices > Firmware & OTA > Create firmware release** and enter:

- Target version: `2.0.0-manual`
- Device model: `CEL-GW-SIM`
- Hardware revision: `sim-a`
- Signing key ID: `local-dev`
- Signature:
  `BLQGYZmjhxIFLa+CpVXCVCWiWyOAMnSznD9pwQAZYNr0r4BKPC/ibiyGi4THxSP7Zh2X+O87+JweISk4AhrbBg==`
- Artifact file: `cel-gw-sim-2.0.0-manual.bin`
- Release notes: `Manual OTA test for the virtual factory gateway.`

The expected artifact metadata is:

- Size: `174` bytes
- SHA-256: `59c59035ce340405b18b28b7126f85f6de5547c1f72ec1c93c5c0e65b3b9afee`

After creating the release, select **Virtual Factory Gateway**, select the new
release, and start the deployment. The persistent simulator consumes the MQTT
command, range-downloads the managed MinIO artifact, verifies SHA-256 and the
Ed25519 signature, simulates A/B installation and reboot, then confirms version
`2.0.0-manual` in its next heartbeat. The deployment should finish as
`SUCCEEDED`.

If the version already exists from an earlier test, use a new version and sign
the changed file again; the signature is valid only for these exact 174 bytes.

## Remote configuration

Open **Devices > Remote configuration**, select **Virtual Factory Gateway**,
then use the values in `virtual-gateway-configuration.json`:

- Sampling rate: `2` Hz
- Reporting interval: `30` seconds
- Gateway uplink mode: `MQTT`
- Temperature channel: enabled
- Diagnostic preset: `basic`
- Log level: `INFO`
- Low-battery threshold: `15`
- Restore factory defaults: disabled

Push the configuration. The persistent simulator receives the retained MQTT
command, applies the next monotonic version, acknowledges it as `APPLIED`, and
reports that version in subsequent heartbeats.
