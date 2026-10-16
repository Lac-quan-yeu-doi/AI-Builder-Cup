output "vpc_id" {
  description = "VPC identifier."
  value       = aws_vpc.this.id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block."
  value       = aws_vpc.this.cidr_block
}

output "availability_zones" {
  description = "AZs subnets were created in, in index order."
  value       = local.azs
}

output "public_subnet_ids" {
  description = "Public subnet IDs, for the ALB and the NAT instance."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs, for worker nodes, RDS, and control plane ENIs."
  value       = aws_subnet.private[*].id
}

output "egress_route_ids" {
  description = <<-EOT
    Everything that has to exist before a private-subnet instance has internet
    access: the default routes, and for nat_mode = "instance" the NAT instance
    itself. Consumers depend on this so nodes are never launched into a subnet
    with no working egress.

    The instance ID matters as much as the route. The route can exist and point
    at an ENI whose instance is still booting, or has been replaced because its
    user_data changed, in which case image pulls fail and the node group dies
    after ~25 minutes without a useful error.
  EOT
  value = concat(
    aws_route.private_via_nat_instance[*].id,
    aws_route.private_via_nat_gateway[*].id,
    aws_instance.nat[*].id,
  )
}

output "egress_description" {
  description = "Human-readable summary of the egress path in use."
  value       = var.nat_mode == "instance" ? "instance:${try(aws_instance.nat[0].id, "pending")}" : "gateway:${join(",", aws_nat_gateway.this[*].id)}"
}
