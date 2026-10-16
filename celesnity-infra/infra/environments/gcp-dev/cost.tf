########################################
# Cost estimate
#
# Rates for asia-southeast1 (Singapore), 730 hours. Confidence varies and is
# marked per rate below, because some come straight from Google's published
# pricing pages and others are regional extrapolations.
#
# VERIFIED from cloud.google.com:
#   - GKE cluster fee and the free-tier credit
#   - Cloud NAT: per-VM hourly, per-IP hourly, per-GiB processing
#
# VERIFIED from regional pricing tables:
#   - e2-standard-2 on-demand and Spot in asia-southeast1
#   - pd-balanced per GB-month
#
# EXTRAPOLATED (us-central1 rate x regional multiplier) — verify before
# budgeting:
#   - Cloud SQL db-g1-small, Cloud SQL SSD storage, GCS Standard
#
# Refresh any of these with:
#   gcloud billing accounts list
#   gcloud beta billing budgets list --billing-account=<id>
# or the Cloud Billing Catalog API for a specific SKU.
########################################

locals {
  cost_hours = 730

  # --- verified rates ---
  gke_cluster_hour = 0.10
  # Per billing account, not per cluster. Covers ONE Autopilot or zonal Standard
  # cluster. Regional Standard clusters are explicitly excluded.
  gke_free_tier_credit = 74.40

  node_hour_ondemand = 0.0827 # e2-standard-2, asia-southeast1
  node_hour_spot     = 0.0432
  pd_balanced_gb     = 0.12

  nat_hour_per_vm = 0.0014 # capped at 32 VMs
  nat_hour_per_ip = 0.005
  nat_gb          = 0.045
  # Cloud Load Balancing. The first FIVE global forwarding rules cost $0.025/hour
  # between them, not each, so one external ALB and five cost the same. Data
  # processing is $0.008/GiB each way and excluded here along with all other
  # traffic. The reserved address is free while it is attached to a forwarding
  # rule; an unattached static IP is billed instead.
  lb_forwarding_rule_hour = 0.025

  # --- extrapolated rates ---
  sql_g1_small_month   = 32.00 # us-central1 is ~$26; Singapore ~1.23x
  sql_ssd_gb           = 0.20
  gcs_standard_gb      = 0.02
  artifact_registry_gb = 0.10

  # --- derived ---
  effective_node_hour = var.node_spot ? local.node_hour_spot : local.node_hour_ondemand

  # A regional cluster creates node_count nodes PER ZONE. asia-southeast1 has 3.
  effective_node_count = var.zone != null ? var.node_count : var.node_count * 3

  cost_cluster = max(
    0,
    local.gke_cluster_hour * local.cost_hours - (var.zone != null ? local.gke_free_tier_credit : 0),
  )

  cost_nodes    = local.effective_node_count * local.effective_node_hour * local.cost_hours
  cost_node_pd  = local.effective_node_count * var.node_disk_size_gb * local.pd_balanced_gb
  cost_sql      = local.sql_g1_small_month * (var.db_availability_type == "REGIONAL" ? 2 : 1)
  cost_sql_disk = var.db_disk_size_gb * local.sql_ssd_gb

  # Cloud NAT bills per VM using the gateway, unlike AWS's flat per-gateway rate.
  # At this scale that is the single largest structural cost difference.
  cost_nat = var.enable_cloud_nat ? (
    local.nat_hour_per_vm * local.effective_node_count * local.cost_hours
    + local.nat_hour_per_ip * local.cost_hours
  ) : 0

  # Loki write-ahead log (4Gi) plus the Grafana PVC (2Gi).
  cost_observability_pd = var.install_observability ? (
    ((var.install_loki ? 4 : 0) + (var.install_grafana ? 2 : 0)) * local.pd_balanced_gb
  ) : 0

  # One global forwarding rule. Excludes data processing and the Cloud Armor policy
  # that accompanies it, whose rate is not verified here.
  cost_lb = var.enable_external_lb ? local.lb_forwarding_rule_hour * local.cost_hours : 0
  cost_total = (
    local.cost_cluster + local.cost_nodes + local.cost_node_pd +
    local.cost_sql + local.cost_sql_disk + local.cost_nat +
    local.cost_observability_pd + local.cost_lb
  )
}

output "estimated_monthly_cost_usd" {
  description = <<-EOT
    Estimate for the current variable values at 730 hours in asia-southeast1.
    Excludes object storage, network egress, and Cloud Logging. Verify against the
    Google Cloud Pricing Calculator before committing to a budget.
  EOT

  value = {
    region        = var.region
    cluster_mode  = var.zone != null ? "zonal (${var.zone})" : "regional (${var.region}, 3 zones)"
    node_count    = local.effective_node_count
    gke_cluster   = format("%.2f", local.cost_cluster)
    nodes         = format("%.2f", local.cost_nodes)
    node_disks    = format("%.2f", local.cost_node_pd)
    cloud_sql     = format("%.2f", local.cost_sql)
    cloud_sql_pd  = format("%.2f", local.cost_sql_disk)
    cloud_nat     = format("%.2f", local.cost_nat)
    observability = format("%.2f", local.cost_observability_pd)
    external_lb   = format("%.2f", local.cost_lb)
    TOTAL         = format("%.2f", local.cost_total)

    notes = compact([
      var.zone != null ? "GKE cluster fee fully offset by the $74.40 monthly free-tier credit." : "REGIONAL cluster: the free-tier credit does NOT apply, and node_count is per zone (x3).",
      var.node_spot ? "Spot estimated at the published Spot rate; actual rates float and capacity is not guaranteed." : null,
      "Cloud SQL shared-core (db-g1-small) and single-zone instances are excluded from the Cloud SQL SLA.",
      "Cloud SQL and GCS rates are extrapolated from us-central1; verify for asia-southeast1.",
      "Excludes GCS storage, egress, and Cloud Logging.",
      var.enable_external_lb ? "External ALB: one global forwarding rule. EXCLUDES $0.008/GiB each way of data processing and the Cloud Armor policy, whose rate is unverified here." : null,
      var.enable_external_lb && length(var.lb_allowed_source_ranges) == 0 ? "WARNING: external ALB is reachable from the entire internet. Set lb_allowed_source_ranges." : null,
    ])
  }
}
