# Local FTPS inbound connector

This stack runs the Celesnity FTPS server with the pinned official
`drakkan/sftpgo:v2.7.5` image. It publishes explicit FTP over TLS only; the
SFTPGo REST API stays private on the `celesnity-poc` Docker network.

## Start the server

```powershell
Copy-Item local/.env.example local/.env
# Replace every FTPS_* placeholder in local/.env with local-only values.
docker compose --project-directory local -f local/compose.yaml up -d --wait sftpgo
docker compose --project-directory local -f local/compose.yaml run --rm ftps-bootstrap
```

The server depends on MinIO initialization and the development certificate
initializer. `ftps-bootstrap` is a one-shot operational reconciler: it creates
the SFTPGo virtual folder, the upload-only FTPS client, and the separate
read-only monitoring admin. It is not another FTP server.

## External client settings

Use the installed FileZilla application, an ERP, or another external FTPS
client. An optional FileZilla GUI profile is also available for local Docker
smoke tests; it is not started by the normal server profile.

```text
Protocol: FTP - File Transfer Protocol
Host: 127.0.0.1
Port: 2121
Encryption: Require explicit FTP over TLS
Transfer mode: Passive
User: FTPS_DEMO_USERNAME from local/.env
Password: FTPS_DEMO_PASSWORD from local/.env
Remote directory: /incoming
```

To start the optional FileZilla browser client inside the Infra Compose
project:

```powershell
docker compose --project-directory local -f local/compose.yaml `
  --profile ftps-client up -d --wait
```

Open `http://localhost:5800`. Because this test client shares SFTPGo's network
namespace, use `127.0.0.1` as the FileZilla host. The passive
ports and the control port are then loopback ports in the same namespace.
The client still uses explicit FTP over TLS; this is FTPS, not SFTP.

The generated development certificate is written to
`local/secrets/ftps/server.crt` and is ignored by Git. Trust it in FileZilla
for local use. It contains SAN entries for `localhost` and `127.0.0.1`; mutual
TLS/client certificates are out of scope for this phase.

The client can list and upload new files, but cannot download, overwrite,
rename, or delete files. Upload directly using the final filename. Temporary
upload followed by rename is intentionally rejected.

## Core connection status

When the Core API is running locally, these read-only endpoints expose the
configured server metadata and the current connection state:

```text
GET http://localhost:3001/api/v1/ftps-connector
GET http://localhost:3001/api/v1/ftps-connector/status
```

The status endpoint returns `Success` only when the configured FTPS username has
an active FTP session in SFTPGo. It returns `Fail` when there is no matching
session or when the private status service cannot be queried. The optional
`reason` is diagnostic; the SFTPGo monitoring credentials are never returned.

When starting the adjacent Core stack, pass this same env file explicitly so
Core receives the same FTPS client password and private monitoring credentials:

```powershell
docker compose --env-file ../celesnity-infra/local/.env `
  --project-directory ../celesnity-core -f ../celesnity-core/compose.yaml `
  up -d --build --wait
```

Core's Compose file selects only the named FTPS/status variables it needs; it
does not expose the bootstrap admin, SFTPGo master key, MinIO, or TLS secrets
to the API response or Web.

The `local/.env` file is not a deployment configuration. Keep its advertised
host and passive IP at `127.0.0.1`; the local Compose service binds those ports
to loopback and its generated certificate is for local use. The GCP Dev Core
deployment advertises `ftps-dev.celesnity.com` from Core's ConfigMap and reads
the two passwords from Secret Manager. A deployed SFTPGo workload must use the
same demo and status passwords, expose the FTPS control/passive ports through a
raw TCP endpoint, and provide Core a private HTTP API endpoint for status.

## Storage mapping

An upload to `/incoming/example.csv` is stored in MinIO as:

```text
celesnity-ingress/tnt_localdemo000/landing/ftps/<actual-username>/incoming/example.csv
```

The MinIO identity used by SFTPGo is restricted to that exact tenant/user
prefix. Clients never see or submit the internal object-store path.

## Internal monitoring identity

`FTPS_STATUS_USERNAME` and `FTPS_STATUS_PASSWORD` are used only by Core to ask
the private SFTPGo REST API for active connections. The bootstrap creates this
admin with exactly `view_conns`; it cannot close connections or manage users,
folders, or storage. These values are never returned to an external FTPS
client or logged.

Normal bootstrap runs preserve both the FTPS client password and monitoring
password. Rotate them only after changing `local/.env` and explicitly setting
the relevant reset flag:

```powershell
docker compose --project-directory local -f local/compose.yaml run --rm `
  -e FTPS_RESET_PASSWORD=1 ftps-bootstrap

docker compose --project-directory local -f local/compose.yaml run --rm `
  -e FTPS_STATUS_RESET_PASSWORD=1 ftps-bootstrap
```

Running the bootstrap repeatedly must report reconciliation and must not create
duplicate users, folders, or monitoring admins.

## Verify the MinIO object

After uploading a unique file from FileZilla, verify it from the Docker network
with the existing `mc` image. Replace `<filename>` with the exact remote name:

```powershell
docker run --rm --network celesnity-poc `
  -e MINIO_ROOT_USER=celesnity `
  -e MINIO_ROOT_PASSWORD=celesnity_minio_password `
  minio/mc:RELEASE.2025-04-16T18-13-26Z `
  sh -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc stat local/celesnity-ingress/tnt_localdemo000/landing/ftps/ftps-demo-user/incoming/<filename> && mc cat local/celesnity-ingress/tnt_localdemo000/landing/ftps/ftps-demo-user/incoming/<filename> | sha256sum'
```
