########################################
# Object storage
#
# Replaces the MinIO service from compose.yaml. Reached through the free S3
# gateway endpoint, so warehouse traffic never crosses the NAT path.
#
# Encryption is SSE-S3 rather than SSE-KMS deliberately: SSE-KMS adds a KMS
# request charge on every object operation, and Iceberg generates a lot of small
# metadata and manifest reads.
########################################

data "aws_caller_identity" "current" {}

locals {
  warehouse_bucket = var.warehouse_bucket_name != "" ? var.warehouse_bucket_name : "${var.name}-warehouse-${data.aws_caller_identity.current.account_id}"
  artifacts_bucket = var.artifacts_bucket_name != "" ? var.artifacts_bucket_name : "${var.name}-artifacts-${data.aws_caller_identity.current.account_id}"

  buckets = {
    warehouse = {
      name       = local.warehouse_bucket
      versioning = false # Iceberg already provides snapshot-based time travel.
    }
    artifacts = {
      name       = local.artifacts_bucket
      versioning = true # Mirrors `mc version enable` in compose.yaml.
    }
  }
}

resource "aws_s3_bucket" "this" {
  for_each = local.buckets

  bucket        = each.value.name
  force_destroy = var.force_destroy

  tags = { Name = each.value.name }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = local.buckets

  bucket = aws_s3_bucket.this[each.key].id

  versioning_configuration {
    status = each.value.versioning ? "Enabled" : "Disabled"
  }
}

# Failed Spark writes leave multipart uploads behind. They are billed as storage
# and are invisible in the object listing until expired.
resource "aws_s3_bucket_lifecycle_configuration" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Placeholder prefixes matching the layout minio-init creates locally.
resource "aws_s3_object" "artifact_prefixes" {
  for_each = toset(["scripts/", "executions/"])

  bucket  = aws_s3_bucket.this["artifacts"].id
  key     = "${each.value}.keep"
  content = ""

  depends_on = [aws_s3_bucket_ownership_controls.this]
}
