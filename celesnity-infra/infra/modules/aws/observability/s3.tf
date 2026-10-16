########################################
# Loki object storage
#
# Loki keeps chunks and its TSDB index in S3 rather than on a PersistentVolume.
# S3 standard storage is roughly a quarter the per-GB cost of gp3 in any region,
# and this also avoids tying log history to a single-AZ EBS volume. Traffic
# reaches S3 through the free VPC gateway endpoint, so it never touches NAT.
########################################

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  partition   = data.aws_partition.current.partition
  loki_bucket = var.loki_bucket_name != "" ? var.loki_bucket_name : "${var.name}-loki-${data.aws_caller_identity.current.account_id}"

  # Empty means "use the in-cluster Loki service".
  loki_push_url = var.loki_write_endpoint != "" ? var.loki_write_endpoint : "http://loki.${var.namespace}.svc.cluster.local:3100/loki/api/v1/push"
}

resource "aws_s3_bucket" "loki" {
  count = var.install_loki ? 1 : 0

  bucket        = local.loki_bucket
  force_destroy = true # Logs are reproducible; never block a teardown on them.

  tags = { Name = local.loki_bucket }
}

resource "aws_s3_bucket_public_access_block" "loki" {
  count = var.install_loki ? 1 : 0

  bucket = aws_s3_bucket.loki[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "loki" {
  count = var.install_loki ? 1 : 0

  bucket = aws_s3_bucket.loki[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Loki's compactor enforces retention inside the index, but orphaned objects and
# aborted multipart uploads still accrue storage charges. This is the backstop.
resource "aws_s3_bucket_lifecycle_configuration" "loki" {
  count = var.install_loki ? 1 : 0

  bucket = aws_s3_bucket.loki[0].id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }

  rule {
    id     = "expire-orphaned-chunks"
    status = "Enabled"

    filter {}

    # Deliberately longer than loki_retention_hours so the compactor stays the
    # authority on retention and this only catches what it misses.
    expiration {
      days = ceil(var.loki_retention_hours / 24) + 7
    }
  }
}
