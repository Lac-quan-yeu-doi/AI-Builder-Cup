resource "google_service_account" "grafana" {
  count = var.install_grafana ? 1 : 0

  account_id   = "${var.name}-grafana"
  display_name = "Grafana metrics reader for ${var.name}"
}

resource "google_project_iam_member" "grafana_monitoring_viewer" {
  count = var.install_grafana ? 1 : 0

  project = var.project_id
  role    = "roles/monitoring.viewer"
  member  = "serviceAccount:${google_service_account.grafana[0].email}"
}

resource "google_service_account_iam_member" "grafana" {
  count = var.install_grafana ? 1 : 0

  service_account_id = google_service_account.grafana[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.workload_identity_pool}[${var.namespace}/grafana]"
}
