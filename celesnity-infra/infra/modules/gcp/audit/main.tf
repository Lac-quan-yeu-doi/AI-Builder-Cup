########################################
# Cloud Audit Logs: Data Access
#
# GDPR Art. 30 (records of processing) and Art. 33 (breach notification) both
# depend on being able to reconstruct who accessed which personal data and when.
# Admin Activity logs alone cannot answer that — they record configuration
# changes, not data reads.
#
# WARNING on the resource type: google_project_iam_audit_config is AUTHORITATIVE
# per service. Terraform will overwrite any existing audit config for the services
# listed in var.audited_services, including one set by an organisation policy or
# another tool. If this project is governed centrally, confirm before applying.
########################################

resource "google_project_iam_audit_config" "data_access" {
  for_each = var.enable_data_access_logs ? toset(var.audited_services) : []

  project = var.project_id
  service = each.value

  # DATA_READ and DATA_WRITE are the two that matter for personal data.
  # ADMIN_READ is included because reading configuration can itself reveal
  # information about data structure, and its volume is negligible.
  audit_log_config {
    log_type         = "DATA_READ"
    exempted_members = var.exempted_members
  }

  audit_log_config {
    log_type         = "DATA_WRITE"
    exempted_members = var.exempted_members
  }

  audit_log_config {
    log_type         = "ADMIN_READ"
    exempted_members = var.exempted_members
  }
}

########################################
# Log retention
#
# Audit logs describing who touched personal data are themselves personal data, so
# they fall under storage limitation too. This bounds them explicitly rather than
# relying on the Cloud Logging default.
########################################

resource "google_logging_project_bucket_config" "default" {
  count = var.log_retention_days != null ? 1 : 0

  project        = "projects/${var.project_id}"
  location       = "global"
  bucket_id      = "_Default"
  retention_days = var.log_retention_days

  description = "Celesnity: bounded retention for GDPR Art. 5(1)(e) storage limitation"
}
