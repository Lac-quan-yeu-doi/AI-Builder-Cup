locals {
  # The Identity Platform tenant ID is already managed by the identity module.
  # Only these six bootstrap identifiers need new Secret Manager containers.
  identifiers = toset([
    "bootstrap-organization-id",
    "bootstrap-organization-slug",
    "bootstrap-organization-name",
    "bootstrap-home-region",
    "bootstrap-owner-subject",
    "bootstrap-owner-email",
  ])

  core_build_member = "serviceAccount:${var.core_build_service_account_email}"
}

# Manage metadata, replication and IAM in Terraform. Approved identifier values
# are added as versions outside Terraform so owner PII never enters its state.
resource "google_secret_manager_secret" "bootstrap" {
  for_each = local.identifiers

  project   = var.project_id
  secret_id = "${var.environment}-auth-${each.value}"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "core_build_bootstrap" {
  for_each = google_secret_manager_secret.bootstrap

  project   = var.project_id
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.core_build_member
}

resource "google_secret_manager_secret_iam_member" "core_build_tenant_id" {
  project   = var.project_id
  secret_id = "projects/${var.project_id}/secrets/${var.tenant_id_secret_id}"
  role      = "roles/secretmanager.secretAccessor"
  member    = local.core_build_member
}
