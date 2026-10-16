########################################
# Loki object storage
#
# Loki keeps chunks and its TSDB index in GCS rather than on a persistent disk:
# cheaper per GB than pd-balanced, and log history survives pod rescheduling.
# Traffic reaches GCS over Private Google Access, so it never crosses Cloud NAT.
########################################

locals {
  loki_bucket = var.loki_bucket_name != "" ? var.loki_bucket_name : "${var.name}-loki-${var.project_id}"

  loki_push_url = var.loki_write_endpoint != "" ? var.loki_write_endpoint : "http://loki.${var.namespace}.svc.cluster.local:3100/loki/api/v1/push"
}

resource "google_storage_bucket" "loki" {
  count = var.install_loki ? 1 : 0

  name     = local.loki_bucket
  location = var.region

  # Logs are reproducible; never block a teardown on them.
  force_destroy = true

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    action {
      type = "AbortIncompleteMultipartUpload"
    }
    condition {
      age = 3
    }
  }

  # The Loki compactor enforces retention inside the index, but orphaned objects
  # still accrue storage charges. Deliberately longer than loki_retention_hours so
  # the compactor stays the authority and this only catches what it misses.
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = ceil(var.loki_retention_hours / 24) + 7
    }
  }
}

########################################
# Loki identity
#
# Same two-sided Workload Identity wiring as the workload service account: an IAM
# binding granting the Kubernetes principal permission to impersonate, plus an
# annotation on the ServiceAccount the Loki chart creates.
########################################

resource "google_service_account" "loki" {
  count = var.install_loki ? 1 : 0

  account_id   = "${var.name}-loki"
  display_name = "Loki log storage for ${var.name}"
}

# objectAdmin rather than objectCreator: the compactor deletes chunks to enforce
# retention.
resource "google_storage_bucket_iam_member" "loki" {
  count = var.install_loki ? 1 : 0

  bucket = google_storage_bucket.loki[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.loki[0].email}"
}

resource "google_storage_bucket_iam_member" "loki_bucket_reader" {
  count = var.install_loki ? 1 : 0

  bucket = google_storage_bucket.loki[0].name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.loki[0].email}"
}

resource "google_service_account_iam_member" "loki" {
  count = var.install_loki ? 1 : 0

  service_account_id = google_service_account.loki[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.workload_identity_pool}[${var.namespace}/loki]"
}
