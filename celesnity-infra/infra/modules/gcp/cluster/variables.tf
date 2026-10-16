variable "name" {
  description = "Cluster name and resource prefix."
  type        = string
}

variable "project_id" {
  description = "GCP project ID. Used to build the Workload Identity pool name."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
}

variable "zone" {
  description = <<-EOT
    Zone for a zonal cluster. Zonal rather than regional is deliberate for a dev
    environment: a regional cluster replicates the control plane across three
    zones and spreads the node pool across them, which triples node count for the
    same per-zone size and bills cross-zone traffic between Spark executors.

    Set to null for a regional cluster.
  EOT
  type        = string
  default     = null
}

variable "node_locations" {
  description = "Explicit zones used by a regional cluster. Empty lets GKE choose; production should set all intended failure domains."
  type        = list(string)
  default     = []
}

########################################
# Networking
########################################

variable "network" {
  description = "VPC network name or self link."
  type        = string
}

variable "subnet" {
  description = "Node subnet name or self link."
  type        = string
}

variable "pods_range_name" {
  description = "Secondary range name for Pod IPs."
  type        = string
}

variable "services_range_name" {
  description = "Secondary range name for Service ClusterIPs."
  type        = string
}

variable "egress_dependencies" {
  description = "Opaque values the node pool waits on so nodes never launch without working egress."
  type        = list(string)
  default     = []
}

variable "master_ipv4_cidr_block" {
  description = <<-EOT
    /28 for the GKE-managed control plane. Must not overlap the VPC ranges; GKE
    puts the control plane in a Google-owned project peered to your VPC.
  EOT
  type        = string
  default     = "172.16.0.0/28"
}

variable "enable_private_endpoint" {
  description = <<-EOT
    When true the Kubernetes API has no public address at all, reachable only from
    inside the VPC or over VPN. Requires a bastion or Cloud Shell to run kubectl,
    so it is false for dev with authorized_networks doing the restricting instead.
  EOT
  type        = bool
  default     = false
}

variable "authorized_networks" {
  description = <<-EOT
    CIDRs allowed to reach the Kubernetes API. Equivalent to
    cluster_endpoint_public_access_cidrs in the AWS build. Narrow this to your own
    address; leaving it open relies on IAM and TLS alone.
  EOT
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = []
}

########################################
# Version and upgrades
########################################

variable "release_channel" {
  description = <<-EOT
    GKE auto-upgrade channel: RAPID, REGULAR, STABLE, or EXTENDED.

    This is the closest analogue to the EKS standard/extended support decision,
    but the economics are inverted. On EKS, staying on an old version costs 6x
    after 14 months. On GKE, upgrades are automatic within the channel and there
    is no version-based surcharge, so drifting is not a billing risk.

    REGULAR is the default balance of stability and currency.
  EOT
  type        = string
  default     = "REGULAR"

  validation {
    condition     = contains(["RAPID", "REGULAR", "STABLE", "EXTENDED"], var.release_channel)
    error_message = "release_channel must be RAPID, REGULAR, STABLE, or EXTENDED."
  }
}

variable "kubernetes_version" {
  description = <<-EOT
    Optional minimum master version. Leave null to let the release channel pick,
    which is the usual choice: pinning a version while on a release channel means
    GKE upgrades past it anyway.
  EOT
  type        = string
  default     = null
}

variable "deletion_protection" {
  description = "Block `terraform destroy` from removing the cluster. False for dev so teardown is not a fight."
  type        = bool
  default     = false
}

variable "logging_components" {
  description = <<-EOT
    Which log streams GKE ships to Cloud Logging.

    GKE's own default is ["SYSTEM_COMPONENTS", "WORKLOADS"]. WORKLOADS is omitted
    here on purpose: it sends every container log to Cloud Logging at $0.50/GiB
    beyond the 50 GiB monthly free allowance, duplicating what Alloy already
    ships to Loki for roughly $0.02/GB in GCS.

    SYSTEM_COMPONENTS is retained because it covers the control plane, kubelet,
    and node agents, which Alloy cannot observe, and its volume is small.

    Set to [] to disable Cloud Logging entirely, or add "WORKLOADS" back if you
    would rather query container logs in Cloud Logging than in Grafana.
  EOT
  type        = list(string)
  default     = ["SYSTEM_COMPONENTS"]
}

variable "enable_managed_prometheus" {
  description = "Enable Google Managed Service for Prometheus managed collection."
  type        = bool
  default     = true
}

variable "monitoring_components" {
  description = "Curated GKE metric packages collected for USE dashboards."
  type        = list(string)
  default = [
    "SYSTEM_COMPONENTS",
    "POD",
    "DEPLOYMENT",
    "HPA",
    "CADVISOR",
    "KUBELET",
  ]
}

########################################
# Node pool
########################################

variable "node_machine_type" {
  description = <<-EOT
    Machine type for the node pool. e2-standard-2 is 2 vCPU / 8 GiB.

    Note the difference from the AWS build, which used t4g.medium at 2 vCPU /
    4 GiB. GCP has no direct burstable-ARM equivalent at that size in every
    region, and e2 machines are already shared-core-backed with no CPU credit
    accounting to get wrong. The extra memory per node removes the per-node
    ~2.8 GiB scheduling ceiling that constrained the AWS cluster.
  EOT
  type        = string
  default     = "e2-standard-2"
}

variable "node_count" {
  description = "Nodes in the pool."
  type        = number
  default     = 2
}

variable "node_min_count" {
  description = "Autoscaler minimum."
  type        = number
  default     = 1
}

variable "node_max_count" {
  description = "Autoscaler maximum."
  type        = number
  default     = 4
}

variable "node_disk_size_gb" {
  description = "Boot disk size per node in GB."
  type        = number
  default     = 50
}

variable "node_disk_type" {
  description = "Boot disk type. pd-standard is cheapest; pd-balanced is the GKE default."
  type        = string
  default     = "pd-balanced"
}

variable "node_spot" {
  description = <<-EOT
    Use Spot VMs. Typically 60-91% off on-demand, the equivalent lever to
    node_capacity_type = "SPOT" on AWS. Spot VMs can be preempted with 30 seconds
    notice and have no guaranteed capacity.
  EOT
  type        = bool
  default     = false
}

variable "gateway_api_channel" {
  description = <<-EOT
    Gateway API channel: CHANNEL_STANDARD or CHANNEL_DISABLED.

    CHANNEL_STANDARD installs the Gateway and HTTPRoute CRDs, the GKE policy CRDs
    (HealthCheckPolicy, GCPBackendPolicy, GCPGatewayPolicy), and the
    gke-l7-* GatewayClasses. There is no charge for the controller; you pay for
    the load balancer a Gateway creates, exactly as with an Ingress.
  EOT
  type        = string
  default     = "CHANNEL_STANDARD"

  validation {
    condition     = contains(["CHANNEL_STANDARD", "CHANNEL_DISABLED"], var.gateway_api_channel)
    error_message = "gateway_api_channel must be CHANNEL_STANDARD or CHANNEL_DISABLED."
  }
}
