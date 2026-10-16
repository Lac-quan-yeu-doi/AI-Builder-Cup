########################################
# Loki IAM via EKS Pod Identity
#
# Same pattern as the Trino and Spark workload role: an IAM role trusting
# pods.eks.amazonaws.com, plus an association binding it to one
# namespace/serviceaccount pair. No access keys, and no ServiceAccount
# annotation — the Loki chart's values leave the S3 credentials unset so the AWS
# SDK picks up the container credentials the Pod Identity Agent serves.
########################################

resource "aws_iam_role" "loki" {
  count = var.install_loki ? 1 : 0

  name               = "${var.name}-loki"
  assume_role_policy = var.pod_identity_assume_role_policy
}

data "aws_iam_policy_document" "loki_s3" {
  count = var.install_loki ? 1 : 0

  statement {
    sid    = "ListLokiBucket"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:ListBucketMultipartUploads",
    ]

    resources = [aws_s3_bucket.loki[0].arn]
  }

  # DeleteObject is required: the compactor is what enforces retention.
  statement {
    sid    = "ReadWriteLokiObjects"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts",
    ]

    resources = ["${aws_s3_bucket.loki[0].arn}/*"]
  }
}

resource "aws_iam_policy" "loki_s3" {
  count = var.install_loki ? 1 : 0

  name        = "${var.name}-loki-s3"
  description = "Loki chunk and index storage"
  policy      = data.aws_iam_policy_document.loki_s3[0].json
}

resource "aws_iam_role_policy_attachment" "loki_s3" {
  count = var.install_loki ? 1 : 0

  role       = aws_iam_role.loki[0].name
  policy_arn = aws_iam_policy.loki_s3[0].arn
}

# The Loki chart creates the "loki" ServiceAccount; this association is what
# lets it reach S3. Created before the Helm release so the first pod start
# already has credentials available.
resource "aws_eks_pod_identity_association" "loki" {
  count = var.install_loki ? 1 : 0

  cluster_name    = var.cluster_name
  namespace       = kubernetes_namespace_v1.monitoring.metadata[0].name
  service_account = "loki"
  role_arn        = aws_iam_role.loki[0].arn
}
