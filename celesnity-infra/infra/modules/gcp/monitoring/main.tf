resource "google_project_service" "monitoring" {
  project            = var.project_id
  service            = "monitoring.googleapis.com"
  disable_on_destroy = false
}

resource "google_monitoring_notification_channel" "email" {
  for_each     = var.notification_email_addresses
  project      = var.project_id
  display_name = "Celesnity ${var.environment} on-call - ${each.value}"
  type         = "email"
  labels = {
    email_address = each.value
  }
  force_delete = false

  depends_on = [google_project_service.monitoring]
}

resource "google_monitoring_uptime_check_config" "web" {
  project      = var.project_id
  display_name = "Celesnity ${var.environment} web HTTPS"
  timeout      = "10s"
  period       = "60s"

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.application_hostname
    }
  }

  http_check {
    request_method = "GET"
    path           = "/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
  }

  depends_on = [google_project_service.monitoring]
}

resource "google_monitoring_alert_policy" "web_unavailable" {
  project      = var.project_id
  display_name = "Celesnity ${var.environment}: public web unavailable"
  combiner     = "OR"
  severity     = "CRITICAL"
  notification_channels = [
    for channel in google_monitoring_notification_channel.email : channel.name
  ]

  conditions {
    display_name = "At least two uptime locations are failing"
    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"uptime_url\"",
        "metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\"",
        "metric.label.check_id = \"${google_monitoring_uptime_check_config.web.uptime_check_id}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "120s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }
      trigger { count = 1 }
    }
  }

  documentation {
    mime_type = "text/markdown"
    content   = "Public health checks failed. Validate DNS/TLS, Gateway/HTTPRoute, Web rollout, and Core readiness before rollback."
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "cloud_sql_unavailable" {
  project      = var.project_id
  display_name = "Celesnity ${var.environment}: Cloud SQL unavailable"
  combiner     = "OR"
  severity     = "CRITICAL"
  notification_channels = [
    for channel in google_monitoring_notification_channel.email : channel.name
  ]

  conditions {
    display_name = "Cloud SQL reports unavailable"
    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloudsql_database\"",
        "resource.label.database_id = \"${var.cloud_sql_instance_id}\"",
        "metric.type = \"cloudsql.googleapis.com/database/up\"",
      ])
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "120s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }
      trigger { count = 1 }
    }
  }

  documentation {
    mime_type = "text/markdown"
    content   = "Cloud SQL is unavailable. Check instance operations/failover and application saturation before invoking the recovery runbook."
  }

  alert_strategy {
    auto_close = "1800s"
  }
}
