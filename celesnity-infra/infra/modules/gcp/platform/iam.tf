locals {
  workload_identities = {
    # Core's S3-compatible client still requires an HMAC key. This identity is
    # deliberately not mounted into a pod; Cloud Build creates the HMAC pair
    # for it and stores that pair in Secret Manager.
    (var.service_account_name) = { kubernetes = false, automount = false, storage_buckets = ["warehouse", "artifacts"], identity_permissions = [] }
    "celesnity-core-api"       = { kubernetes = true, automount = false, storage_buckets = ["artifacts"], identity_permissions = [] }
    "celesnity-core-worker"    = { kubernetes = true, automount = false, storage_buckets = [], identity_permissions = [] }
    "celesnity-web"            = { kubernetes = true, automount = false, storage_buckets = [], identity_permissions = ["firebaseauth.configs.get", "firebaseauth.users.createSession", "firebaseauth.users.get", "firebaseauth.users.update"] }
    # The platform control plane creates and configures customer Identity
    # Platform tenants. Keep it on a dedicated identity so this administrative
    # full administrative role is never inherited by Web or Core pods.
    "celesnity-control-plane-web" = { kubernetes = true, automount = false, storage_buckets = [], identity_permissions = [] }
    "celesnity-trino"             = { kubernetes = true, automount = false, storage_buckets = ["warehouse"], identity_permissions = [] }
    # Long-running streams read/write Iceberg data in the warehouse bucket and
    # persist Spark checkpoints in the artifacts bucket.
    "celesnity-spark-runtime" = { kubernetes = true, automount = false, storage_buckets = ["warehouse", "artifacts"], identity_permissions = [] }
    # Core Worker creates and watches these Jobs. The driver itself uses the
    # standalone Spark master and therefore does not need a Kubernetes API token.
    "celesnity-spark-job"           = { kubernetes = true, automount = false, storage_buckets = ["warehouse"], identity_permissions = [] }
    "celesnity-iceberg-maintenance" = { kubernetes = true, automount = false, storage_buckets = ["warehouse"], identity_permissions = [] }
    "celesnity-mcp-trino"           = { kubernetes = true, automount = false, storage_buckets = [], identity_permissions = [] }
    "celesnity-redpanda-connect"    = { kubernetes = true, automount = false, storage_buckets = [], identity_permissions = [] }
    "celesnity-redpanda-bootstrap"  = { kubernetes = true, automount = false, storage_buckets = [], identity_permissions = [] }
  }
  kubernetes_identities = { for name, config in local.workload_identities : name => config if config.kubernetes }
  storage_buckets = {
    warehouse = var.warehouse_bucket
    artifacts = var.artifacts_bucket
  }
  storage_bindings = merge([
    for identity, config in local.workload_identities : {
      for bucket_key in config.storage_buckets : "${identity}:${bucket_key}" => {
        identity = identity
        bucket   = local.storage_buckets[bucket_key]
      }
    }
  ]...)
  identity_permissions = toset(flatten([for config in values(local.workload_identities) : config.identity_permissions]))
  identity_user_administration_permissions = toset([
    "firebaseauth.users.create",
    "firebaseauth.users.delete",
    "firebaseauth.users.get",
    "firebaseauth.users.sendEmail",
    "identitytoolkit.tenants.update",
  ])
}

resource "google_service_account" "workload" {
  for_each     = local.workload_identities
  account_id   = substr("${var.name}-${replace(each.key, "celesnity-", "")}", 0, 30)
  display_name = "${each.key} workload for ${var.name}"
}

resource "google_storage_bucket_iam_member" "workload" {
  for_each = local.storage_bindings
  bucket   = each.value.bucket
  role     = "roles/storage.objectAdmin"
  member   = "serviceAccount:${google_service_account.workload[each.value.identity].email}"
}

resource "google_storage_bucket_iam_member" "workload_legacy_reader" {
  for_each = local.storage_bindings
  bucket   = each.value.bucket
  role     = "roles/storage.legacyBucketReader"
  member   = "serviceAccount:${google_service_account.workload[each.value.identity].email}"
}

resource "google_project_iam_custom_role" "identity_session" {
  role_id     = replace("${var.name}_identity_session", "-", "_")
  title       = "Celesnity Identity Session Boundary"
  description = "Minimum Identity Platform permissions for Core verification and Web session management."
  permissions = local.identity_permissions
}

resource "google_project_iam_member" "identity_session" {
  for_each = { for name, config in local.workload_identities : name => config if length(config.identity_permissions) > 0 }
  project  = var.project_id
  role     = google_project_iam_custom_role.identity_session.id
  member   = "serviceAccount:${google_service_account.workload[each.key].email}"
}

# Organization owners invite members through Core. Give only the Core API the
# tenant-user lifecycle permissions needed to look up or create that user, send
# the short-lived password setup link, and roll the user back when link creation
# fails. Core also enables TOTP on its configured tenant when an organization
# administrator opts in to MFA. Keep these permissions out of Web and workers.
resource "google_project_iam_custom_role" "identity_user_administration" {
  role_id     = replace("${var.name}_identity_user_administration", "-", "_")
  title       = "Celesnity Tenant User Administration"
  description = "Identity Platform user lifecycle and tenant MFA configuration for Core."
  permissions = local.identity_user_administration_permissions
}

resource "google_project_iam_member" "identity_user_administration" {
  project = var.project_id
  role    = google_project_iam_custom_role.identity_user_administration.id
  member  = "serviceAccount:${google_service_account.workload["celesnity-core-api"].email}"
}

resource "google_project_iam_member" "control_plane_identity_admin" {
  project = var.project_id
  role    = "roles/identityplatform.admin"
  member  = "serviceAccount:${google_service_account.workload["celesnity-control-plane-web"].email}"
}

resource "google_service_account_iam_member" "workload" {
  for_each           = local.kubernetes_identities
  service_account_id = google_service_account.workload[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.workload_identity_pool}[${var.namespace}/${each.key}]"
}

# GCS V4 signed download URLs are created by the Core API only when dispatching
# an OTA command. The service account may sign as itself; no other workload can
# impersonate it, and devices receive only the short-lived object URL.
resource "google_service_account_iam_member" "core_api_self_signer" {
  service_account_id = google_service_account.workload["celesnity-core-api"].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.workload["celesnity-core-api"].email}"
}

resource "google_project_service" "cloudkms" {
  count              = var.enable_firmware_kms ? 1 : 0
  project            = var.project_id
  service            = "cloudkms.googleapis.com"
  disable_on_destroy = false
}

resource "google_kms_key_ring" "firmware" {
  count    = var.enable_firmware_kms ? 1 : 0
  name     = "${var.name}-firmware"
  project  = var.project_id
  location = var.region

  depends_on = [google_project_service.cloudkms]
}

# Firmware manifests are signed by KMS. The private key is non-exportable; only
# the public key is provisioned into devices during a controlled trust rollout.
resource "google_kms_crypto_key" "firmware_signing" {
  count                      = var.enable_firmware_kms ? 1 : 0
  name                       = "${var.name}-firmware-signing"
  key_ring                   = google_kms_key_ring.firmware[0].id
  purpose                    = "ASYMMETRIC_SIGN"
  destroy_scheduled_duration = "2592000s"

  version_template {
    algorithm        = "EC_SIGN_ED25519"
    protection_level = "SOFTWARE"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key_iam_member" "core_api_firmware_signer" {
  count         = var.enable_firmware_kms ? 1 : 0
  crypto_key_id = google_kms_crypto_key.firmware_signing[0].id
  role          = "roles/cloudkms.signer"
  member        = "serviceAccount:${google_service_account.workload["celesnity-core-api"].email}"
}

resource "kubernetes_service_account_v1" "workload" {
  for_each = local.kubernetes_identities
  metadata {
    name      = each.key
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
    annotations = {
      "iam.gke.io/gcp-service-account" = google_service_account.workload[each.key].email
    }
  }
  automount_service_account_token = each.value.automount
}

# The agent runs in its own namespace and authenticates to Core with a
# short-lived Google-signed ID token. It receives no static application secret
# and its namespace is not labelled for external Gateway attachment.
resource "google_service_account" "agent" {
  account_id   = substr("${var.name}-agent", 0, 30)
  display_name = "Celesnity agent workload for ${var.name}"
}

resource "kubernetes_namespace_v1" "agent" {
  metadata {
    name = var.agent_namespace
    labels = {
      "celesnity.io/gateway-access" = "false"
    }
  }
  depends_on = [terraform_data.cluster_ready]
}

resource "google_service_account_iam_member" "agent_workload_identity" {
  service_account_id = google_service_account.agent.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.workload_identity_pool}[${var.agent_namespace}/${var.agent_service_account_name}]"
}

resource "kubernetes_service_account_v1" "agent" {
  metadata {
    name      = var.agent_service_account_name
    namespace = kubernetes_namespace_v1.agent.metadata[0].name
    annotations = {
      "iam.gke.io/gcp-service-account" = google_service_account.agent.email
    }
  }
  automount_service_account_token = true
}
