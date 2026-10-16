output "namespace" {
  description = "Namespace holding the logging stack."
  value       = kubernetes_namespace_v1.monitoring.metadata[0].name
}

output "loki_bucket" {
  description = "S3 bucket backing Loki chunks and index."
  value       = var.install_loki ? aws_s3_bucket.loki[0].id : null
}

output "loki_role_arn" {
  description = "IAM role Loki assumes for S3 access."
  value       = var.install_loki ? aws_iam_role.loki[0].arn : null
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

output "estimated_memory_reserved_mib" {
  description = <<-EOT
    Cluster memory this stack reserves via limits. Alloy is a DaemonSet, so its
    share scales with node count; pass node_count to see the real total.
  EOT
  value = {
    loki    = var.install_loki ? var.loki_memory_limit : "0"
    grafana = var.install_grafana ? var.grafana_memory_limit : "0"
    alloy   = "${var.alloy_memory_limit} per node"
  }
}
