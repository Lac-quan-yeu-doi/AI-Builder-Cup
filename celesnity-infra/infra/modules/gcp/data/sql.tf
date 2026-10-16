########################################
# Private services access
#
# Cloud SQL with a private IP lives in a Google-managed project peered to your
# VPC. That peering needs an address range reserved on your side first, which is
# what these two resources do. This has no AWS equivalent — RDS simply takes
# subnet IDs.
#
# The ordering is strict: the range, then the peering, then the instance. Creating
# the instance before the peering exists fails with a confusing network error.
########################################

resource "google_compute_global_address" "private_services" {
  name          = "${var.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.private_services_cidr_prefix
  network       = var.network_id
}

resource "google_service_networking_connection" "private_services" {
  network                 = var.network_id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]

  # DELETE so `terraform destroy` actually removes the peering. ABANDON lets
  # destroy finish faster but leaves a VPC peering behind that then blocks
  # recreating the network with the same ranges.
  #
  # If a destroy ever hangs here, the fallback is to set ABANDON, destroy, then
  # remove the peering by hand:
  #   gcloud compute networks peerings list --network <name>
  #   gcloud compute networks peerings delete <peering> --network <name>
  deletion_policy = "DELETE"
}

########################################
# Cloud SQL instance
########################################

resource "random_password" "db" {
  length  = 32
  special = false # Avoids quoting problems in JDBC URLs and shell commands.
}

resource "google_sql_database_instance" "this" {
  name             = "${var.name}-postgres"
  region           = var.region
  database_version = var.db_version

  deletion_protection = var.db_deletion_protection

  settings {
    # Protect against deletion through Cloud SQL APIs as well as Terraform's
    # resource-level deletion_protection guard above.
    deletion_protection_enabled = var.db_deletion_protection

    # Set explicitly, never inferred. PostgreSQL 16+ defaults to ENTERPRISE_PLUS,
    # which rejects shared-core tiers, so omitting this silently couples the
    # edition to the database version.
    edition = var.db_edition

    tier              = var.db_tier
    availability_type = var.db_availability_type
    disk_size         = var.db_disk_size_gb
    disk_type         = var.db_disk_type

    # Growth should be a decision, not automatic.
    disk_autoresize = false

    ip_configuration {
      # No public IP. Reachable only from inside the VPC over the peering above,
      # which is the equivalent of publicly_accessible = false on RDS.
      ipv4_enabled                                  = false
      private_network                               = var.network_self_link
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
    }

    # Backups hold personal data, so they are bounded rather than left to
    # accumulate. Two GDPR consequences worth being explicit about:
    #
    #   Art. 5(1)(e) storage limitation - unbounded backup retention means
    #   holding personal data indefinitely with no defined purpose.
    #
    #   Art. 17 right to erasure - a deletion is not complete while the row still
    #   exists in a backup. retained_backups sets the outer bound on how long an
    #   erasure takes to become effective, so it belongs in your documented
    #   deletion SLA: "erasure completes within N days" where N >= this value.
    backup_configuration {
      enabled = var.db_backup_enabled

      backup_retention_settings {
        retained_backups = var.db_retained_backups
        retention_unit   = "COUNT"
      }

      # Point-in-time recovery needs WAL archiving, billed as storage, and extends
      # the window in which deleted rows remain recoverable. Production enables it;
      # development can leave it off to avoid the additional WAL storage cost.
      point_in_time_recovery_enabled = var.db_point_in_time_recovery_enabled
      start_time                     = "17:00" # 00:00 Singapore time.
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 18
      update_track = "stable"
    }

    # Query Insights is billed and duplicates what Grafana already surfaces.
    insights_config {
      query_insights_enabled = false
    }
  }

  depends_on = [google_service_networking_connection.private_services]
}

resource "google_sql_database" "this" {
  name     = var.db_name
  instance = google_sql_database_instance.this.name
}

resource "google_sql_user" "this" {
  name     = var.db_username
  instance = google_sql_database_instance.this.name
  password = random_password.db.result
}

########################################
# Password in Secret Manager
#
# Cloud SQL has no equivalent of RDS's manage_master_user_password, so the
# password is generated here and stored explicitly. It lands in Terraform state
# either way; use an encrypted GCS backend with restricted access.
########################################

resource "google_secret_manager_secret" "db_password" {
  secret_id = "${var.name}-db-password"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db.result
}
