# GCP Development FTPS Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy the existing SFTPGo-backed FTPS connector into the GCP development GKE cluster, publish explicit FTPS on ftps-dev.celesnity.com, store uploads in a dedicated GCS bucket, and retain Core's private in-cluster status-reader integration.

**Architecture:** A new focused GCP FTPS Terraform module creates the SFTPGo workload in the existing celesnity namespace, its GCS Workload Identity, a small SQLite PVC, and the private REST Service named sftpgo. It attaches one standalone GKE NEG per FTPS port to dedicated classic external TCP-proxy resources, all reusing the existing gcp-dev-mqtt static global IP without touching MQTT port 8883. Target TCP proxies emit PROXY_V1; SFTPGo verifies it from Google frontend ranges so the control and passive data connections retain the original client IP relationship. The bootstrap script gains a storage-backend switch: local Compose remains S3/MinIO, while the GKE Job uses GCS Application Default Credentials.

**Tech Stack:** Terraform 1.10+, Google provider 7.x, Kubernetes provider 2.x, GKE standalone NEGs, Google Cloud Storage, GKE Workload Identity, SFTPGo 2.7.5, Python standard-library unittest.

**Spec:** docs/superpowers/specs/2026-08-20-ftps-gcp-runtime-design.md

## Global constraints

- Preserve the existing local Compose FTPS behavior and credentials; do not convert its MinIO-backed virtual folder to GCS.
- Do not alter Core or Web behavior. Core already uses the required bare host ftps-dev.celesnity.com and private URL http://sftpgo:8080.
- Do not commit plaintext credentials, TLS private keys, Cloudflare tokens, or service-account JSON keys.
- The SFTPGo REST API, bootstrap administrator, GCS bucket, and SQLite PVC stay private. Only explicit FTPS control and passive data ports are public.
- The existing MQTT forwarding rule on TCP 8883 remains unchanged. The shared global IP is only reused for distinct TCP port tuples.
- The first development certificate is intentionally self-signed. DNS must be Cloudflare DNS-only, not proxied; Cloudflare's HTTP proxy does not carry FTPS.
- This module targets one SFTPGo replica. Do not enable a second replica while its data provider is SQLite on a ReadWriteOnce PVC.

---

## Task 1: Add failing tests for the storage-backend contract

**Files:**
- Create: tests/ftps/test_bootstrap.py
- Modify later: scripts/ftps/bootstrap.py

- [x] Dynamically load scripts/ftps/bootstrap.py from the test without making scripts a Python package.
- [x] Write a test that constructs a GCS BootstrapConfig and expects build_folder_payload to return provider 2, gcsconfig.bucket, gcsconfig.automatic_credentials equal to 1, and the tenant-scoped key_prefix.
- [x] Write a test that constructs an S3 BootstrapConfig and expects provider 1 plus the existing MinIO endpoint, key, and path-style configuration.
- [x] Write a test that FTPS_STORAGE_BACKEND=gcs no longer requires local MinIO credential fields, while an unsupported backend raises a validation error.
- [x] Run python -m unittest -v tests/ftps/test_bootstrap.py and confirm the GCS-specific tests fail before changing production code.

## Task 2: Make the bootstrap script support GCS without breaking local MinIO

**Files:**
- Modify: scripts/ftps/bootstrap.py
- Modify: local/compose.yaml

- [x] Add storage_backend to BootstrapConfig and validate only the fields required by the selected backend.
- [x] Split virtual-folder construction into explicit S3/MinIO and GCS payload paths, keeping build_folder_payload as the public dispatcher.
- [x] Keep the current S3 payload unchanged for storage_backend=s3, including force_path_style and secret wrapping.
- [x] Add the GCS payload using SFTPGo provider 2, gcsconfig.bucket, gcsconfig.key_prefix, and gcsconfig.automatic_credentials set to 1. Do not include credential JSON or an S3 secret.
- [x] Parse FTPS_STORAGE_BACKEND from the environment, default it to s3, and set that default explicitly in local/compose.yaml so existing local behavior is unambiguous.
- [x] Update local-only descriptions so they continue to describe MinIO accurately; never require cloud credentials locally.
- [x] Re-run the focused unittest file and confirm all cases pass.

## Task 3: Build the focused GCP FTPS Terraform module

**Files:**
- Create: infra/modules/gcp/ftps/variables.tf
- Create: infra/modules/gcp/ftps/identity.tf
- Create: infra/modules/gcp/ftps/workload.tf
- Create: infra/modules/gcp/ftps/network.tf
- Create: infra/modules/gcp/ftps/outputs.tf

- [x] Define explicit inputs for the project, region, VPC self-link, cluster zones, cluster readiness dependency, Workload Identity pool, existing workload namespace, shared MQTT global-address identifier, hostname, bucket name override, tenant prefix, image tag, PVC size, force-destroy policy, and a bootstrap revision.
- [x] In identity.tf, create a uniform-access, non-public GCS ingress bucket. Use the same naming and lifecycle conventions as infra/modules/gcp/data/storage.tf. Grant only the dedicated SFTPGo Google service account object-admin and bucket-reader access on this bucket.
- [x] Bind Kubernetes ServiceAccount sftpgo in the existing celesnity namespace to that Google service account using roles/iam.workloadIdentityUser and the iam.gke.io/gcp-service-account annotation. Do not create a second namespace.
- [x] In workload.tf, generate only the private SFTPGo bootstrap-admin password and KMS master key. Store them in an Opaque Kubernetes Secret. Keep their Terraform-state sensitivity documented and expose no secret output.
- [x] Generate a self-signed TLS key and certificate for the configured FTPS hostname and store it in a kubernetes.io/tls Secret. Include the hostname as a DNS SAN, mount it read-only into SFTPGo, and document that it is development-only.
- [x] Create a small ReadWriteOnce SQLite PVC, a ConfigMap containing scripts/ftps/bootstrap.py, and a single-replica SFTPGo Deployment using drakkan/sftpgo:v2.7.5.
- [x] Configure SFTPGo for explicit TLS only on 2121, TLS 1.2 minimum, disabled active FTP, passive range 50000-50009, disabled WebAdmin/WebClient, and private REST API on 8080.
- [x] Set passive_host to ftps-dev.celesnity.com and leave force_passive_ip empty because force_passive_ip accepts only an IPv4 address.
- [x] Configure each target TCP proxy with PROXY_V1 and SFTPGo with strict proxy protocol plus the two Google frontend source ranges 35.191.0.0/16 and 130.211.0.0/22. Keep passive connection peer checks enabled rather than disabling FTP security.
- [x] Create a ClusterIP Service named sftpgo for REST port 8080. This preserves the existing Core setting http://sftpgo:8080.
- [x] Create a separate ClusterIP backend Service with one named TCP port for 2121 and each passive port. Add the standalone NEG annotation with deterministic zone NEG names and ignore the controller-managed neg-status annotation.
- [x] Create an idempotent bootstrap Job from python:3.13-alpine. Mount the ConfigMap script, inject the runtime admin secret and FTPS_DEMO_PASSWORD/FTPS_STATUS_PASSWORD from the existing celesnity-core-secrets Secret, and set FTPS_STORAGE_BACKEND=gcs. Do not print any credential value.
- [x] Add terraform_data keyed by bootstrap revision and use lifecycle replacement so an operator can increment the revision after rotating Core FTPS credentials.
- [x] In network.tf, create one TCP health check on the private HTTP listener port 8080, one backend service and target TCP proxy per FTPS port, a GFE-only firewall rule for port 8080 plus all FTPS ports, and one global forwarding rule per public port. Each forwarding rule must reference the existing MQTT global IP identifier, use TCP/EXTERNAL, and have a unique one-port range.
- [x] Keep the NEG creation delay and deterministic zonal NEG references consistent with the existing MQTT resources in infra/modules/gcp/streaming/main.tf.

## Task 4: Wire the GCP development environment and safe outputs

**Files:**
- Modify: infra/modules/gcp/streaming/outputs.tf
- Modify: infra/environments/gcp-dev/main.tf
- Modify: infra/environments/gcp-dev/variables.tf
- Modify: infra/environments/gcp-dev/terraform.tfvars.example
- Modify: infra/environments/gcp-dev/outputs.tf

- [x] Export the existing MQTT global-address resource identifier separately from its public IP address so the FTPS module can reuse the actual reserved address without creating or replacing it.
- [x] Instantiate module ftps after module streaming and module platform. Pass module.cluster identity/zone data, module.network.network_self_link, var.workload_namespace, var.force_destroy_buckets, and the exported MQTT address identifier.
- [x] Add non-secret development variables with secure, valid defaults: ftps_hostname = ftps-dev.celesnity.com, a valid tenant prefix, SFTPGo image tag, PVC size, optional ingress-bucket override, and bootstrap revision.
- [x] Add only safe outputs: FTPS endpoint, ingress bucket name, Google service-account email, and the shared load-balancer IP. Mark all credential-bearing values absent or sensitive.
- [x] Add the equivalent non-secret example values to terraform.tfvars.example. Do not alter a real terraform.tfvars file.

## Task 5: Document deployment, DNS, and operational verification

**Files:**
- Create: docs/ftps-gcp.md
- Modify: docs/superpowers/specs/2026-08-20-ftps-gcp-runtime-design.md

- [x] Update the approved design record to note the preserved local S3/MinIO backend and the PROXY_V1 safety configuration required by the TCP proxies.
- [x] Document the ordered deployment: Core must already have deployed celesnity-core-secrets with the two FTPS keys; apply Infra; wait for SFTPGo and bootstrap Job; change Cloudflare ftps-dev record to the shared MQTT IP in DNS-only mode.
- [x] Document how to increment ftps_bootstrap_revision after intentionally rotating a Core FTPS password so the Job reconciles the SFTPGo user/admin.
- [x] Document checks that do not disclose passwords: kubectl rollout/job status, Core public status endpoint, an explicit-TLS handshake, FileZilla passive-mode upload, and a GCS prefix listing.
- [x] State the expected self-signed certificate warning and the later DNS-01 trusted-certificate hardening requirement.

## Task 6: Format, validate, and review the implementation

**Files:**
- Verify all files touched above

- [x] Run python -m unittest -v tests/ftps/test_bootstrap.py.
- [x] Run terraform fmt -check -recursive from infra/environments/gcp-dev after formatting all changed Terraform files.
- [x] Run terraform init -backend=false and terraform validate from infra/environments/gcp-dev. If provider initialization or cloud credentials are unavailable, record the exact command and failure rather than claiming a plan passed.
- [x] Run git diff --check, inspect git status --short, and verify the shared MQTT forwarding-rule resource remains unmodified.
- [x] Review the final diff for tracked secrets, direct public exposure of port 8080, accidental change to MQTT 8883, and any change to Core/Web.

## Deployment boundary

- [ ] Do not run terraform apply until the rendered plan is reviewed and credentials are available. Apply changes cloud resources and must be authorized against the active project.
- [ ] After a successful apply, the operator performs the Cloudflare DNS-only change and the documented external FTPS smoke test. A browser visit to HTTPS port 443 is not an FTPS test.
