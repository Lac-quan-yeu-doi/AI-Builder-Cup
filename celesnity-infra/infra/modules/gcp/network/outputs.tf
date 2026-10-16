output "network_id" {
  description = "VPC network ID."
  value       = google_compute_network.this.id
}

output "network_name" {
  description = "VPC network name."
  value       = google_compute_network.this.name
}

output "network_self_link" {
  description = "VPC self link, required by Cloud SQL private IP configuration."
  value       = google_compute_network.this.self_link
}

output "subnet_id" {
  description = "Node subnet ID."
  value       = google_compute_subnetwork.this.id
}

output "subnet_name" {
  description = "Node subnet name."
  value       = google_compute_subnetwork.this.name
}

output "pods_range_name" {
  description = "Secondary range name for Pod IPs, referenced by the cluster's ip_allocation_policy."
  value       = google_compute_subnetwork.this.secondary_ip_range[0].range_name
}

output "services_range_name" {
  description = "Secondary range name for Service ClusterIPs."
  value       = google_compute_subnetwork.this.secondary_ip_range[1].range_name
}

output "egress_dependencies" {
  description = <<-EOT
    Cloud NAT resources that must exist before private nodes are created.

    The AWS build learned this the hard way: nodes launched into a subnet with no
    working egress come up, fail to pull images, never register, and the node pool
    fails ~25 minutes later with no useful error. Consumers depend on this.
  EOT
  value = compact([
    try(google_compute_router_nat.this[0].id, null),
    google_compute_subnetwork.this.id,
  ])
}

output "egress_description" {
  description = "Human-readable summary of the egress path."
  value = var.enable_cloud_nat ? (
    "cloud-nat:${try(google_compute_router_nat.this[0].name, "pending")} (Google APIs bypass via Private Google Access)"
  ) : "private-google-access-only (no public internet egress)"
}
