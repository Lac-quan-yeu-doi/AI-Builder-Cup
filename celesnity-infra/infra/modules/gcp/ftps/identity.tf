########################################
# GCS ingress storage and Workload Identity
#
# SFTPGo receives a GKE Workload Identity token and lets the Google SDK obtain
# Application Default Credentials. No service-account JSON key is stored in the
# Pod, ConfigMap, or bootstrap payload.
########################################

locals {
  ingress_bucket_name         = var.ingress_bucket_name != "" ? var.ingress_bucket_name : "${var.name}-ftps-ingress-${var.project_id}"
  sftpgo_service_account_name = "sftpgo"
}

resource "google_storage_bucket" "ingress" {
  name          = local.ingress_bucket_name
  location      = var.bucket_location != "" ? var.bucket_location : var.region
  force_destroy = var.force_destroy_bucket

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # The external FTPS account is upload-only, so object versioning is not needed
  # for overwrite recovery and would retain duplicate customer uploads by default.
  versioning {
    enabled = false
  }

  # Interrupted multipart uploads consume storage but are not visible to users.
  lifecycle_rule {
    action {
      type = "AbortIncompleteMultipartUpload"
    }
    condition {
      age = 7
    }
  }
}

resource "google_service_account" "sftpgo" {
  account_id   = "${var.name}-sftpgo"
  display_name = "SFTPGo FTPS ingress for ${var.name}"
}

# SFTPGo enforces the upload-only virtual-folder permissions. Its server identity
# needs object administration to create, list, and upload objects in that folder,
# plus bucket metadata read for GCS list operations. Both bindings are scoped to
# this one ingress bucket, not the project.
resource "google_storage_bucket_iam_member" "sftpgo_object_admin" {
  bucket = google_storage_bucket.ingress.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.sftpgo.email}"
}

resource "google_storage_bucket_iam_member" "sftpgo_bucket_reader" {
  bucket = google_storage_bucket.ingress.name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.sftpgo.email}"
}

resource "terraform_data" "cluster_ready" {
  input = var.cluster_dependencies
}

resource "google_service_account_iam_member" "sftpgo_workload_identity" {
  service_account_id = google_service_account.sftpgo.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.workload_identity_pool}[${var.workload_namespace}/${local.sftpgo_service_account_name}]"
}

resource "kubernetes_service_account_v1" "sftpgo" {
  metadata {
    name      = local.sftpgo_service_account_name
    namespace = var.workload_namespace

    annotations = {
      "iam.gke.io/gcp-service-account" = google_service_account.sftpgo.email
    }
  }

  depends_on = [
    google_service_account_iam_member.sftpgo_workload_identity,
    terraform_data.cluster_ready,
  ]
}
