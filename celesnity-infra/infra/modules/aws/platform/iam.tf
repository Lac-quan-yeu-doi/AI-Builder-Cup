########################################
# Workload IAM via EKS Pod Identity
#
# Pods receive short-lived credentials from the EKS Pod Identity Agent. Nothing
# is stored, which is why the MinIO root credentials used locally have no
# equivalent here.
#
# Two pieces per workload:
#   1. An IAM role whose trust policy names pods.eks.amazonaws.com. Identical for
#      every role, supplied by the cluster module.
#   2. An aws_eks_pod_identity_association binding that role to exactly one
#      namespace/serviceaccount pair. This is the security boundary — without an
#      association, the role is unreachable from the cluster.
#
# No ServiceAccount annotations, and no OIDC provider.
########################################

data "aws_partition" "current" {}

locals {
  partition = data.aws_partition.current.partition

  alb_service_account = "aws-load-balancer-controller"
}

########################################
# AWS Load Balancer Controller
#
# Policy is the upstream document for the pinned controller version, vendored at
# policies/alb-controller.json. Refresh it when bumping the chart:
#   curl -sL https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v<VER>/docs/install/iam_policy.json \
#     -o infra/modules/platform/policies/alb-controller.json
########################################

resource "aws_iam_role" "alb_controller" {
  count = var.install_alb_controller ? 1 : 0

  name               = "${var.name}-alb-controller"
  assume_role_policy = var.pod_identity_assume_role_policy
}

resource "aws_iam_policy" "alb_controller" {
  count = var.install_alb_controller ? 1 : 0

  name        = "${var.name}-alb-controller"
  description = "AWS Load Balancer Controller ${var.alb_controller_chart_version}"
  policy      = file("${path.module}/policies/alb-controller.json")
}

resource "aws_iam_role_policy_attachment" "alb_controller" {
  count = var.install_alb_controller ? 1 : 0

  role       = aws_iam_role.alb_controller[0].name
  policy_arn = aws_iam_policy.alb_controller[0].arn
}

# The association may be created before the ServiceAccount exists; EKS resolves
# it lazily when a pod using that account starts.
resource "aws_eks_pod_identity_association" "alb_controller" {
  count = var.install_alb_controller ? 1 : 0

  cluster_name    = var.cluster_name
  namespace       = "kube-system"
  service_account = local.alb_service_account
  role_arn        = aws_iam_role.alb_controller[0].arn
}

########################################
# Trino and Spark access to S3
########################################

resource "aws_iam_role" "workload" {
  name               = "${var.name}-workload"
  assume_role_policy = var.pod_identity_assume_role_policy
}

data "aws_iam_policy_document" "workload_s3" {
  # Bucket-level: Iceberg and Spark both list prefixes when planning scans.
  statement {
    sid    = "ListWarehouseBuckets"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:ListBucketMultipartUploads",
    ]

    resources = [
      var.warehouse_bucket_arn,
      var.artifacts_bucket_arn,
    ]
  }

  # Object-level. Multipart permissions matter: Spark writes Parquet files large
  # enough to be uploaded in parts.
  statement {
    sid    = "ReadWriteWarehouseObjects"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
    ]

    resources = [
      "${var.warehouse_bucket_arn}/*",
      "${var.artifacts_bucket_arn}/*",
    ]
  }
}

resource "aws_iam_policy" "workload_s3" {
  name        = "${var.name}-workload-s3"
  description = "Iceberg warehouse and artifact access for Trino and Spark"
  policy      = data.aws_iam_policy_document.workload_s3.json
}

resource "aws_iam_role_policy_attachment" "workload_s3" {
  role       = aws_iam_role.workload.name
  policy_arn = aws_iam_policy.workload_s3.arn
}

resource "aws_eks_pod_identity_association" "workload" {
  cluster_name    = var.cluster_name
  namespace       = kubernetes_namespace_v1.workload.metadata[0].name
  service_account = var.service_account_name
  role_arn        = aws_iam_role.workload.arn
}

# Plain ServiceAccount. Under IRSA this carried an eks.amazonaws.com/role-arn
# annotation; Pod Identity resolves the role from the association instead, so
# there is nothing cluster-side tying it to AWS.
resource "kubernetes_service_account_v1" "workload" {
  metadata {
    name      = var.service_account_name
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }
}
