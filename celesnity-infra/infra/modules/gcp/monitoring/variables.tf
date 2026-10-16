variable "project_id" {
  description = "GCP project containing the monitored service."
  type        = string
}

variable "environment" {
  description = "Environment label used in check and policy names."
  type        = string
}

variable "application_hostname" {
  description = "Public HTTPS hostname of the Celesnity Web edge."
  type        = string
}

variable "cloud_sql_instance_id" {
  description = "Cloud SQL database_id label, in PROJECT:INSTANCE form."
  type        = string
}

variable "notification_email_addresses" {
  description = "Verified on-call email addresses. Empty creates alert policies without paging destinations."
  type        = set(string)
  default     = []
}
