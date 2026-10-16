########################################
# Node IAM role
########################################

resource "aws_iam_role" "node" {
  name = "${var.name}-eks-node"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "node" {
  for_each = toset([
    "arn:${local.partition}:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:${local.partition}:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:${local.partition}:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    # Session Manager shell access without a bastion or SSH keys.
    "arn:${local.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ])

  role       = aws_iam_role.node.name
  policy_arn = each.value
}

########################################
# Launch template
#
# Required for exactly one reason: credit_specification is not exposed on
# aws_eks_node_group. Without it the node group inherits the EC2 default of
# "unlimited" for T-family instances, billing surplus CPU credits at roughly
# $0.04 per vCPU-hour once the 20% baseline is exhausted. Spark and Trino will
# exhaust it.
#
# image_id and user_data are deliberately omitted so EKS injects the AMI matching
# var.node_ami_type together with the correct nodeadm bootstrap configuration.
########################################

resource "aws_launch_template" "node" {
  name_prefix            = "${var.name}-node-"
  update_default_version = true

  vpc_security_group_ids = [aws_eks_cluster.this.vpc_config[0].cluster_security_group_id]

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      volume_size           = var.node_disk_size
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  credit_specification {
    cpu_credits = var.node_cpu_credits
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
    # Hop limit 2 lets host-network pods reach IMDS; IRSA remains the intended
    # credential path for workloads.
    http_put_response_hop_limit = 2
  }

  monitoring {
    enabled = false # Detailed CloudWatch monitoring is billed per instance.
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.name}-node" }
  }

  tag_specifications {
    resource_type = "volume"
    tags          = { Name = "${var.name}-node" }
  }

  lifecycle {
    create_before_destroy = true
  }
}

########################################
# Managed node group
########################################

resource "aws_eks_node_group" "default" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.name}-default"
  node_role_arn   = aws_iam_role.node.arn

  # Placement is the caller's decision. A single subnet keeps all pod-to-pod and
  # pod-to-database traffic inside one AZ; EBS volumes are AZ-bound too, so this
  # also removes PersistentVolume scheduling friction.
  subnet_ids = var.node_subnet_ids

  ami_type       = var.node_ami_type
  capacity_type  = var.node_capacity_type
  instance_types = var.node_instance_types

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  update_config {
    max_unavailable = 1
  }

  launch_template {
    id      = aws_launch_template.node.id
    version = aws_launch_template.node.latest_version
  }

  labels = {
    "celesnity.io/pool" = "default"
  }

  depends_on = [
    aws_iam_role_policy_attachment.node,
    aws_eks_addon.vpc_cni,
    aws_eks_addon.kube_proxy,
    # Egress must work before nodes launch. Nodes in private subnets that cannot
    # reach ECR and the EKS endpoint never register, and the node group fails
    # after ~25 minutes with no useful error.
    terraform_data.egress_ready,
  ]

  # desired_size is handed to the cluster autoscaler or adjusted by hand after
  # creation; Terraform should not fight it.
  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }

  tags = { Name = "${var.name}-default" }
}

# Sequencing handle for egress. Expressed as terraform_data so the dependency
# still resolves when var.egress_dependencies is empty, and referenced from the
# node group's depends_on above — without that reference this resource would be
# inert and the ordering guarantee would not exist.
resource "terraform_data" "egress_ready" {
  input = var.egress_dependencies
}
