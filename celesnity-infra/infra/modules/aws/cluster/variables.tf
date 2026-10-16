variable "name" {
  description = "Name prefix and EKS cluster name."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets for the control plane cross-account ENIs. Must span at least two AZs."
  type        = list(string)
}

variable "node_subnet_ids" {
  description = <<-EOT
    Subnets the managed node group launches into. Pass a single subnet to pin
    nodes to one AZ and avoid cross-AZ transfer (~$0.01/GB each direction),
    which is the dominant network cost for Spark shuffle and Trino exchange.
  EOT
  type        = list(string)
}

variable "egress_dependencies" {
  description = <<-EOT
    Opaque values the node group waits on before launching. Pass the network
    module's egress_route_ids: without a working default route, nodes cannot pull
    images from ECR and never reach Ready.
  EOT
  type        = list(string)
  default     = []
}

########################################
# Control plane
########################################

variable "kubernetes_version" {
  description = <<-EOT
    EKS Kubernetes minor version. Standard support lasts 14 months from the EKS
    release date, after which the cluster fee goes from $0.10 to $0.60 per hour.
    Verify current dates with: aws eks describe-cluster-versions
  EOT
  type        = string
}

variable "upgrade_policy" {
  description = <<-EOT
    STANDARD - refuse extended support. EKS auto-upgrades the control plane at
               end of standard support instead of raising the fee 6x. The cost
               guard, at the price of an unscheduled upgrade.
    EXTENDED - allow the cluster to roll into extended support at ~$438/month.
  EOT
  type        = string
  default     = "STANDARD"

  validation {
    condition     = contains(["STANDARD", "EXTENDED"], var.upgrade_policy)
    error_message = "upgrade_policy must be STANDARD or EXTENDED."
  }
}

variable "endpoint_public_access" {
  description = "Expose the Kubernetes API publicly, restricted to endpoint_public_access_cidrs."
  type        = bool
  default     = true
}

variable "endpoint_public_access_cidrs" {
  description = "CIDRs allowed to reach the public API endpoint. 0.0.0.0/0 relies on IAM and TLS alone."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "enabled_log_types" {
  description = "Control plane log types shipped to CloudWatch. Billed per GB ingested with no default expiry."
  type        = list(string)
  default     = []
}

variable "admin_principal_arns" {
  description = "Extra IAM principals granted cluster-admin via access entries. The Terraform caller is added automatically."
  type        = list(string)
  default     = []
}

########################################
# Worker nodes
########################################

variable "node_instance_types" {
  description = "Instance types for the managed node group. Must match node_ami_type architecture."
  type        = list(string)
  default     = ["t4g.medium"]
}

variable "node_ami_type" {
  description = "EKS AMI type. AL2023_ARM_64_STANDARD for Graviton (t4g, m7g, c7g)."
  type        = string
  default     = "AL2023_ARM_64_STANDARD"
}

variable "node_desired_size" {
  description = "Desired worker node count."
  type        = number
  default     = 4
}

variable "node_min_size" {
  description = "Minimum worker node count."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum worker node count."
  type        = number
  default     = 6
}

variable "node_disk_size" {
  description = "gp3 root volume size in GiB per node."
  type        = number
  default     = 20
}

variable "node_capacity_type" {
  description = "ON_DEMAND or SPOT. Spot is typically 60-70% cheaper with two-minute interruption notices."
  type        = string
  default     = "ON_DEMAND"

  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.node_capacity_type)
    error_message = "node_capacity_type must be ON_DEMAND or SPOT."
  }
}

variable "node_cpu_credits" {
  description = <<-EOT
    Burstable CPU credit mode for T-family nodes.

      "standard"  - throttle to baseline when credits run out. Predictable bill.
      "unlimited" - stay at full speed and pay ~$0.04 per surplus vCPU-hour.
                    This is the EC2 default and can silently add cost under
                    Spark and Trino load. t4g.medium baseline is ~0.4 vCPU.
  EOT
  type        = string
  default     = "standard"

  validation {
    condition     = contains(["standard", "unlimited"], var.node_cpu_credits)
    error_message = "node_cpu_credits must be \"standard\" or \"unlimited\"."
  }
}
