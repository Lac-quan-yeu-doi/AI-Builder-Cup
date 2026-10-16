output "db_address" {
  description = "RDS hostname, without the port."
  value       = aws_db_instance.this.address
}

output "db_port" {
  description = "RDS port."
  value       = aws_db_instance.this.port
}

output "db_endpoint" {
  description = "RDS endpoint as host:port."
  value       = aws_db_instance.this.endpoint
}

output "db_name" {
  description = "Initial database name."
  value       = aws_db_instance.this.db_name
}

output "db_username" {
  description = "Master username."
  value       = aws_db_instance.this.username
}

output "db_secret_arn" {
  description = "Secrets Manager ARN holding the master credentials, created and rotated by RDS."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "warehouse_bucket" {
  description = "Iceberg warehouse bucket name."
  value       = aws_s3_bucket.this["warehouse"].id
}

output "warehouse_bucket_arn" {
  description = "Iceberg warehouse bucket ARN."
  value       = aws_s3_bucket.this["warehouse"].arn
}

output "artifacts_bucket" {
  description = "Artifacts bucket name."
  value       = aws_s3_bucket.this["artifacts"].id
}

output "artifacts_bucket_arn" {
  description = "Artifacts bucket ARN."
  value       = aws_s3_bucket.this["artifacts"].arn
}

output "spark_repository_url" {
  description = "ECR repository URL for the custom Spark image."
  value       = aws_ecr_repository.spark.repository_url
}
