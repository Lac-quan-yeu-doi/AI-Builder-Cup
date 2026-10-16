########################################
# Object storage
#
# Replaces MinIO locally and S3 on AWS. Reached over Private Google Access, so
# warehouse traffic never crosses Cloud NAT and is never billed as NAT data
# processing.
#
# Encryption is Google-managed by default, which is free. Customer-managed keys
# via Cloud KMS would add a per-operation charge, and Iceberg generates a lot of
# small metadata and manifest reads — the same reasoning that kept the AWS build
# on SSE-S3 rather than SSE-KMS.
########################################

locals {
  warehouse_bucket = var.warehouse_bucket_name != "" ? var.warehouse_bucket_name : "${var.name}-warehouse-${var.project_id}"
  artifacts_bucket = var.artifacts_bucket_name != "" ? var.artifacts_bucket_name : "${var.name}-artifacts-${var.project_id}"

  buckets = {
    warehouse = {
      name       = local.warehouse_bucket
      versioning = false # Iceberg snapshots already provide time travel.
    }
    artifacts = {
      name       = local.artifacts_bucket
      versioning = true
    }
  }
}

resource "google_storage_bucket" "this" {
  for_each = local.buckets

  name          = each.value.name
  location      = coalesce(var.bucket_location, var.region)
  force_destroy = var.force_destroy

  # Disables per-object ACLs so access is governed by IAM alone. Required for
  # Workload Identity to be the single source of truth on permissions.
  uniform_bucket_level_access = true

  # Belt and braces alongside uniform access.
  public_access_prevention = "enforced"

  versioning {
    enabled = each.value.versioning
  }

  # Failed Spark writes leave resumable uploads behind. They are billed as storage
  # and are invisible in an object listing until expired.
  lifecycle_rule {
    action {
      type = "AbortIncompleteMultipartUpload"
    }
    condition {
      age = 7
    }
  }

  # Versioning turns a delete into a hidden noncurrent version rather than a
  # removal. Without this rule those versions persist forever, so an Art. 17
  # erasure request would appear satisfied while the object remains retrievable.
  #
  # Only applies to the versioned bucket; the warehouse has versioning off because
  # Iceberg snapshots already provide time travel.
  dynamic "lifecycle_rule" {
    for_each = each.value.versioning ? [1] : []

    content {
      action {
        type = "Delete"
      }
      condition {
        with_state                 = "ARCHIVED"
        days_since_noncurrent_time = var.noncurrent_version_retention_days
      }
    }
  }
}

########################################
# Artifact Registry
#
# Replaces ECR. Container Registry (gcr.io) is deprecated, so this is the current
# option. Repository format is Docker; the image path becomes
#   <region>-docker.pkg.dev/<project>/<repo>/<image>:<tag>
########################################

resource "google_artifact_registry_repository" "spark" {
  location      = var.region
  repository_id = "${var.name}-spark"
  format        = "DOCKER"
  description   = "Custom Spark image with Iceberg and cloud storage bundles"

  # Untagged layers accumulate on every rebuild and are billed per GB.
  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s" # 7 days
    }
  }

  cleanup_policies {
    id     = "keep-recent-tagged"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }
}

# Application images, pushed by Cloud Build from celesnity-core and celesnity-web
# rather than by `make image-push` from this repo.
#
# One repository holding several images, not one repository per service. Artifact
# Registry charges for storage rather than per repository, so the split would buy
# nothing, while a shared repository means Cloud Build needs artifactregistry.writer
# on exactly one resource. The image name is the last path segment:
#
#   <region>-docker.pkg.dev/<project>/<name>-apps/core
#   <region>-docker.pkg.dev/<project>/<name>-apps/core-migrate
#   <region>-docker.pkg.dev/<project>/<name>-apps/web
#
# keep_count is higher than the Spark repository's because these are rebuilt on
# every push to the development branch, and rollback wants more than ten tags of
# history.
resource "google_artifact_registry_repository" "apps" {
  location      = var.region
  repository_id = "${var.name}-apps"
  format        = "DOCKER"
  description   = "celesnity-core and celesnity-web application images, built by Cloud Build"

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s" # 7 days
    }
  }

  cleanup_policies {
    id     = "keep-recent-tagged"
    action = "KEEP"

    most_recent_versions {
      keep_count = 30
    }
  }
}
