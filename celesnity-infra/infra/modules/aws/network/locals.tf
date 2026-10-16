data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "aws_partition" "current" {}

locals {
  partition = data.aws_partition.current.partition

  azs = slice(data.aws_availability_zones.available.names, 0, var.availability_zone_count)

  # /20 per subnet out of a /16: 4094 usable addresses each. The VPC CNI hands
  # pod IPs out of the private subnets, so they are sized for pods, not nodes.
  public_subnet_cidrs  = [for i in range(var.availability_zone_count) : cidrsubnet(var.vpc_cidr, 4, i)]
  private_subnet_cidrs = [for i in range(var.availability_zone_count) : cidrsubnet(var.vpc_cidr, 4, i + 8)]
}
