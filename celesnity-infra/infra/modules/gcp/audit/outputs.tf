output "data_access_logging_enabled" {
  description = "Whether Data Access audit logging is configured."
  value       = var.enable_data_access_logs
}

output "audited_services" {
  description = "Services collecting Data Access logs."
  value       = var.enable_data_access_logs ? var.audited_services : []
}

output "log_retention_days" {
  description = "Retention applied to the project's _Default log bucket."
  value       = var.log_retention_days
}

output "audit_query_examples" {
  description = "Logging queries for answering common GDPR access questions."
  value = {
    who_read_warehouse = "logName=~\"cloudaudit.googleapis.com%2Fdata_access\" AND protoPayload.serviceName=\"storage.googleapis.com\" AND protoPayload.methodName=~\"storage.objects.(get|list)\""
    who_read_catalog   = "logName=~\"cloudaudit.googleapis.com%2Fdata_access\" AND protoPayload.serviceName=\"cloudsql.googleapis.com\""
    who_read_db_secret = "logName=~\"cloudaudit.googleapis.com%2Fdata_access\" AND protoPayload.serviceName=\"secretmanager.googleapis.com\" AND protoPayload.methodName=~\"AccessSecretVersion\""
  }
}
