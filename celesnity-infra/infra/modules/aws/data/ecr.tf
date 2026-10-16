########################################
# ECR repository for the custom Spark image
#
# celesnity/spark is built locally from spark/Dockerfile and has no public
# registry. It must be pushed to ECR before the Spark workload can start, and it
# must be built for arm64 because the nodes are Graviton.
#
# `terraform output spark_image_push_commands` prints the exact sequence.
########################################

resource "aws_ecr_repository" "spark" {
  name                 = "${var.name}/spark"
  image_tag_mutability = "MUTABLE"
  force_delete         = var.force_destroy

  image_scanning_configuration {
    scan_on_push = true
  }

  # AES256 rather than KMS: no per-request key charges.
  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = { Name = "${var.name}-spark" }
}

# Untagged layers accumulate on every rebuild and are billed at $0.10/GB-month.
resource "aws_ecr_lifecycle_policy" "spark" {
  repository = aws_ecr_repository.spark.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the 10 most recent tagged images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      },
    ]
  })
}
