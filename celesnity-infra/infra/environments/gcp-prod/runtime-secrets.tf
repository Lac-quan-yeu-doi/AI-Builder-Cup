########################################
# Derived application runtime secrets
########################################

# The agent connects from GKE to the private Cloud SQL address. Keeping this URL
# in Terraform prevents every release from depending on an operator manually
# reconstructing a production-only credential. The generated database password
# is alphanumeric, so it is safe to embed without URL escaping.
resource "google_secret_manager_secret" "minder_database_url" {
  secret_id = "${var.environment}-minder-database-url"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "minder_database_url" {
  secret      = google_secret_manager_secret.minder_database_url.id
  secret_data = "postgres://${module.data.db_username}:${module.data.db_password}@${module.data.db_private_ip}:5432/${module.data.db_name}?sslmode=require"
}
