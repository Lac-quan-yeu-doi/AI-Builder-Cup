# GCP development FTPS runtime

This guide deploys the SFTPGo FTPS server that Celesnity Core already describes
to the Web UI. It does not change Core's public contract:

- public endpoint: ftps-dev.celesnity.com:2121
- transfer mode: explicit FTPS (AUTH TLS), passive mode
- private Core status URL: http://sftpgo:8080

The GKE workload is a single SFTPGo replica in namespace celesnity. Uploaded
customer files go to GCS; the small PVC contains only SFTPGo's SQLite
configuration database.

## Before applying Infrastructure

Create and pin these two regional Secret Manager values before the Terraform
apply:

- FTPS_DEMO_PASSWORD
- FTPS_STATUS_PASSWORD

Terraform reads the pinned versions ephemerally and writes them to the dedicated
Kubernetes Secret sftpgo-client-credentials through write-only attributes. The
payloads therefore do not enter plans or state, and the Infra bootstrap no longer
depends on Core having deployed first. Core reads the same Secret Manager values
when its own runtime Secret is rendered.

Both values must be distinct high-entropy values of at least 16 characters;
Core validates that requirement when it runs with NODE_ENV=production.

Core's GCP development ConfigMap must keep these non-secret values:

~~~
FTPS_PUBLIC_HOST=ftps-dev.celesnity.com
FTPS_PUBLIC_PORT=2121
FTPS_SFTPGO_API_URL=http://sftpgo:8080
~~~

FTPS_PUBLIC_HOST is a hostname only. Do not add ftps://, :2121, or /incoming.

## Apply the development module

From D:\celesnity-infra, authenticate with the Google Application Default
Credentials used by Terraform, then review the plan:

~~~powershell
terraform -chdir=infra/environments/gcp-dev init
terraform -chdir=infra/environments/gcp-dev plan
terraform -chdir=infra/environments/gcp-dev apply
~~~

The plan must add the FTPS resources and must not replace or destroy the
existing gcp-dev-mqtt forwarding rule on port 8883.

The apply creates:

- a dedicated, non-public GCS ingress bucket;
- a Workload Identity-bound sftpgo Kubernetes ServiceAccount;
- the SFTPGo Deployment, SQLite PVC, private REST Service, and bootstrap Job;
- one TCP proxy/backend/forwarding rule for control port 2121 and each passive
  port from 50000 through 50009;
- a self-signed TLS Secret for ftps-dev.celesnity.com.

The TCP rules use the existing MQTT reserved global IP only on distinct ports.
They do not use the MQTT SSL proxy or the shared HTTPS Gateway.

## Configure Cloudflare DNS

After apply, read the shared IP:

~~~powershell
terraform -chdir=infra/environments/gcp-dev output -raw ftps_load_balancer_ip
~~~

In Cloudflare, create or update the normal A record for ftps-dev to this IP.
Set its proxy status to **DNS only** (grey cloud).

Do not use a Cloudflare HTTP Load Balancer or orange-cloud proxy for this
record: FTPS is not HTTP and needs both the control and passive TCP ports to
reach the GCP TCP proxies directly.

## Verify inside GKE

~~~powershell
kubectl -n celesnity rollout status deployment/sftpgo --timeout=5m
kubectl -n celesnity get pods,svc,pvc
kubectl -n celesnity get jobs -l app.kubernetes.io/name=sftpgo-bootstrap
kubectl -n celesnity logs job/<the-bootstrap-job-name>
~~~

The bootstrap log reports only created/reconciled actions, never credentials.
Core's safe status endpoint should change from STATUS_SERVICE_UNAVAILABLE to
NO_ACTIVE_CONNECTION before a client is connected:

~~~powershell
Invoke-RestMethod https://api-dev.celesnity.com/api/v1/ftps-connector/status
~~~

## Verify the external FTPS endpoint

First check the control port:

~~~powershell
Test-NetConnection ftps-dev.celesnity.com -Port 2121
~~~

For a protocol-level TLS handshake, use OpenSSL:

~~~powershell
openssl s_client -connect ftps-dev.celesnity.com:2121 -starttls ftp -servername ftps-dev.celesnity.com
~~~

The initial certificate is self-signed, so a certificate warning is expected.
The connection is encrypted but not publicly trusted.

In FileZilla configure:

| Field | Value |
|---|---|
| Protocol | FTP |
| Host | ftps-dev.celesnity.com |
| Port | 2121 |
| Encryption | Require explicit FTP over TLS |
| Logon type | Normal |
| User | ftps-demo-user |
| Transfer mode | Passive |
| Remote path | /incoming |

Obtain the demo password through the Core/Web FTPS connector UI rather than
from Kubernetes or Terraform output. Keep FileZilla connected while calling
the Core status endpoint; it should report Success for the configured user.
Upload a non-sensitive test file, then verify its GCS prefix:

~~~powershell
$bucket = terraform -chdir=infra/environments/gcp-dev output -raw ftps_ingress_bucket
gcloud storage ls "gs://$bucket/tnt_gcpdev000001/landing/ftps/ftps-demo-user/incoming/"
~~~

A browser visit to https://ftps-dev.celesnity.com tests port 443, not the FTPS
service, and is not a valid smoke test.

## Password rotation

Rotate either Core FTPS password through its existing Secret Manager and Core
deployment flow first. Then increment the non-secret Terraform variable:

~~~hcl
ftps_bootstrap_revision = "v2"
~~~

Run Terraform apply again. The revision replaces the idempotent bootstrap Job,
which resets the external demo user and private status-monitor password from
the updated celesnity-core-secrets values.

## Development limits

- One replica only: SQLite on a ReadWriteOnce PVC is not an HA data provider.
- The SFTPGo REST API is private; never publish port 8080.
- Local Compose remains S3/MinIO-backed. GKE sets
  FTPS_STORAGE_BACKEND=gcs and uses Workload Identity instead of a credential
  file.
- Before real partner production use, replace the self-signed certificate with
  a publicly trusted certificate, preferably issued by DNS-01 using a tightly
  scoped Cloudflare API token.
