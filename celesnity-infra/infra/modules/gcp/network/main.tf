########################################
# VPC
#
# auto_create_subnetworks = false gives a custom-mode network: no subnets are
# created implicitly in every region, only the one declared below.
########################################

resource "google_compute_network" "this" {
  name                    = var.name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
  description             = "Celesnity ${var.name}"
}

########################################
# Subnet
#
# One subnet with two secondary ranges. GKE in VPC-native mode allocates Pod and
# Service addresses from the secondary ranges rather than from the node range,
# which is why they are declared here and referenced by name from the cluster.
#
# private_ip_google_access is the important line. It is the GCP equivalent of the
# S3 gateway endpoint in the AWS build: nodes with no external IP reach Google
# APIs — Artifact Registry, GCS, Cloud SQL — over Google's internal network
# instead of through Cloud NAT. It is free, and without it every Iceberg read and
# every image pull from Artifact Registry would be billed as NAT data processing.
########################################

resource "google_compute_subnetwork" "this" {
  name          = "${var.name}-nodes"
  region        = var.region
  network       = google_compute_network.this.id
  ip_cidr_range = var.subnet_cidr

  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "${var.name}-pods"
    ip_cidr_range = var.pods_cidr
  }

  secondary_ip_range {
    range_name    = "${var.name}-services"
    ip_cidr_range = var.services_cidr
  }
}

########################################
# Cloud NAT
#
# Managed, unlike the hand-rolled NAT instance in the AWS build. There is no
# user_data to get wrong, no package to install, and no single instance to fail.
# The tradeoff is cost: Cloud NAT is billed hourly plus per GB processed, with no
# cheap small-instance equivalent.
#
# Private Google Access keeps warehouse and registry traffic off this path, so
# what actually crosses it is Docker Hub image pulls and OS package updates.
########################################

resource "google_compute_router" "this" {
  count = var.enable_cloud_nat ? 1 : 0

  name    = "${var.name}-router"
  region  = var.region
  network = google_compute_network.this.id
}

resource "google_compute_router_nat" "this" {
  count = var.enable_cloud_nat ? 1 : 0

  name   = "${var.name}-nat"
  router = google_compute_router.this[0].name
  region = var.region

  # Google allocates and rotates the external addresses, so there is no static IP
  # to pay for while idle. Trade-off: egress source addresses are not stable, so
  # this is unsuitable if a third party needs to allow-list them.
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = var.nat_log_config != "NONE"
    filter = var.nat_log_config == "NONE" ? "ERRORS_ONLY" : var.nat_log_config
  }
}

########################################
# Firewall
#
# GKE creates the rules it needs for the control plane to reach nodes. This adds
# only intra-VPC traffic, which pod-to-pod and pod-to-Cloud SQL rely on.
########################################

resource "google_compute_firewall" "internal" {
  name        = "${var.name}-allow-internal"
  network     = google_compute_network.this.name
  description = "Allow traffic between workloads inside the VPC"
  direction   = "INGRESS"

  source_ranges = [var.subnet_cidr, var.pods_cidr, var.services_cidr]

  allow {
    protocol = "tcp"
  }

  allow {
    protocol = "udp"
  }

  allow {
    protocol = "icmp"
  }
}
