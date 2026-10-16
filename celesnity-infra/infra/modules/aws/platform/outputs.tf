output "namespace" {
  description = "Namespace holding the Trino and Spark workloads."
  value       = kubernetes_namespace_v1.workload.metadata[0].name
}

output "service_account" {
  description = "ServiceAccount that Trino and Spark pods run as. Bound to workload_role_arn by an EKS pod identity association."
  value       = kubernetes_service_account_v1.workload.metadata[0].name
}

output "workload_role_arn" {
  description = "IAM role assumed by Trino and Spark pods for S3 access."
  value       = aws_iam_role.workload.arn
}

output "database_secret_name" {
  description = "Kubernetes Secret carrying database connection details."
  value       = kubernetes_secret_v1.database.metadata[0].name
}

output "storage_config_map_name" {
  description = "Kubernetes ConfigMap carrying bucket names and region."
  value       = kubernetes_config_map_v1.storage.metadata[0].name
}

output "alb_controller_installed" {
  description = "Whether the AWS Load Balancer Controller was installed."
  value       = var.install_alb_controller
}

output "trino_username" {
  description = "Trino user for client authentication."
  value       = var.trino_username
}

output "trino_password" {
  description = "Generated Trino password. Sensitive; read with `terraform output -raw trino_password`."
  value       = random_password.trino_user.result
  sensitive   = true
}

output "trino_connect_command" {
  description = <<-EOT
    How to reach the authenticated coordinator. --insecure is required because the
    certificate is self-signed; the transport is still encrypted.
  EOT
  value = join("\n", [
    "kubectl -n ${var.namespace} port-forward svc/trino-coordinator 8443:8443 &",
    "trino --server https://localhost:8443 --user ${var.trino_username} --password --insecure",
  ])
}
