output "namespace" {
  description = "Namespace holding the logging stack."
  value       = kubernetes_namespace_v1.monitoring.metadata[0].name
}

output "loki_bucket" {
  description = "GCS bucket backing Loki chunks and index."
  value       = var.install_loki ? google_storage_bucket.loki[0].name : null
}

output "loki_service_account_email" {
  description = "Google service account Loki impersonates for GCS access."
  value       = var.install_loki ? google_service_account.loki[0].email : null
}

output "loki_push_url" {
  description = "Endpoint Alloy ships logs to."
  value       = local.loki_push_url
}

output "grafana_admin_password_command" {
  description = "Read the generated Grafana admin password without printing it to Terraform output."
  value = var.install_grafana ? join(" ", [
    "kubectl -n ${var.namespace} get secret grafana-admin",
    "-o jsonpath='{.data.admin-password}' | base64 -d",
  ]) : null
}

output "grafana_port_forward_command" {
  description = "Reach Grafana without exposing it."
  value       = var.install_grafana ? "kubectl -n ${var.namespace} port-forward svc/grafana 3000:80" : null
}

output "grafana_url" {
  description = "Public Grafana URL, or null when Grafana is private."
  value       = local.publish_grafana ? "https://${var.grafana_hostname}" : null
}

output "grafana_service_account_email" {
  description = "Google service account Grafana uses to query Cloud Monitoring."
  value       = var.install_grafana ? google_service_account.grafana[0].email : null
}
