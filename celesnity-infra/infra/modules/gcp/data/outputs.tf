output "db_private_ip" {
  description = "Cloud SQL private IP, reachable only from inside the VPC."
  value       = google_sql_database_instance.this.private_ip_address
}

output "db_connection_name" {
  description = "Instance connection name, for the Cloud SQL Auth Proxy if you ever need it."
  value       = google_sql_database_instance.this.connection_name
}

output "db_instance_name" {
  description = "Cloud SQL instance resource name."
  value       = google_sql_database_instance.this.name
}

output "db_server_ca_cert" {
  description = "PEM-encoded Cloud SQL server CA certificate for TLS verification."
  value       = google_sql_database_instance.this.server_ca_cert[0].cert
}

output "db_name" {
  description = "Database name."
  value       = google_sql_database.this.name
}

output "db_username" {
  description = "Application user."
  value       = google_sql_user.this.name
}

output "db_password" {
  description = "Generated database password."
  value       = random_password.db.result
  sensitive   = true
}

output "db_password_secret_id" {
  description = "Secret Manager secret holding the database password."
  value       = google_secret_manager_secret.db_password.secret_id
}

output "warehouse_bucket" {
  description = "Iceberg warehouse bucket name."
  value       = google_storage_bucket.this["warehouse"].name
}

output "artifacts_bucket" {
  description = "Artifacts bucket name."
  value       = google_storage_bucket.this["artifacts"].name
}

output "spark_repository" {
  description = "Artifact Registry Docker path for the Spark image, without the tag."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.spark.repository_id}/spark"
}

output "apps_repository" {
  description = <<-EOT
    Artifact Registry Docker repository holding the application images, without an
    image name or tag. Cloud Build in celesnity-core and celesnity-web appends
    /core, /core-migrate, and /web.
  EOT

  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.apps.repository_id}"
}

output "apps_repository_id" {
  description = "Artifact Registry repository ID for the application images, for IAM bindings."
  value       = google_artifact_registry_repository.apps.repository_id
}
