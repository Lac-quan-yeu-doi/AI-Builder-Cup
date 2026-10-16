# GCP FTPS Runtime Design

## Goal

Run the existing SFTPGo FTPS connector in the GCP development GKE cluster so
external clients can upload to `ftps-dev.celesnity.com` and Celesnity Core can
read active-connection status from SFTPGo's private REST API.

## Approved development baseline

- Upload payloads are stored in a dedicated GCS ingress bucket.
- SFTPGo keeps its small SQLite configuration database on a single-replica GKE
  PersistentVolumeClaim. The PVC is not the customer-file store.
- FTPS shares the reserved global external IP used by `gcp-dev-mqtt`; MQTT port
  `8883` and its resources remain unchanged.
- The initial development deployment uses a self-signed certificate for
  `ftps-dev.celesnity.com`. FileZilla users must explicitly accept it. A later
  production hardening task will replace it with a publicly trusted certificate
  issued through a DNS challenge.
- SFTPGo runs in the existing `celesnity` namespace so the current Core setting
  `FTPS_SFTPGO_API_URL=http://sftpgo:8080` remains correct.

## Architecture

```text
                         shared gcp-dev-mqtt static IP
                                      |
       +------------------------------+-----------------------------+
       |                              |                             |
   TCP 8883                       TCP 2121                 TCP 50000-50009
       |                              |                             |
  existing MQTT                 FTPS control                 FTPS passive data
  SSL proxy -> EMQX             TCP proxy -> SFTPGo          TCP proxies -> SFTPGo
                                                                 |
                                                               GKE namespace celesnity
                                                                 |
                            +------------------------------------+------------------+
                            |                                    |                  |
                       Core -> sftpgo:8080                 SFTPGo SQLite PVC   GCS ingress bucket
```

The shared IP is only a shared frontend address. FTPS must receive its own TCP
target proxies, backend services, health checks, and forwarding rules. It must
not reuse the MQTT SSL proxy because explicit FTPS starts as FTP and upgrades
the control connection with `AUTH TLS`.

Each TCP target proxy sends PROXY_V1 to SFTPGo. SFTPGo accepts that header only
from the Google frontend ranges and retains the passive data/control peer-IP
check. This avoids the weaker alternative of disabling FTP passive-connection
security behind a proxy.

The proxy load balancer accepts one frontend port per rule. The FTPS runtime
therefore creates rules for control port `2121` and each passive port
`50000` through `50009`, without changing the existing MQTT forwarding rule on
`8883`.

## Storage and identity

### Customer uploads

SFTPGo creates one GCS-backed virtual folder for the demo user. Its exposed
directory is `/incoming`; its object-store prefix is:

```text
tnt_<tenant>/landing/ftps/ftps-demo-user/incoming/
```

The SFTPGo Kubernetes ServiceAccount is bound to a dedicated Google
ServiceAccount through Workload Identity. SFTPGo uses GCS automatic credentials
and never receives a downloaded service-account JSON key. IAM is limited to the
dedicated ingress bucket.

The shared bootstrap helper remains compatible with local Compose: local
deployments explicitly select the existing S3/MinIO backend, while the GKE Job
sets FTPS_STORAGE_BACKEND=gcs. Deploying GKE FTPS therefore does not alter the
local MinIO virtual-folder behavior.

### SFTPGo state

SFTPGo's SQLite database holds server-side users, virtual folders, and admin
configuration. A small PVC preserves it across a single SFTPGo pod restart.
The workload remains one replica in development. A future production design
must move this state to a managed SQL data provider before adding replicas.

## Credentials and TLS

- `FTPS_DEMO_PASSWORD` and `FTPS_STATUS_PASSWORD` remain sourced from the
  existing Core runtime secret. The bootstrap job provisions exactly those
  values to the external demo user and the read-only connection-monitor admin.
- A distinct Kubernetes secret holds SFTPGo bootstrap-admin and KMS master-key
  values. It is generated/deployed through the existing Infrastructure secret
  pattern and is never committed as plaintext.
- The bootstrap admin is not exposed through a public service.
- The SFTPGo REST API is ClusterIP-only on port `8080`.
- A development-only self-signed TLS Secret is mounted into SFTPGo and generated
  for `ftps-dev.celesnity.com`. It is encrypted transport but not client-verifiable.

## Terraform and repository changes

Create a focused `infra/modules/gcp/ftps` module containing:

1. A dedicated GCS ingress bucket and bucket IAM binding for the SFTPGo Google
   service account.
2. Workload Identity resources for the SFTPGo Kubernetes service account.
3. Kubernetes resources for the SFTPGo Deployment, PVC, ConfigMap, secrets,
   ClusterIP REST service, FTPS backend service/NEGs, and bootstrap Job.
4. Self-signed certificate generation and a TLS Secret for the test endpoint.
5. Health checks, TCP backend services, TCP target proxies, firewall rule, and
   forwarding rules that use the existing MQTT static-IP resource without
   changing port `8883`.

Wire the module from `infra/environments/gcp-dev`, expose only safe outputs,
and export the MQTT address resource identifier from the streaming module for
the FTPS module to reference.

Update `scripts/ftps/bootstrap.py` so its virtual-folder payload uses the GCS
provider with automatic credentials instead of the local MinIO/S3 configuration.
Add focused Python tests for the GCS payload and validation behavior.

Document deployment, DNS, FileZilla testing, and the limits of the self-signed
development certificate in `docs/ftps-gcp.md`.

## Non-goals

- No change to the existing MQTT frontend, EMQX backend, or port `8883`.
- No public exposure of the SFTPGo REST API or bootstrap-admin account.
- No Core or Web API behavior changes.
- No production HA, multi-replica SFTPGo, or publicly trusted certificate in
  this development task.

## Acceptance criteria

1. A Terraform plan adds FTPS resources only and does not destroy or replace
   existing MQTT resources.
2. SFTPGo reaches `Running` in namespace `celesnity`, and `sftpgo:8080` has
   ready endpoints.
3. Core status returns `NO_ACTIVE_CONNECTION` when no FTPS client is connected,
   then `Success` while the configured demo user remains connected.
4. TCP port `2121` and the passive range are reachable through
   `ftps-dev.celesnity.com`.
5. A FileZilla explicit-TLS passive upload succeeds and the object appears under
   the GCS ingress prefix.
6. No secret value is committed, printed by tests, or returned in deployment
   logs.
