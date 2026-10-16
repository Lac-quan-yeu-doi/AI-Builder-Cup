locals {
  name                                       = "${var.project}-${var.environment}"
  infrastructure_build_service_account_email = "celesnity-infra-cloud-build@${var.project_id}.iam.gserviceaccount.com"
  core_build_service_account_email           = coalesce(var.core_build_service_account_email, "celesnity-apps-cloud-build@${var.project_id}.iam.gserviceaccount.com")

  # GCP labels have stricter rules than AWS tags: lowercase, and no dots.
  labels = {
    project     = var.project
    environment = replace(lower(var.environment), ".", "-")
    managed-by  = "terraform"
  }
}

########################################
# Network
#
# Cloud NAT is managed here, unlike the AWS build's hand-rolled NAT instance.
# Private Google Access on the subnet is the free equivalent of the S3 gateway
# endpoint and keeps GCS and Artifact Registry traffic off the NAT path.
########################################

module "network" {
  source = "../../modules/gcp/network"

  name          = local.name
  region        = var.region
  subnet_cidr   = var.subnet_cidr
  pods_cidr     = var.pods_cidr
  services_cidr = var.services_cidr

  enable_cloud_nat = var.enable_cloud_nat
}

########################################
# Cluster
########################################

module "cluster" {
  source = "../../modules/gcp/cluster"

  name           = local.name
  project_id     = var.project_id
  region         = var.region
  zone           = var.zone
  node_locations = var.regional_cluster_zones

  network             = module.network.network_name
  subnet              = module.network.subnet_name
  pods_range_name     = module.network.pods_range_name
  services_range_name = module.network.services_range_name

  # Nodes launched before egress works never register, and the pool fails ~25
  # minutes later with no useful error. Learned on the AWS side.
  egress_dependencies = module.network.egress_dependencies

  release_channel         = var.release_channel
  kubernetes_version      = var.kubernetes_version
  master_ipv4_cidr_block  = var.master_ipv4_cidr_block
  enable_private_endpoint = var.enable_private_endpoint
  deletion_protection     = var.cluster_deletion_protection

  # authorized_networks is deliberately not set, so the module's default of []
  # applies and GKE imposes no CIDR restriction on the API endpoint. Access is
  # gated by IAM and TLS alone, via `gcloud auth application-default login`.
  #
  # This removes a network-layer control rather than replacing it: ADC is
  # authentication, not a network filter. Valid credentials from any network now
  # reach the endpoint. The module retains the capability for the EU/production
  # environment, where defence in depth is worth the IP maintenance.

  # Omits WORKLOADS so container logs are not billed twice: once to Cloud Logging
  # and once through Alloy to Loki.
  logging_components        = var.logging_components
  monitoring_components     = var.monitoring_components
  enable_managed_prometheus = var.enable_managed_prometheus

  node_machine_type = var.node_machine_type
  node_count        = var.node_count
  node_min_count    = var.node_min_count
  node_max_count    = var.node_max_count
  node_disk_size_gb = var.node_disk_size_gb
  node_disk_type    = var.node_disk_type
  node_spot         = var.node_spot
}

module "identity" {
  source                    = "../../modules/gcp/identity"
  project_id                = var.project_id
  secret_prefix             = var.environment
  tenant_display_name       = "Celesnity-Prod"
  tenant_id_source_version  = var.identity_tenant_id_source_version
  authorized_domains        = ["app.celesnity.com"]
  browser_api_key_name      = "celesnity-prod-browser"
  browser_allowed_referrers = ["https://app.celesnity.com/*"]
}

module "authorization_bootstrap_secrets" {
  source = "../../modules/gcp/authorization-bootstrap-secrets"

  project_id                       = var.project_id
  environment                      = var.environment
  region                           = var.region
  tenant_id_secret_id              = module.identity.tenant_id_secret_id
  core_build_service_account_email = local.core_build_service_account_email
}

########################################
# Data plane
########################################

module "data" {
  source = "../../modules/gcp/data"

  name       = local.name
  project_id = var.project_id
  region     = var.region

  network_id        = module.network.network_id
  network_self_link = module.network.network_self_link

  db_edition                        = var.db_edition
  db_tier                           = var.db_tier
  db_disk_size_gb                   = var.db_disk_size_gb
  db_version                        = var.db_version
  db_name                           = var.db_name
  db_username                       = var.db_username
  db_availability_type              = var.db_availability_type
  db_backup_enabled                 = var.db_backup_enabled
  db_point_in_time_recovery_enabled = var.db_point_in_time_recovery_enabled
  db_deletion_protection            = var.db_deletion_protection

  # Bounds how long personal data survives in backups after deletion, which sets
  # the floor on the Art. 17 erasure SLA.
  db_retained_backups = var.db_retained_backups

  warehouse_bucket_name = var.warehouse_bucket_name
  artifacts_bucket_name = var.artifacts_bucket_name
  force_destroy         = var.force_destroy_buckets

  # Without this, deleted objects persist forever as hidden noncurrent versions
  # and erasure is ineffective.
  noncurrent_version_retention_days = var.noncurrent_version_retention_days
}

module "monitoring" {
  source = "../../modules/gcp/monitoring"

  project_id                   = var.project_id
  environment                  = var.environment
  application_hostname         = var.application_hostname
  cloud_sql_instance_id        = "${var.project_id}:${module.data.db_instance_name}"
  notification_email_addresses = var.monitoring_notification_email_addresses

  depends_on = [google_project_iam_member.infrastructure_build_monitoring]
}

# The infrastructure runner already has projectIamAdmin from the one-time
# bootstrap. Manage its feature-specific permission here so every environment
# receives it through the same promoted Terraform revision.
resource "google_project_iam_member" "infrastructure_build_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.editor"
  member  = "serviceAccount:${local.infrastructure_build_service_account_email}"
}

########################################
# Platform
#
# Everything that talks to the Kubernetes API: namespace, Workload Identity
# bindings, credentials, and the Iceberg catalog bootstrap Job.
#
# GKE needs no load balancer controller and no CSI driver addon — Ingress and
# persistent disks are built in — so this module is smaller than its AWS twin.
########################################

module "platform" {
  source = "../../modules/gcp/platform"

  name                = local.name
  project_id          = var.project_id
  region              = var.region
  enable_firmware_kms = true
  namespace           = var.workload_namespace
  agent_namespace     = var.agent_namespace

  workload_identity_pool = module.cluster.workload_identity_pool
  cluster_dependencies   = module.cluster.cluster_ready

  db_host           = module.data.db_private_ip
  db_name           = module.data.db_name
  db_username       = module.data.db_username
  db_password       = module.data.db_password
  db_server_ca_cert = module.data.db_server_ca_cert

  warehouse_bucket = module.data.warehouse_bucket
  artifacts_bucket = module.data.artifacts_bucket

  # The same file the local Compose stack applies via
  # docker-entrypoint-initdb.d, and the same one the AWS build uses.
  catalog_bootstrap_sql = file("${path.root}/../../../config/sql/01-iceberg-catalog.sql")

  trino_tls_secret_version           = var.trino_tls_secret_version
  trino_ca_secret_version            = var.trino_ca_secret_version
  trino_user_password_secret_version = var.trino_user_password_secret_version
  trino_shared_secret_version        = var.trino_shared_secret_version
  trino_kubernetes_secret_revision   = var.trino_kubernetes_secret_revision

  # Keep in step with deploy/overlays/gcp-prod/kustomization.yaml, which applies the
  # Ingress and BackendConfig that reference these resources by name.
  enable_external_lb       = var.enable_external_lb
  lb_allowed_source_ranges = var.lb_allowed_source_ranges
  lb_hostname              = var.lb_hostname
  lb_certificate_name      = var.lb_certificate_name

  # Hostnames routed by HTTPRoutes that live in celesnity-core and celesnity-web
  # rather than in this repository. They share this Gateway, so the certificate map
  # has to cover them here.
  lb_additional_hostnames = var.lb_additional_hostnames
}

########################################
# MQTT streaming backbone
########################################

module "streaming" {
  source = "../../modules/gcp/streaming"

  name                       = local.name
  project_id                 = var.project_id
  cluster_name               = module.cluster.cluster_name
  cluster_location           = module.cluster.cluster_location
  cluster_zones              = var.zone != null ? [var.zone] : var.regional_cluster_zones
  region                     = var.region
  network                    = module.network.network_self_link
  node_service_account_email = module.cluster.node_service_account_email
  cluster_dependencies       = module.cluster.cluster_ready
  workload_namespace         = var.workload_namespace

  namespace                       = var.streaming_namespace
  broker_replicas                 = var.redpanda_replicas
  broker_storage_size             = var.redpanda_storage_size
  node_machine_type               = var.redpanda_node_machine_type
  node_count                      = var.streaming_node_count
  node_disk_size_gb               = var.streaming_node_disk_size_gb
  node_disk_type                  = var.streaming_node_disk_type
  broker_data_disk_type           = var.streaming_data_disk_type
  redpanda_chart_version          = var.redpanda_chart_version
  redpanda_image_tag              = var.redpanda_image_tag
  mqtt_broker_replicas            = var.mqtt_broker_replicas
  mqtt_broker_storage_size        = var.mqtt_broker_storage_size
  mqtt_hostname                   = var.mqtt_hostname
  mqtt_certificate_name           = var.mqtt_certificate_name
  mqtt_dns_managed_zone           = var.mqtt_dns_managed_zone
  emqx_chart_version              = var.emqx_chart_version
  redpanda_tls_enabled            = var.redpanda_tls_enabled
  redpanda_rack_awareness_enabled = var.redpanda_rack_awareness_enabled
  cert_manager_chart_version      = var.cert_manager_chart_version

  depends_on = [module.platform]
}

########################################
# Observability
#
# Alloy DaemonSet -> Loki (single binary, GCS backed) -> Grafana.
#
# The Alloy pipeline is byte-identical to the AWS build; only Loki's storage
# backend and identity mechanism differ.
########################################

module "observability" {
  source = "../../modules/gcp/observability"
  count  = var.install_observability ? 1 : 0

  name       = local.name
  project_id = var.project_id
  region     = var.region
  namespace  = var.monitoring_namespace

  workload_identity_pool = module.cluster.workload_identity_pool
  cluster_dependencies   = module.cluster.cluster_ready

  install_loki         = var.install_loki
  install_grafana      = var.install_grafana
  enable_error_alerts  = var.enable_error_alerts
  loki_retention_hours = var.loki_retention_hours
  loki_write_endpoint  = var.loki_write_endpoint

  # Publish Grafana through the same Gateway, certificate, address, and Cloud
  # Armor policy as the application services. An empty hostname keeps Grafana
  # private and preserves the port-forward-only behaviour.
  grafana_hostname             = var.enable_external_lb ? var.grafana_hostname : ""
  grafana_gateway_name         = "celesnity"
  grafana_gateway_namespace    = var.workload_namespace
  grafana_security_policy_name = "${local.name}-trino-lb"

  log_namespaces = [var.workload_namespace, var.agent_namespace, var.monitoring_namespace]
}

########################################
# Audit logging
#
# GDPR Art. 30 and Art. 33: Admin Activity logs are always on and free, but Data
# Access logs — who read which object or row — are off by default and are the ones
# that answer "whose data was accessed" after an incident.
#
# Billed as log ingestion beyond the 50 GiB monthly free allowance, and the
# Iceberg warehouse generates a lot of small GCS reads. Scoped to the three
# services that actually hold personal data rather than allServices.
########################################

module "audit" {
  source = "../../modules/gcp/audit"

  project_id              = var.project_id
  enable_data_access_logs = var.enable_data_access_logs
  exempted_members        = var.audit_exempted_members
  log_retention_days      = var.log_retention_days
}
