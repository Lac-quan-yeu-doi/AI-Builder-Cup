variable "project_id" {
  description = "GCP project to configure audit logging on."
  type        = string
}

variable "enable_data_access_logs" {
  description = <<-EOT
    Enable Cloud Audit Logs Data Access logging.

    Admin Activity logs (who changed configuration) are always on and free. Data
    Access logs (who read or wrote actual data) are OFF by default and are what
    GDPR Art. 30 records of processing and Art. 33 breach notification actually
    need — without them you cannot answer "whose data was accessed" inside the
    72-hour window.

    They are billed as log ingestion at $0.50/GiB beyond the 50 GiB monthly free
    allowance per project, and they are high volume: every GCS object read on the
    Iceberg warehouse produces an entry, and Iceberg reads a lot of small metadata
    files. Budget for this rather than being surprised by it.
  EOT
  type        = bool
  default     = true
}

variable "audited_services" {
  description = <<-EOT
    Services to collect Data Access logs for. Scoped to the three that actually
    hold personal data in this stack rather than "allServices", which would add
    Compute, GKE, and IAM read volume for no compliance benefit.

      storage         - GCS object reads and writes (the Iceberg warehouse)
      cloudsql        - Cloud SQL data access (the Iceberg catalog)
      secretmanager   - who read the database password
  EOT
  type        = list(string)
  default = [
    "storage.googleapis.com",
    "cloudsql.googleapis.com",
    "secretmanager.googleapis.com",
  ]
}

variable "exempted_members" {
  description = <<-EOT
    Principals excluded from Data Access logging. Normally empty.

    An exemption is a deliberate gap in your audit trail, so anything listed here
    should be justifiable to an auditor. The usual candidate is a high-volume
    service account whose access is already accounted for elsewhere.
  EOT
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = <<-EOT
    Retention for the project's _Default log bucket.

    GDPR Art. 5(1)(e) requires storage limitation, and audit logs describing data
    access are themselves personal data. The Cloud Logging default is 30 days;
    raising it improves incident forensics but extends how long you hold this data
    and increases storage cost beyond the included 30 days.

    Set to null to leave the Google default untouched.
  EOT
  type        = number
  default     = 90
}
