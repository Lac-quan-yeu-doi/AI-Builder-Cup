########################################
# Public FTPS data plane
#
# Explicit FTPS starts as FTP and upgrades with AUTH TLS, so it cannot reuse the
# MQTT SSL proxy. These TCP target proxies share only the MQTT reserved global
# IP address and use distinct TCP ports.
########################################

# The GKE NEG controller creates every zonal NEG asynchronously after the
# annotated Service exists. The names and zones below are deterministic, so this
# delay keeps the first apply valid without Terraform taking ownership of NEGs.
resource "terraform_data" "ftps_neg_ready" {
  triggers_replace = [kubernetes_service_v1.ftps_backend.metadata[0].uid]

  provisioner "local-exec" {
    command = "sleep 45"
  }
}

# The health check deliberately probes SFTPGo's private REST listener instead of
# a passive data port. Passive data ports exist only during a transfer, while the
# REST listener is a stable indication that the SFTPGo process is ready.
resource "google_compute_health_check" "sftpgo" {
  name                = "${var.name}-sftpgo"
  project             = var.project_id
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  tcp_health_check {
    port = 8080
  }
}

resource "google_compute_firewall" "ftps_health_and_proxy" {
  name          = "${var.name}-allow-ftps-proxy"
  project       = var.project_id
  network       = var.network
  direction     = "INGRESS"
  source_ranges = local.gfe_proxy_source_ranges

  allow {
    protocol = "tcp"
    ports = concat(
      ["8080"],
      [for port in values(local.ftps_port_map) : tostring(port)],
    )
  }
}

resource "google_compute_backend_service" "ftps" {
  for_each = local.ftps_port_map

  name                  = "${var.name}-sftpgo-ftps-${each.value}"
  project               = var.project_id
  protocol              = "TCP"
  load_balancing_scheme = "EXTERNAL"
  timeout_sec           = 86400
  health_checks         = [google_compute_health_check.sftpgo.id]

  dynamic "backend" {
    for_each = toset(var.cluster_zones)

    content {
      group = "https://www.googleapis.com/compute/v1/projects/${var.project_id}/zones/${backend.value}/networkEndpointGroups/${local.ftps_neg_names[each.key]}"

      balancing_mode               = "CONNECTION"
      max_connections_per_endpoint = 100000
    }
  }

  depends_on = [terraform_data.ftps_neg_ready]
}

# PROXY_V1 carries the original client address to SFTPGo on both the control and
# passive data connections. SFTPGo's strict proxy configuration then keeps its
# passive peer-IP validation intact behind Google Front Ends.
resource "google_compute_target_tcp_proxy" "ftps" {
  for_each = local.ftps_port_map

  name            = "${var.name}-sftpgo-ftps-${each.value}"
  project         = var.project_id
  backend_service = google_compute_backend_service.ftps[each.key].id
  proxy_header    = "PROXY_V1"
}

resource "google_compute_global_forwarding_rule" "ftps" {
  for_each = local.ftps_port_map

  name                  = "${var.name}-sftpgo-ftps-${each.value}"
  project               = var.project_id
  ip_address            = var.shared_global_ip_id
  ip_protocol           = "TCP"
  port_range            = tostring(each.value)
  load_balancing_scheme = "EXTERNAL"
  target                = google_compute_target_tcp_proxy.ftps[each.key].id
}
