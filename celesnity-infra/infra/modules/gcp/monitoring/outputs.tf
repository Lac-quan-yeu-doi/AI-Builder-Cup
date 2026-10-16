output "uptime_check_id" {
  value       = google_monitoring_uptime_check_config.web.uptime_check_id
  description = "Identifier used to correlate uptime metrics and alerts."
}

output "notification_channel_count" {
  value       = length(google_monitoring_notification_channel.email)
  description = "Must be greater than zero before monitoring evidence can be signed off."
}
