data "aws_partition" "current" {}

locals {
  partition = data.aws_partition.current.partition
}

# Trust policy shared by every role that pods assume through EKS Pod Identity.
#
# It is deliberately broad: no OIDC issuer, no subject condition. With Pod
# Identity the security boundary is the association, not the trust policy —
# a role is only reachable by the specific namespace/serviceaccount pair named
# in an aws_eks_pod_identity_association, and creating one requires EKS write
# permission in this account.
#
# sts:TagSession is required, not optional. EKS Auth attaches session tags
# (cluster name, namespace, service account) on every assumption, and the
# assumption fails without permission to set them.
data "aws_iam_policy_document" "pod_identity_assume" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }

    actions = ["sts:AssumeRole", "sts:TagSession"]
  }
}

########################################
# Cluster IAM role
########################################

resource "aws_iam_role" "cluster" {
  name = "${var.name}-eks-cluster"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cluster" {
  for_each = toset([
    "arn:${local.partition}:iam::aws:policy/AmazonEKSClusterPolicy",
    "arn:${local.partition}:iam::aws:policy/AmazonEKSVPCResourceController",
  ])

  role       = aws_iam_role.cluster.name
  policy_arn = each.value
}

########################################
# Control plane
########################################

resource "aws_eks_cluster" "this" {
  name     = var.name
  role_arn = aws_iam_role.cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = var.private_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = var.endpoint_public_access
    public_access_cidrs     = var.endpoint_public_access_cidrs
  }

  # API mode replaces the legacy aws-auth ConfigMap with IAM access entries.
  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  upgrade_policy {
    support_type = var.upgrade_policy
  }

  enabled_cluster_log_types = var.enabled_log_types

  # Addons are managed explicitly below so versions and IRSA roles are visible in
  # code rather than installed unmanaged at creation time.
  bootstrap_self_managed_addons = false

  tags = { Name = var.name }

  depends_on = [aws_iam_role_policy_attachment.cluster]
}

########################################
# Cluster admin access entries
########################################

resource "aws_eks_access_entry" "admins" {
  for_each = toset(var.admin_principal_arns)

  cluster_name  = aws_eks_cluster.this.name
  principal_arn = each.value
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "admins" {
  for_each = toset(var.admin_principal_arns)

  cluster_name  = aws_eks_cluster.this.name
  principal_arn = each.value
  policy_arn    = "arn:${local.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.admins]
}

########################################
# EBS CSI driver role
#
# Lives here rather than in the platform module because it is a prerequisite of
# the aws-ebs-csi-driver addon, which this module owns. The addon declares its
# own pod identity association, so no ServiceAccount annotation is needed.
########################################

resource "aws_iam_role" "ebs_csi" {
  name               = "${var.name}-ebs-csi"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_assume.json
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

########################################
# Addons
#
# Ordering matters. vpc-cni and kube-proxy must exist before a node can reach
# Ready; coredns and the EBS CSI controller cannot schedule until nodes exist.
# addon_version is unset so EKS selects the default for kubernetes_version.
########################################

resource "aws_eks_addon" "vpc_cni" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "vpc-cni"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "kube-proxy"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

# The agent that actually delivers credentials to pods. It runs as a DaemonSet on
# hostNetwork, serving them from a link-local address, so it needs nodes to exist
# and must be Ready before any pod expects credentials.
#
# Roughly 50 MiB per node: the one real cost of Pod Identity over IRSA, which
# needed no in-cluster component.
resource "aws_eks_addon" "pod_identity_agent" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "eks-pod-identity-agent"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.default]
}

resource "aws_eks_addon" "coredns" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "coredns"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.default]
}

resource "aws_eks_addon" "ebs_csi" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "aws-ebs-csi-driver"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  # Replaces service_account_role_arn, which was the IRSA form. EKS creates the
  # association itself, so the addon's ServiceAccount needs no annotation.
  pod_identity_association {
    role_arn        = aws_iam_role.ebs_csi.arn
    service_account = "ebs-csi-controller-sa"
  }

  depends_on = [
    aws_eks_addon.pod_identity_agent,
    aws_iam_role_policy_attachment.ebs_csi,
  ]
}
