output "endpoint" {
  description = "External explicit-FTPS endpoint. The hostname is intentionally bare in Core configuration."
  value       = "ftps://${var.hostname}:${local.ftps_control_port}"
}

output "ingress_bucket" {
  description = "GCS bucket that stores externally uploaded FTPS objects."
  value       = google_storage_bucket.ingress.name
}

output "google_service_account_email" {
  description = "Google service account SFTPGo impersonates through GKE Workload Identity."
  value       = google_service_account.sftpgo.email
}

output "namespace" {
  description = "Existing namespace that holds the SFTPGo workload and private REST Service."
  value       = var.workload_namespace
}
