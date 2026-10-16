# Streaming and devices

The **Streaming** module (under *Data*) receives real-time data from devices over MQTT. You register an **adapter** (an intake point), hand its connection details to the devices, and then manage the devices that report into it from inside the app.

## 1. Registering an MQTT adapter

1. Open **Streaming**. The **MQTT streaming** page shows the **Register MQTT adapter** form.
2. Enter the **Tenant storage key**: the `tnt_` prefix under which all raw data from this adapter is stored. Set once; it does not change later.
3. Enter the **Tenant name** and an **Adapter name** (a memorable label such as *Line A sensors*).
4. Click **Register adapter**.
5. A credential card appears with the **MQTT broker URL**, **Topic filter**, **Username** and **Password**.

> **Copy the password now.** The app says *"Copy this password now. It will not be shown again."* Store it somewhere safe, then click **I saved the credential**.

Give those four values to whoever configures the devices or gateway. As long as a device publishes on the right topic with those credentials, its data flows in.

## 2. Managing registered adapters

The **Registered adapters** list offers, per adapter:

| Action | When to use it |
| --- | --- |
| **Pause / Resume** | Stop receiving data temporarily (for maintenance) and start again. |
| **Rotate credential** | Issue a new password if you suspect a leak; the app asks for confirmation. The devices must then be updated with the new password. |
| **Archive** | Retire the adapter for good. Data already received is kept. |

Click an adapter's name to open **Device Management**.

## 3. Device Management

The section has six tabs:

- **Overview**: device counts, health and alerts at a glance.
- **Device registry**: the list of devices (gateways and sensors). Register new devices; per device, **Activate**, **Suspend**, **Retire**, and **Replace sensor** (swap a broken sensor for a new one while keeping its history).
- **Health & monitoring**: connectivity and alerts. **Acknowledge** marks an alert as seen, **Clear** closes it.
- **Remote configuration**: send settings to devices with **Push configuration**; save **templates** to reuse across devices.
- **Firmware & OTA**: upload new device software (**Upload release**), deploy it to one device (**Deploy firmware**), or run a campaign in batches.
- **Provisioning**: the workflow for bringing new devices into service.

## 4. Updating device firmware in stages (staged rollout)

To avoid updating every device at once:

1. On **Firmware & OTA**, **Upload release**: choose the firmware file, set the target version and the compatible model. The platform computes the digest and signature for you.
2. Click **Create campaign**: name it, pick the release, and set the number of **canary** devices (the trial wave) and the **batch size**.
3. **Start canary**: the trial wave updates first. Watch each device's progress.
4. If the trial is healthy, **Advance batch** moves to the next wave. If not, **Abort** stops the campaign; devices not yet updated keep the old version.
5. **Deployment history** records the progress of every deployment.

## 5. Suggested flow

Register adapter → copy the credentials → configure the devices → open the adapter → Device registry: register and Activate devices → watch Health & monitoring → when needed, Push configuration or Deploy firmware.

## 6. Notes

- Only roles with write access (Data engineer, Analyst, administrators) can register adapters or change devices; Viewers can only look.
- The device tabs can be switched off separately for your group (the *Devices* feature), even when you can see Streaming.
