output "namespace" {
  description = "Namespace holding the Trino and Spark workloads."
  value       = kubernetes_namespace_v1.workload.metadata[0].name
}

output "service_account" {
  description = "Deprecated compatibility output. Data-plane workloads now use dedicated Kubernetes ServiceAccounts."
  value       = "celesnity-spark-runtime"
}

output "workload_service_account_email" {
  description = "Dedicated Google service account used to issue Core's GCS HMAC key."
  value       = google_service_account.workload[var.service_account_name].email
}

output "workload_service_accounts" {
  description = "Dedicated Google workload identities keyed by Kubernetes ServiceAccount name."
  value       = { for name, account in google_service_account.workload : name => account.email }
}

output "agent_service_account_email" {
  description = "Google service account whose short-lived ID tokens Core accepts for agent-only routes."
  value       = google_service_account.agent.email
}

output "agent_kubernetes_service_account" {
  description = "Namespace and Kubernetes ServiceAccount bound to the agent Google service account."
  value = {
    namespace = kubernetes_namespace_v1.agent.metadata[0].name
    name      = kubernetes_service_account_v1.agent.metadata[0].name
  }
}

output "database_secret_name" {
  description = "Kubernetes Secret carrying database connection details."
  value       = kubernetes_secret_v1.database.metadata[0].name
}

output "storage_config_map_name" {
  description = "Kubernetes ConfigMap carrying bucket names, project, and region."
  value       = kubernetes_config_map_v1.storage.metadata[0].name
}

output "trino_username" {
  description = "Trino user for client authentication."
  value       = var.trino_username
}

output "trino_secret_manager_versions" {
  description = "Pinned Secret Manager references for Trino credentials and TLS; values are never output."
  value = {
    tls           = { secret = "${var.name}-trino-tls-pem", version = var.trino_tls_secret_version }
    ca            = { secret = "${var.name}-trino-ca-pem", version = var.trino_ca_secret_version }
    user_password = { secret = "${var.name}-trino-user-password", version = var.trino_user_password_secret_version }
    shared_secret = { secret = "${var.name}-trino-shared-secret", version = var.trino_shared_secret_version }
  }
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

output "trino_lb_address" {
  description = "Reserved external address of the Trino load balancer, or null when disabled."
  value       = var.enable_external_lb ? google_compute_global_address.trino_lb[0].address : null
}

output "trino_lb_static_ip_name" {
  description = <<-EOT
    Name of the reserved address. The Ingress in deploy/overlays/gcp-dev
    references this through the kubernetes.io/ingress.global-static-ip-name
    annotation and the two must match.
  EOT
  value       = var.enable_external_lb ? google_compute_global_address.trino_lb[0].name : null
}

output "trino_lb_security_policy" {
  description = "Cloud Armor policy guarding the load balancer, referenced by the BackendConfig."
  value       = var.enable_external_lb ? google_compute_security_policy.trino_lb[0].name : null
}

output "trino_lb_source_restriction" {
  description = "Whether Cloud Armor restricts who can reach the load balancer."
  value = var.enable_external_lb ? (
    length(var.lb_allowed_source_ranges) > 0
    ? "restricted to ${length(var.lb_allowed_source_ranges)} range(s)"
    : "OPEN TO THE INTERNET - set lb_allowed_source_ranges"
  ) : null
}

output "trino_lb_certificate_map" {
  description = "Certificate map the Gateway attaches through networking.gke.io/certmap, or null when serving the self-signed fallback."
  value       = local.use_cert_map ? google_certificate_manager_certificate_map.trino_lb[0].name : null
}

output "trino_lb_tls_mode" {
  description = "Which certificate the load balancer serves, and whether clients can verify it."
  value = var.enable_external_lb ? (
    local.use_cert_map
    ? "Certificate Manager '${var.lb_certificate_name}' via map - verifiable, no --insecure needed"
    : "self-signed - encrypted but UNVERIFIABLE, clients must pass --insecure"
  ) : null
}

output "trino_lb_connect_command" {
  description = <<-EOT
    How to reach the coordinator through the load balancer. Provisioning takes
    several minutes after the Gateway is applied.
  EOT
  value = var.enable_external_lb ? join("\n", [
    "trino --server https://${var.lb_hostname != "" ? var.lb_hostname : google_compute_global_address.trino_lb[0].address} \\",
    # --insecure only when the certificate cannot be verified. Keeping it in the
    # command once a real certificate is in place would silently disable the
    # verification that certificate exists to provide.
    "  --user ${var.trino_username} --password${local.use_cert_map ? "" : " --insecure"}",
  ]) : null
}
