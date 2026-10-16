########################################
# Node service account
#
# GKE defaults nodes to the Compute Engine default service account, which carries
# Editor on the whole project. This creates a minimal one instead and grants only
# what a node needs: pull images, write logs and metrics.
#
# Workload identity means pods do not inherit this account, so its permissions can
# stay this narrow.
########################################

resource "google_service_account" "node" {
  account_id   = "${var.name}-node"
  display_name = "GKE nodes for ${var.name}"
}

resource "google_project_iam_member" "node" {
  for_each = toset([
    "roles/container.defaultNodeServiceAccount",
    "roles/artifactregistry.reader",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/stackdriver.resourceMetadata.writer",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.node.email}"
}

########################################
# GKE cluster
########################################

resource "google_container_cluster" "this" {
  name = var.name

  # Zonal when var.zone is set, regional otherwise. Zonal halves the control
  # plane footprint and keeps all nodes in one failure domain, which also keeps
  # Spark shuffle and Trino exchange traffic out of cross-zone billing.
  location = coalesce(var.zone, var.region)

  # Pin production node locations so other regional resources, particularly
  # zonal NEGs, can be planned deterministically before the cluster exists.
  node_locations = var.zone == null && length(var.node_locations) > 0 ? var.node_locations : null

  network    = var.network
  subnetwork = var.subnet

  min_master_version  = var.kubernetes_version
  deletion_protection = var.deletion_protection

  release_channel {
    channel = var.release_channel
  }

  # VPC-native: Pod and Service IPs come from the subnet's secondary ranges
  # rather than from routes. Required for Workload Identity and for private
  # clusters, and the only supported mode for new clusters.
  networking_mode   = "VPC_NATIVE"
  datapath_provider = "ADVANCED_DATAPATH"

  ip_allocation_policy {
    cluster_secondary_range_name  = var.pods_range_name
    services_secondary_range_name = var.services_range_name
  }

  # Nodes get no external IP. Egress goes through Cloud NAT, and Google APIs go
  # through Private Google Access.
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = var.enable_private_endpoint
    master_ipv4_cidr_block  = var.master_ipv4_cidr_block
  }

  dynamic "master_authorized_networks_config" {
    for_each = length(var.authorized_networks) > 0 ? [1] : []

    content {
      dynamic "cidr_blocks" {
        for_each = var.authorized_networks

        content {
          cidr_block   = cidr_blocks.value.cidr_block
          display_name = cidr_blocks.value.display_name
        }
      }
    }
  }

  # Workload Identity Federation for GKE. This is the GCP counterpart to EKS Pod
  # Identity: it binds a Kubernetes ServiceAccount to a Google service account so
  # pods get short-lived credentials with no key material anywhere.
  #
  # Unlike EKS Pod Identity there is no agent DaemonSet — the GKE metadata server
  # runs on each node as part of the node config below.
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Gateway API. Installs the Gateway/HTTPRoute CRDs, the GKE-specific policy CRDs
  # (HealthCheckPolicy, GCPBackendPolicy, GCPGatewayPolicy), and the four
  # single-cluster GatewayClasses.
  #
  # Why this rather than more Ingress objects: on GKE every Ingress provisions its
  # OWN load balancer, with its own IP and its own certificate. There is no
  # equivalent of the AWS ALB's group.name annotation to merge them. Publishing
  # several hostnames on ONE address therefore means either cramming every service
  # into a single Ingress, or a Gateway that services attach their own HTTPRoute to.
  # The second keeps routing next to the service that owns it.
  #
  # Adding this is an in-place update. It does not recreate the cluster.
  gateway_api_config {
    channel = var.gateway_api_channel
  }

  # The default pool is unmanageable through google_container_node_pool, so it is
  # removed and replaced by the explicit pool below. initial_node_count is
  # required even though the pool is discarded.
  remove_default_node_pool = true
  initial_node_count       = 1

  # GKE must create a temporary default pool before Terraform can remove it.
  # Keep that disposable pool off the regional SSD quota: a regional cluster
  # creates one boot disk in every node location, and GKE otherwise defaults
  # each disk to 100 GiB of pd-balanced storage.
  node_config {
    disk_size_gb    = 20
    disk_type       = "pd-standard"
    service_account = google_service_account.node.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  # Managed Prometheus owns metrics collection. Alloy remains log-only, so the
  # two pipelines are complementary rather than duplicate ingestion paths.
  monitoring_config {
    enable_components = var.monitoring_components

    managed_prometheus {
      enabled = var.enable_managed_prometheus
    }
  }

  # Without this block GKE defaults to SYSTEM_COMPONENTS *and* WORKLOADS, which
  # runs a fluentbit-gke DaemonSet shipping every container log to Cloud Logging
  # at $0.50/GiB beyond the 50 GiB monthly free allowance.
  #
  # That would collect container logs twice: once to Cloud Logging and once
  # through Alloy to Loki, where the same data costs ~$0.02/GB in GCS. Dropping
  # WORKLOADS removes the duplicate. SYSTEM_COMPONENTS is kept because it carries
  # control plane and node diagnostics that Alloy cannot see, at low volume.
  logging_config {
    enable_components = var.logging_components
  }

  lifecycle {
    # The release channel moves the version forward on its own schedule; Terraform
    # should not try to pull it back on every plan.
    # node_config belongs only to the temporary default pool. Once that pool is
    # removed, GKE cannot update it and would return "default-pool not found".
    ignore_changes = [min_master_version, node_config]
  }

  depends_on = [
    google_project_iam_member.node,
    terraform_data.egress_ready,
  ]
}

########################################
# Node pool
########################################

resource "google_container_node_pool" "default" {
  name     = "${var.name}-default"
  cluster  = google_container_cluster.this.name
  location = coalesce(var.zone, var.region)

  # With a zonal cluster this is the literal node count. With a regional cluster
  # GKE creates this many nodes PER ZONE, so three zones means 3x the nodes and
  # 3x the bill.
  node_count = var.node_count

  autoscaling {
    min_node_count = var.node_min_count
    max_node_count = var.node_max_count
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
  }

  node_config {
    machine_type = var.node_machine_type
    disk_size_gb = var.node_disk_size_gb
    disk_type    = var.node_disk_type
    spot         = var.node_spot

    service_account = google_service_account.node.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]

    # GKE_METADATA runs the metadata server that serves Workload Identity
    # credentials, and blocks pods from reading the node's own service account
    # from the legacy metadata endpoint. Without this, Workload Identity does not
    # function and pods would silently fall back to the node identity.
    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    labels = {
      "celesnity-io-pool" = "default"
    }

    tags = ["${var.name}-node"]
  }

  lifecycle {
    # Handed to the autoscaler after creation.
    ignore_changes = [node_count]
  }

  depends_on = [
    google_project_iam_member.node,
    terraform_data.egress_ready,
  ]
}

# Sequencing handle for egress, referenced from the node pool above. Nodes in a
# subnet without working egress never register and the pool fails opaquely.
resource "terraform_data" "egress_ready" {
  input = var.egress_dependencies
}
