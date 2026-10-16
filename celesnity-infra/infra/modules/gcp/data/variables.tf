variable "name" {
  description = "Name prefix for every resource in this module."
  type        = string
}

variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
}

variable "network_id" {
  description = "VPC network ID, for the private services access range."
  type        = string
}

variable "network_self_link" {
  description = "VPC self link, required by Cloud SQL's private_network."
  type        = string
}

########################################
# Cloud SQL for PostgreSQL
########################################

variable "db_edition" {
  description = <<-EOT
    ENTERPRISE or ENTERPRISE_PLUS.

    This must be set explicitly. PostgreSQL 16 and later default to
    ENTERPRISE_PLUS, which accepts only db-perf-optimized-N-* machines, so
    leaving it unset while asking for a shared-core tier fails at create time
    with "Invalid Tier (db-g1-small) for (ENTERPRISE_PLUS) Edition".

    ENTERPRISE_PLUS starts at db-perf-optimized-N-2 (2 vCPU / 16 GiB) and costs
    several times a shared-core instance. It buys sub-second planned failover,
    a 99.99% SLA, and data cache. The Iceberg JDBC catalog stores table
    pointers, not query load, so ENTERPRISE is the right tier here.
  EOT
  type        = string
  default     = "ENTERPRISE"

  validation {
    condition     = contains(["ENTERPRISE", "ENTERPRISE_PLUS"], var.db_edition)
    error_message = "db_edition must be ENTERPRISE or ENTERPRISE_PLUS."
  }
}

variable "db_tier" {
  description = <<-EOT
    Cloud SQL machine tier. db-g1-small is 1 vCPU / 1.7 GiB shared-core, the
    closest equivalent to db.t3.small on RDS. db-custom-1-3840 is a dedicated
    1 vCPU / 3.75 GiB if the shared core proves too slow for catalog queries.

    Must be compatible with db_edition; see the validation below.
  EOT
  type        = string
  default     = "db-g1-small"

  # Catch the edition/tier mismatch during plan. Without this the failure surfaces
  # only after the VPC peering and the instance create have both been attempted,
  # which is several minutes into an apply.
  validation {
    condition = (
      var.db_edition != "ENTERPRISE_PLUS" || startswith(var.db_tier, "db-perf-optimized-")
    )
    error_message = "ENTERPRISE_PLUS requires a db-perf-optimized-N-* tier. Use db_edition = \"ENTERPRISE\" for shared-core or db-custom tiers."
  }

  validation {
    condition = (
      var.db_edition != "ENTERPRISE" || !startswith(var.db_tier, "db-perf-optimized-")
    )
    error_message = "db-perf-optimized-N-* tiers require db_edition = \"ENTERPRISE_PLUS\"."
  }
}

variable "db_disk_size_gb" {
  description = "Cloud SQL storage in GB."
  type        = number
  default     = 20
}

variable "db_disk_type" {
  description = "PD_SSD or PD_HDD. PD_HDD is cheaper but the Iceberg catalog is latency-sensitive."
  type        = string
  default     = "PD_SSD"
}

variable "db_version" {
  description = "Cloud SQL PostgreSQL version. Matches the postgres:17 image used locally."
  type        = string
  default     = "POSTGRES_17"
}

variable "db_name" {
  description = "Database to create inside the instance."
  type        = string
  default     = "celesnity"
}

variable "db_username" {
  description = "Application user."
  type        = string
  default     = "celesnity"
}

variable "db_availability_type" {
  description = <<-EOT
    ZONAL or REGIONAL. REGIONAL adds a standby in another zone and roughly doubles
    the instance cost, the equivalent of Multi-AZ on RDS.
  EOT
  type        = string
  default     = "ZONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.db_availability_type)
    error_message = "db_availability_type must be ZONAL or REGIONAL."
  }
}

variable "db_backup_enabled" {
  description = "Automated backups."
  type        = bool
  default     = true
}

variable "db_point_in_time_recovery_enabled" {
  description = "Enable PostgreSQL WAL archiving so the database can be restored to a specific point inside the backup recovery window."
  type        = bool
  default     = false
}

variable "db_retained_backups" {
  description = <<-EOT
    Number of automated backups to keep.

    Bounds how long personal data survives in backups after deletion, which
    matters for GDPR Art. 5(1)(e) and sets the floor on your Art. 17 erasure SLA:
    an erasure is not complete until the last backup containing the row expires.

    Daily backups, so 7 means roughly a week of recovery window.
  EOT
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "Block `terraform destroy` from removing the instance."
  type        = bool
  default     = false
}

variable "private_services_cidr_prefix" {
  description = <<-EOT
    Prefix length for the range Google reserves for managed services reached over
    VPC peering. Cloud SQL requires at least /24; /20 leaves room for other
    managed services later without a second allocation.
  EOT
  type        = number
  default     = 20
}

########################################
# Object storage and registry
########################################

variable "warehouse_bucket_name" {
  description = "Iceberg warehouse bucket. Empty generates one from name and project ID."
  type        = string
  default     = ""
}

variable "artifacts_bucket_name" {
  description = "Artifacts bucket for job scripts and execution output. Empty generates one."
  type        = string
  default     = ""
}

variable "bucket_location" {
  description = <<-EOT
    GCS location. A single region matching the cluster keeps reads local and free;
    multi-region (for example ASIA) costs more per GB and adds egress when read
    from a specific region.
  EOT
  type        = string
  default     = null
}

variable "force_destroy" {
  description = "Allow `terraform destroy` to delete non-empty buckets. Never enable outside dev."
  type        = bool
  default     = false
}

variable "noncurrent_version_retention_days" {
  description = <<-EOT
    How long to keep noncurrent (overwritten or deleted) object versions in the
    versioned artifacts bucket.

    Without a bound, a deleted object survives indefinitely as a hidden version,
    which silently defeats GDPR Art. 17 erasure: the delete succeeds, the data
    remains retrievable. This sets the outer limit on how long that takes to become
    real, so it belongs in your documented deletion SLA alongside
    db_retained_backups.
  EOT
  type        = number
  default     = 30
}
