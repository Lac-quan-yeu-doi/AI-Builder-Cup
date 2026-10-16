output "cluster_name" {
  description = "GKE cluster name."
  value       = google_container_cluster.this.name
}

output "cluster_location" {
  description = "Zone for a zonal cluster, region for a regional one."
  value       = google_container_cluster.this.location
}

output "cluster_zones" {
  description = "Zones containing cluster nodes. One entry for zonal clusters and every active node location for regional clusters."
  value       = var.zone != null ? [var.zone] : (length(var.node_locations) > 0 ? var.node_locations : google_container_cluster.this.node_locations)
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint."
  value       = google_container_cluster.this.endpoint
}

output "cluster_ca_certificate" {
  description = "Base64-encoded cluster CA, for provider configuration."
  value       = google_container_cluster.this.master_auth[0].cluster_ca_certificate
}

output "cluster_version" {
  description = "Running Kubernetes version, set by the release channel."
  value       = google_container_cluster.this.master_version
}

output "workload_identity_pool" {
  description = <<-EOT
    Workload Identity pool, "PROJECT_ID.svc.id.goog". Used to build the member
    string that binds a Kubernetes ServiceAccount to a Google service account.
  EOT
  value       = "${var.project_id}.svc.id.goog"
}

output "node_service_account_email" {
  description = "Service account the nodes themselves run as. Pods do not inherit it."
  value       = google_service_account.node.email
}

output "node_pool_name" {
  description = "Node pool name."
  value       = google_container_node_pool.default.name
}

output "cluster_ready" {
  description = <<-EOT
    Depend on this to sequence Kubernetes resources after the cluster is usable.
    GKE has no addon resources to wait on the way EKS does — CoreDNS (kube-dns),
    the persistent disk CSI driver, and the metadata server are all built in and
    ready once the node pool is up.
  EOT
  value       = [google_container_node_pool.default.id]
}

output "kubeconfig_command" {
  description = "Command to point kubectl at this cluster."
  value = join(" ", [
    "gcloud container clusters get-credentials",
    google_container_cluster.this.name,
    var.zone != null ? "--zone ${var.zone}" : "--region ${var.region}",
    "--project ${var.project_id}",
  ])
}
