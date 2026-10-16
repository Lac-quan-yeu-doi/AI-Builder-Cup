variable "name" {
  description = "Name prefix for every resource in this module."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
}

variable "subnet_cidr" {
  description = "Primary range for the subnet. Nodes get addresses from here."
  type        = string
  default     = "10.30.0.0/20"
}

variable "pods_cidr" {
  description = <<-EOT
    Secondary range for Pod IPs. GKE assigns each node a /24 from this range by
    default, so a /16 supports 256 nodes. This is the GCP analogue of sizing AWS
    private subnets for the VPC CNI, except the ranges are explicit rather than
    carved out of the node subnet.
  EOT
  type        = string
  default     = "10.31.0.0/16"
}

variable "services_cidr" {
  description = "Secondary range for Service ClusterIPs."
  type        = string
  default     = "10.32.0.0/20"
}

variable "enable_cloud_nat" {
  description = <<-EOT
    Provision Cloud Router and Cloud NAT so private nodes can reach the public
    internet.

    Required for pulling images that are not on Google infrastructure: the
    trinodb/trino, grafana/loki, grafana/grafana, and grafana/alloy images all
    come from Docker Hub. Google APIs (Artifact Registry, GCS, Cloud SQL admin)
    do NOT need this because Private Google Access covers them at no cost.
  EOT
  type        = bool
  default     = true
}

variable "nat_log_config" {
  description = "Cloud NAT logging. ERRORS_ONLY keeps the log volume, and therefore the bill, small."
  type        = string
  default     = "ERRORS_ONLY"

  validation {
    condition     = contains(["ERRORS_ONLY", "TRANSLATIONS_ONLY", "ALL", "NONE"], var.nat_log_config)
    error_message = "nat_log_config must be ERRORS_ONLY, TRANSLATIONS_ONLY, ALL, or NONE."
  }
}
