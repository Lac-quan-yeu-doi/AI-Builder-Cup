variable "name" {
  description = "Name prefix for every resource in this module."
  type        = string
}

variable "region" {
  description = "AWS region, needed to build the S3 gateway endpoint service name."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "availability_zone_count" {
  description = <<-EOT
    Number of AZs to create subnets in. EKS requires subnets in at least two AZs
    for its cross-account control plane ENIs, and an ALB requires two subnets in
    two AZs. Worker placement is decided by the caller, not here.
  EOT
  type        = number
  default     = 2

  validation {
    condition     = var.availability_zone_count >= 2
    error_message = "EKS and ALB both require subnets in at least two Availability Zones."
  }
}

variable "nat_mode" {
  description = <<-EOT
    How private subnets reach the internet.

      "instance" - one small EC2 NAT instance. Roughly a quarter the cost of a
                   managed gateway and no per-GB processing charge, but a single
                   point of failure.
      "gateway"  - AWS managed NAT Gateway. Charged hourly and per GB processed.

    Both terminate at the same private route tables, so switching does not alter
    subnets, security groups, or any consumer of this module's outputs.
  EOT
  type        = string
  default     = "instance"

  validation {
    condition     = contains(["instance", "gateway"], var.nat_mode)
    error_message = "nat_mode must be either \"instance\" or \"gateway\"."
  }
}

variable "nat_instance_type" {
  description = <<-EOT
    Instance type for the NAT instance. t4g.nano has roughly 32 Mbps of baseline
    throughput, which is adequate only because the free S3 gateway endpoint keeps
    Iceberg warehouse traffic off this path.
  EOT
  type        = string
  default     = "t4g.nano"
}

variable "nat_gateway_per_az" {
  description = "When nat_mode is \"gateway\", create one per AZ instead of a single shared gateway."
  type        = bool
  default     = false
}
