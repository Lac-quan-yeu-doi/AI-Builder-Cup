########################################
# VPC
########################################

# enable_dns_hostnames is required by EKS: the kubelet registers nodes by their
# private DNS name, and the VPC CNI relies on DNS resolution inside the VPC.
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = var.name }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = var.name }
}

########################################
# Subnets
########################################

# Public subnets exist for the ALB and the NAT instance only. EKS requires two
# AZs and an ALB requires two subnets in two AZs, which is why this is never a
# single-AZ VPC even when the node group is pinned to one AZ.
#
# map_public_ip_on_launch is deliberately false. The NAT instance receives an
# explicit Elastic IP; nothing else here should get a public address implicitly.
resource "aws_subnet" "public" {
  count = var.availability_zone_count

  vpc_id                  = aws_vpc.this.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false

  tags = {
    Name                                = "${var.name}-public-${local.azs[count.index]}"
    "kubernetes.io/role/elb"            = "1"
    "kubernetes.io/cluster/${var.name}" = "shared"
  }
}

# Private subnets hold the worker nodes, the RDS instance, and the EKS control
# plane ENIs.
resource "aws_subnet" "private" {
  count = var.availability_zone_count

  vpc_id            = aws_vpc.this.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = {
    Name                                = "${var.name}-private-${local.azs[count.index]}"
    "kubernetes.io/role/internal-elb"   = "1"
    "kubernetes.io/cluster/${var.name}" = "shared"
  }
}

########################################
# Routing
########################################

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${var.name}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count = var.availability_zone_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# One private route table per AZ. With nat_mode = "instance" every table points
# at the same ENI; with nat_mode = "gateway" and nat_gateway_per_az = true each
# points at the gateway in its own AZ. Keeping them separate now means the
# production topology is a variable change rather than a refactor.
resource "aws_route_table" "private" {
  count = var.availability_zone_count

  vpc_id = aws_vpc.this.id

  tags = { Name = "${var.name}-private-${local.azs[count.index]}" }
}

resource "aws_route_table_association" "private" {
  count = var.availability_zone_count

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

########################################
# S3 gateway endpoint
########################################

# Free, and not optional for this workload.
#
# Trino scans, Spark writes, and Iceberg manifest/metadata reads all target S3.
# Without a gateway endpoint that traffic routes through the NAT path: a ~32 Mbps
# t4g.nano baseline, or $0.045/GB through a NAT Gateway. With the endpoint it
# goes direct via the route table at no charge.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"

  route_table_ids = concat(
    aws_route_table.private[*].id,
    [aws_route_table.public.id],
  )

  tags = { Name = "${var.name}-s3" }
}
