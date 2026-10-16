########################################
# Egress for private subnets
#
# Two implementations behind var.nat_mode, both terminating at the same private
# route tables:
#
#   instance - t4g.nano + Elastic IP + 8 GiB root. Roughly a quarter the cost of
#              a managed gateway, with no per-GB processing charge. Single point
#              of failure. ~$8/month in ap-southeast-1, ~$7 in us-east-1.
#   gateway  - Managed and redundant within its AZ, but charges hourly AND per GB
#              processed. ~$47/month each in ap-southeast-1, ~$33 in us-east-1.
#
# Internet egress at $0.09/GB applies to both.
########################################

########################################
# NAT instance
########################################

# Derive the AMI architecture from the instance type rather than hardcoding it,
# so switching nat_instance_type between Graviton and x86 families just works.
data "aws_ec2_instance_type" "nat" {
  count = var.nat_mode == "instance" ? 1 : 0

  instance_type = var.nat_instance_type
}

data "aws_ssm_parameter" "nat_ami" {
  count = var.nat_mode == "instance" ? 1 : 0

  name = format(
    "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-%s",
    contains(data.aws_ec2_instance_type.nat[0].supported_architectures, "arm64") ? "arm64" : "x86_64",
  )
}

resource "aws_security_group" "nat" {
  count = var.nat_mode == "instance" ? 1 : 0

  name        = "${var.name}-nat"
  description = "NAT instance: forward traffic originating inside the VPC"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${var.name}-nat" }
}

# Only VPC-internal sources are accepted. Nothing on the internet can initiate
# a connection to this instance; administrative access is via SSM, not SSH.
resource "aws_vpc_security_group_ingress_rule" "nat_from_vpc" {
  count = var.nat_mode == "instance" ? 1 : 0

  security_group_id = aws_security_group.nat[0].id
  description       = "All traffic from inside the VPC"
  cidr_ipv4         = aws_vpc.this.cidr_block
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "nat_all" {
  count = var.nat_mode == "instance" ? 1 : 0

  security_group_id = aws_security_group.nat[0].id
  description       = "Forwarded traffic to the internet"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# A dedicated ENI with source/destination checking disabled. Routing to the ENI
# rather than the instance ID keeps the route target stable across instance
# replacement.
resource "aws_network_interface" "nat" {
  count = var.nat_mode == "instance" ? 1 : 0

  subnet_id         = aws_subnet.public[0].id
  security_groups   = [aws_security_group.nat[0].id]
  source_dest_check = false

  tags = { Name = "${var.name}-nat" }
}

resource "aws_eip" "nat_instance" {
  count = var.nat_mode == "instance" ? 1 : 0

  domain            = "vpc"
  network_interface = aws_network_interface.nat[0].id

  tags = { Name = "${var.name}-nat" }

  depends_on = [aws_internet_gateway.this]
}

# SSM Session Manager access, so no bastion host and no SSH keys are needed.
# The agent dials outbound through this instance's own IGW route, which is why
# no SSM interface endpoints are required.
resource "aws_iam_role" "nat" {
  count = var.nat_mode == "instance" ? 1 : 0

  name = "${var.name}-nat"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "nat_ssm" {
  count = var.nat_mode == "instance" ? 1 : 0

  role       = aws_iam_role.nat[0].name
  policy_arn = "arn:${local.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nat" {
  count = var.nat_mode == "instance" ? 1 : 0

  name = "${var.name}-nat"
  role = aws_iam_role.nat[0].name
}

resource "aws_instance" "nat" {
  count = var.nat_mode == "instance" ? 1 : 0

  ami                  = data.aws_ssm_parameter.nat_ami[0].value
  instance_type        = var.nat_instance_type
  iam_instance_profile = aws_iam_instance_profile.nat[0].name

  network_interface {
    device_index         = 0
    network_interface_id = aws_network_interface.nat[0].id
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 8
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2
  }

  credit_specification {
    cpu_credits = "standard"
  }

  # Masquerade VPC-sourced traffic out of the primary interface.
  #
  # The minimal AL2023 AMI ships NO firewall tooling: neither `iptables` nor
  # `nft` is on the image. iptables-nft must be installed explicitly, and it must
  # succeed, or this instance boots looking healthy while forwarding nothing —
  # which presents as private-subnet nodes that never register with EKS.
  #
  # The install works because this instance sits in a public subnet with an
  # Elastic IP and reaches the repos directly through the Internet Gateway.
  user_data_replace_on_change = true
  user_data                   = <<-USERDATA
    #!/bin/bash
    set -euxo pipefail

    for attempt in 1 2 3 4 5; do
      dnf install -y iptables-nft && break
      echo "iptables-nft install attempt $attempt failed, retrying"
      sleep 10
    done

    # Fail loudly rather than boot into a silently broken NAT.
    if ! command -v iptables; then
      echo "FATAL: iptables unavailable after 5 attempts; NAT cannot function"
      exit 1
    fi

    cat > /etc/sysctl.d/99-celesnity-nat.conf <<'SYSCTL'
    net.ipv4.ip_forward = 1
    net.ipv4.conf.all.send_redirects = 0
    SYSCTL
    sysctl --system

    cat > /usr/local/sbin/celesnity-nat.sh <<'NATSH'
    #!/bin/bash
    set -euo pipefail
    PRIMARY_IF=$(ip -o -4 route show to default | awk '{print $5}' | head -n1)
    iptables -t nat -F POSTROUTING
    iptables -t nat -A POSTROUTING -s ${aws_vpc.this.cidr_block} -o "$PRIMARY_IF" -j MASQUERADE
    iptables -P FORWARD ACCEPT
    NATSH
    chmod 0755 /usr/local/sbin/celesnity-nat.sh

    cat > /etc/systemd/system/celesnity-nat.service <<'UNIT'
    [Unit]
    Description=Celesnity NAT masquerade rules
    After=network-online.target
    Wants=network-online.target

    [Service]
    Type=oneshot
    RemainAfterExit=yes
    # Self-heal on reboot if the package is somehow missing.
    ExecStartPre=/bin/sh -c 'command -v iptables || dnf install -y iptables-nft'
    ExecStart=/usr/local/sbin/celesnity-nat.sh
    Restart=on-failure
    RestartSec=15

    [Install]
    WantedBy=multi-user.target
    UNIT

    systemctl daemon-reload
    systemctl enable --now celesnity-nat.service
  USERDATA

  tags = { Name = "${var.name}-nat" }
}

########################################
# NAT Gateway
########################################

resource "aws_eip" "nat_gateway" {
  count = var.nat_mode == "gateway" ? (var.nat_gateway_per_az ? var.availability_zone_count : 1) : 0

  domain = "vpc"

  tags = { Name = "${var.name}-nat-${count.index}" }

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  count = var.nat_mode == "gateway" ? (var.nat_gateway_per_az ? var.availability_zone_count : 1) : 0

  allocation_id = aws_eip.nat_gateway[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = { Name = "${var.name}-nat-${count.index}" }

  depends_on = [aws_internet_gateway.this]
}

########################################
# Default routes for private subnets
########################################

resource "aws_route" "private_via_nat_instance" {
  count = var.nat_mode == "instance" ? var.availability_zone_count : 0

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_network_interface.nat[0].id
}

resource "aws_route" "private_via_nat_gateway" {
  count = var.nat_mode == "gateway" ? var.availability_zone_count : 0

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = var.nat_gateway_per_az ? aws_nat_gateway.this[count.index].id : aws_nat_gateway.this[0].id
}
