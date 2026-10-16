variable "name" {
  description = "Name prefix for every resource in this module."
  type        = string
}

variable "vpc_id" {
  description = "VPC to place the database security group in."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets for the DB subnet group. RDS requires at least two AZs even for Single-AZ."
  type        = list(string)
}

variable "cluster_security_group_id" {
  description = "EKS cluster security group, the only permitted source of PostgreSQL traffic."
  type        = string
}

variable "database_availability_zone" {
  description = <<-EOT
    AZ to place the database in, normally the same AZ as the worker nodes so
    catalog traffic never crosses a zone. Ignored when multi_az is true.
  EOT
  type        = string
  default     = null
}

########################################
# PostgreSQL
########################################

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.small is Graviton and ~10% cheaper than db.t3.small for the same 2 vCPU / 2 GiB."
  type        = string
  default     = "db.t3.small"
}

variable "db_allocated_storage" {
  description = "RDS gp3 storage in GiB. Billed per GB-month and varies by region: $0.138 in ap-southeast-1, $0.115 in us-east-1."
  type        = number
  default     = 50
}

variable "db_engine_version" {
  description = "PostgreSQL major version. Matches the postgres:17 image used locally."
  type        = string
  default     = "17"
}

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "celesnity"
}

variable "db_username" {
  description = "Master username."
  type        = string
  default     = "celesnity"
}

variable "db_multi_az" {
  description = "Multi-AZ standby. Roughly doubles instance cost and forces cross-AZ traffic."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Automated backup retention in days. Backup storage up to the DB size is free; 0 disables backups."
  type        = number
  default     = 1
}

variable "db_deletion_protection" {
  description = "Block accidental destroy of the database."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "Skip the final snapshot on destroy. Leave true only while the data is disposable."
  type        = bool
  default     = true
}

########################################
# Object storage and registry
########################################

variable "warehouse_bucket_name" {
  description = "Iceberg warehouse bucket name. Empty generates one from name and account ID."
  type        = string
  default     = ""
}

variable "artifacts_bucket_name" {
  description = "Artifacts bucket name for job scripts and execution output. Empty generates one."
  type        = string
  default     = ""
}

variable "force_destroy" {
  description = "Allow `terraform destroy` to delete non-empty buckets and the ECR repository. Never enable outside a PoC."
  type        = bool
  default     = false
}
