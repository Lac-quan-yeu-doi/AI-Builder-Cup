########################################
# Identity and placement
########################################

variable "project_id" {
  description = "GCP project ID. No default: there is no safe guess, and applying into the wrong project is expensive to undo."
  type        = string
}

variable "core_build_service_account_email" {
  description = "Core release trigger service account. Set this if the trigger identity changes; only this principal receives bootstrap-secret access."
  type        = string
  default     = null
}

variable "project" {
  description = "Name prefix applied to every resource."
  type        = string
  default     = "celesnity"
}

variable "environment" {
  description = <<-EOT
    Environment name. Feeds local.name ("<project>-<environment>"), which becomes
    the cluster name and the prefix on every resource, so it should match the
    directory name under infra/environments/.
  EOT
  type        = string
  default     = "gcp-dev"
}

variable "region" {
  description = <<-EOT
    GCP region. asia-southeast1 is Singapore, matching the AWS build's
    ap-southeast-1.

    DATA RESIDENCY: this is a deliberate, temporary choice. Singapore has no EU
    adequacy decision, so if EU personal data is processed here it constitutes a
    restricted third-country transfer under GDPR Chapter V (Art. 44-49) and
    requires Standard Contractual Clauses plus a transfer impact assessment.

    The agreed plan is to migrate to an EU region later. Every data store in this
    stack inherits this variable — GCS buckets, Cloud SQL, persistent disks, and
    Loki chunks — so the move is a single change here plus a rebuild:

      region = "europe-west4"   # Netherlands
      zone   = "europe-west4-a"

    Buckets and Cloud SQL instances cannot change region in place, so migrating
    means recreating them and copying data. Do it before this holds production
    personal data.
  EOT
  type        = string
  default     = "asia-southeast1"
}

variable "zone" {
  description = <<-EOT
    Zone for a zonal cluster. Zonal is the dev default: a regional cluster
    replicates the control plane across three zones AND creates node_count nodes
    per zone, tripling compute for the same declared size.

    Set to null for a regional cluster.
  EOT
  type        = string
  default     = "asia-southeast1-a"
}

variable "regional_cluster_zones" {
  description = "Explicit GKE node zones when zone is null. Must belong to region."
  type        = list(string)
  default     = ["asia-southeast1-a", "asia-southeast1-b", "asia-southeast1-c"]
}

########################################
# Network
########################################

variable "subnet_cidr" {
  description = "Primary range for the node subnet."
  type        = string
  default     = "10.30.0.0/20"
}

variable "pods_cidr" {
  description = "Secondary range for Pod IPs. GKE assigns a /24 per node by default."
  type        = string
  default     = "10.31.0.0/16"
}

variable "services_cidr" {
  description = "Secondary range for Service ClusterIPs."
  type        = string
  default     = "10.32.0.0/20"
}

variable "enable_cloud_nat" {
  description = <<-EOT
    Cloud NAT for public internet egress. Required to pull the Trino, Loki,
    Grafana, and Alloy images from Docker Hub. Google APIs bypass it for free via
    Private Google Access.
  EOT
  type        = bool
  default     = true
}

########################################
# Cluster
########################################

variable "release_channel" {
  description = <<-EOT
    GKE auto-upgrade channel: RAPID, REGULAR, STABLE, or EXTENDED.

    Unlike EKS there is no version-based surcharge, so falling behind is an
    operational risk rather than a billing cliff.
  EOT
  type        = string
  default     = "REGULAR"
}

variable "kubernetes_version" {
  description = "Optional minimum master version. Null lets the release channel decide, which is usually right."
  type        = string
  default     = null
}

variable "master_ipv4_cidr_block" {
  description = "/28 for the GKE-managed control plane. Must not overlap the VPC ranges."
  type        = string
  default     = "172.16.0.0/28"
}

variable "enable_private_endpoint" {
  description = "Remove the public Kubernetes API address entirely. Requires a bastion or Cloud Shell for kubectl."
  type        = bool
  default     = false
}

variable "cluster_deletion_protection" {
  description = "Block `terraform destroy` from removing the cluster."
  type        = bool
  default     = false
}

########################################
# Node pool
########################################

variable "node_machine_type" {
  description = <<-EOT
    e2-standard-2 is 2 vCPU / 8 GiB. Note this is double the memory of the AWS
    build's t4g.medium, which removes the ~2.8 GiB per-node scheduling ceiling
    that constrained Trino there.
  EOT
  type        = string
  default     = "e2-standard-2"
}

variable "node_count" {
  description = "Nodes in the pool. Per zone if the cluster is regional."
  type        = number
  default     = 2
}

variable "node_min_count" {
  description = "Autoscaler minimum."
  type        = number
  default     = 1
}

variable "node_max_count" {
  description = "Autoscaler maximum."
  type        = number
  default     = 4
}

variable "node_disk_size_gb" {
  description = "Boot disk size per node in GB."
  type        = number
  default     = 50
}

variable "node_disk_type" {
  description = "pd-standard is cheapest; pd-balanced is the GKE default."
  type        = string
  default     = "pd-balanced"
}

variable "node_spot" {
  description = "Spot VMs. Typically 60-91% off, with 30 seconds of preemption notice."
  type        = bool
  default     = false
}

variable "streaming_namespace" {
  description = "Namespace for the Redpanda broker StatefulSet."
  type        = string
  default     = "celesnity-streaming"
}

variable "redpanda_replicas" {
  description = "Redpanda brokers. Use 3 for the million-event production profile."
  type        = number
  default     = 1
}

variable "redpanda_storage_size" {
  type    = string
  default = "50Gi"
}

variable "redpanda_node_machine_type" {
  type    = string
  default = "n2-standard-4"
}

variable "streaming_node_count" {
  description = "Dedicated streaming nodes per cluster zone."
  type        = number
  default     = 1
}

variable "streaming_node_oauth_scopes" {
  description = "OAuth scopes retained on the existing development streaming node pool."
  type        = list(string)
  default     = ["https://www.googleapis.com/auth/cloud-platform"]
}

variable "streaming_node_enable_secure_boot" {
  description = "Secure Boot setting for the development streaming pool. Changing it requires node-pool replacement."
  type        = bool
  default     = true
}

variable "redpanda_chart_version" {
  type    = string
  default = "26.1.10"
}

variable "redpanda_image_tag" {
  type    = string
  default = "v26.1.14"
}

variable "mqtt_broker_replicas" {
  description = "Managed EMQX brokers. Use 3 for the production profile."
  type        = number
  default     = 1
}

variable "mqtt_broker_storage_size" {
  type    = string
  default = "20Gi"
}

variable "mqtt_hostname" {
  description = "DNS name users publish to through the Google SSL proxy."
  type        = string
  default     = "dev-mqtt.celesnity.com"
}

variable "mqtt_certificate_name" {
  description = "Existing global Certificate Manager certificate covering mqtt_hostname."
  type        = string
  default     = "celesnity"
}

variable "mqtt_dns_managed_zone" {
  description = "Optional existing Cloud DNS managed-zone name for mqtt_hostname."
  type        = string
  default     = ""
}

variable "emqx_chart_version" {
  type    = string
  default = "5.8.9"
}

variable "redpanda_tls_enabled" {
  description = "Encrypt Redpanda traffic and distribute the private CA to clients."
  type        = bool
  default     = false
}

variable "redpanda_rack_awareness_enabled" {
  description = "Use GKE zones as Redpanda racks."
  type        = bool
  default     = false
}

variable "cert_manager_chart_version" {
  type    = string
  default = "v1.21.1"
}

########################################
# FTPS inbound connector
########################################

variable "ftps_hostname" {
  description = "Bare DNS hostname that external explicit-FTPS clients connect to."
  type        = string
  default     = "ftps-dev.celesnity.com"
}

variable "ftps_ingress_bucket_name" {
  description = "Optional globally unique GCS bucket name for FTPS uploads. Empty derives a project-specific name."
  type        = string
  default     = ""
}

variable "ftps_tenant_prefix" {
  description = "Tenant-scoped GCS prefix for the development FTPS demo account."
  type        = string
  default     = "tnt_gcpdev000001"
}

variable "ftps_sftpgo_image" {
  description = "Pinned image for the single-replica SFTPGo FTPS runtime."
  type        = string
  default     = "drakkan/sftpgo:v2.7.5"
}

variable "ftps_sqlite_storage_size" {
  description = "Small PVC size for SFTPGo SQLite configuration state, not uploaded customer files."
  type        = string
  default     = "5Gi"
}

variable "ftps_sqlite_storage_class" {
  description = "Optional StorageClass for SFTPGo SQLite state. Empty uses GKE's default."
  type        = string
  default     = ""
}

variable "ftps_bootstrap_revision" {
  description = "Increment after an intentional FTPS password rotation to rerun the SFTPGo bootstrap Job."
  type        = string
  default     = "v1"
}

variable "ftps_demo_password_secret_version" {
  description = "Pinned Secret Manager version for the FTPS demo-user password."
  type        = string
}

variable "ftps_status_password_secret_version" {
  description = "Pinned Secret Manager version for the FTPS status-reader password."
  type        = string
}

variable "ftps_kubernetes_secret_revision" {
  description = "Monotonic revision used to sync pinned FTPS credentials to Kubernetes."
  type        = number
}

########################################
# Cloud SQL
########################################

variable "db_edition" {
  description = <<-EOT
    ENTERPRISE or ENTERPRISE_PLUS. Must be explicit: PostgreSQL 16 and later
    default to ENTERPRISE_PLUS, which only accepts db-perf-optimized-N-* machines
    and costs several times a shared-core instance.
  EOT
  type        = string
  default     = "ENTERPRISE"
}

variable "db_tier" {
  description = "db-g1-small is 1 vCPU / 1.7 GiB shared-core, closest to db.t3.small on RDS. Must match db_edition."
  type        = string
  default     = "db-g1-small"
}

variable "db_disk_size_gb" {
  description = "Cloud SQL storage in GB."
  type        = number
  default     = 20
}

variable "db_version" {
  description = "Cloud SQL PostgreSQL version."
  type        = string
  default     = "POSTGRES_17"
}

variable "db_name" {
  description = "Database name."
  type        = string
  default     = "celesnity"
}

variable "db_username" {
  description = "Application user."
  type        = string
  default     = "celesnity"
}

variable "db_availability_type" {
  description = "ZONAL or REGIONAL. REGIONAL roughly doubles instance cost."
  type        = string
  default     = "ZONAL"
}

variable "db_backup_enabled" {
  description = "Automated backups."
  type        = bool
  default     = true
}

variable "db_point_in_time_recovery_enabled" {
  description = "Enable Cloud SQL point-in-time recovery through PostgreSQL WAL archiving."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Block `terraform destroy` from removing the database."
  type        = bool
  default     = false
}

########################################
# Storage
########################################

variable "warehouse_bucket_name" {
  description = "Iceberg warehouse bucket. Empty generates one from name and project ID."
  type        = string
  default     = ""
}

variable "artifacts_bucket_name" {
  description = "Artifacts bucket. Empty generates one."
  type        = string
  default     = ""
}

variable "force_destroy_buckets" {
  description = "Allow `terraform destroy` to delete non-empty buckets. Never enable outside dev."
  type        = bool
  default     = false
}

########################################
# Platform and observability
########################################

variable "workload_namespace" {
  description = "Namespace the Trino and Spark workloads run in."
  type        = string
  default     = "celesnity"
}

variable "trino_tls_secret_version" {
  description = "Pinned development Secret Manager version containing the Trino certificate and private key."
  type        = string
}

variable "trino_ca_secret_version" {
  description = "Pinned development Secret Manager version containing the Trino CA certificate."
  type        = string
}

variable "trino_user_password_secret_version" {
  description = "Pinned development Secret Manager version containing the Trino client password."
  type        = string
}

variable "trino_shared_secret_version" {
  description = "Pinned development Secret Manager version containing the Trino internal shared secret."
  type        = string
}

variable "trino_kubernetes_secret_revision" {
  description = "Increment after rotating either Trino Secret Manager version."
  type        = number
}

variable "monitoring_namespace" {
  description = "Namespace for Alloy, Loki, and Grafana."
  type        = string
  default     = "monitoring"
}

variable "install_observability" {
  description = "Deploy the Alloy to Loki to Grafana log pipeline."
  type        = bool
  default     = true
}

variable "install_loki" {
  description = "Run Loki in-cluster. False with loki_write_endpoint ships to Grafana Cloud instead."
  type        = bool
  default     = true
}

variable "install_grafana" {
  description = "Run Grafana with the Loki datasource pre-provisioned."
  type        = bool
  default     = true
}

variable "enable_error_alerts" {
  description = "Enable provisioned application error alert rules after Discord routing is configured in Grafana."
  type        = bool
  default     = true
}

variable "loki_retention_hours" {
  description = "Log retention, enforced by the Loki compactor. 168h is 7 days."
  type        = number
  default     = 168
}

variable "loki_write_endpoint" {
  description = "External Loki push URL. Empty targets the in-cluster Loki."
  type        = string
  default     = ""
}

variable "logging_components" {
  description = <<-EOT
    Log streams GKE ships to Cloud Logging. GKE's own default includes WORKLOADS,
    which duplicates the Alloy to Loki pipeline at $0.50/GiB against roughly
    $0.02/GB in GCS, so it is omitted.

    Add "WORKLOADS" back if you would rather query container logs in Cloud Logging
    than in Grafana, or set [] to disable Cloud Logging entirely.
  EOT
  type        = list(string)
  default     = ["SYSTEM_COMPONENTS"]
}

variable "enable_managed_prometheus" {
  description = "Enable managed Prometheus collection for application RED metrics."
  type        = bool
  default     = true
}

variable "monitoring_components" {
  description = "Curated GKE metric packages for USE dashboards."
  type        = list(string)
  default = [
    # Keep GKE API canonical order to avoid a perpetual in-place cluster diff.
    "SYSTEM_COMPONENTS", "HPA", "POD", "DEPLOYMENT", "CADVISOR", "KUBELET",
  ]
}

variable "agent_namespace" {
  description = "Namespace containing the agent runtime."
  type        = string
  default     = "minder"
}

########################################
# Audit logging (GDPR Art. 30, 33)
########################################

variable "enable_data_access_logs" {
  description = <<-EOT
    Enable Cloud Audit Logs Data Access logging on GCS, Cloud SQL, and Secret
    Manager. Required to answer "whose data was accessed" for Art. 30 records and
    Art. 33 breach notification.

    Costs money: log ingestion at $0.50/GiB beyond 50 GiB free per project per
    month, and Iceberg's many small metadata reads make GCS the dominant source.
    Disable only if you have another way to satisfy those articles.
  EOT
  type        = bool
  default     = true
}

variable "audit_exempted_members" {
  description = <<-EOT
    Principals excluded from Data Access logging. Each entry is a deliberate hole
    in the audit trail and should be justifiable to an auditor. Normally empty.
  EOT
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = <<-EOT
    Retention for the project's _Default log bucket. Audit logs describing access
    to personal data are themselves personal data, so Art. 5(1)(e) storage
    limitation applies. Cloud Logging's own default is 30 days; 90 balances
    forensic usefulness against holding the data longer than needed.

    Null leaves the Google default untouched.
  EOT
  type        = number
  default     = 90
}

########################################
# Retention bounds (GDPR Art. 5(1)(e), Art. 17)
#
# These two values, together with loki_retention_hours and the Iceberg snapshot
# retention below, define how long personal data survives a deletion. They are
# what a documented erasure SLA should be built from.
########################################

variable "db_retained_backups" {
  description = "Automated Cloud SQL backups to retain. Daily, so 7 is roughly a week of recovery window."
  type        = number
  default     = 7
}

variable "noncurrent_version_retention_days" {
  description = <<-EOT
    How long overwritten or deleted object versions survive in the versioned
    artifacts bucket. Without a bound, a delete leaves a hidden version behind
    indefinitely and Art. 17 erasure is ineffective.
  EOT
  type        = number
  default     = 30
}

########################################
# External load balancer
########################################

variable "enable_external_lb" {
  description = <<-EOT
    Publish the Trino coordinator on the public internet through an external
    Application Load Balancer.

    Must match deploy/overlays/gcp-dev/kustomization.yaml, which applies the
    Ingress and BackendConfig referencing the address, certificate, and Cloud Armor
    policy this creates.
  EOT
  type        = bool
  default     = false
}

variable "lb_allowed_source_ranges" {
  description = <<-EOT
    CIDR ranges allowed to reach the load balancer, enforced by Cloud Armor.
    Empty means open to the internet, with the Trino password as the only control.
    Find your address with: curl -s https://ifconfig.me
  EOT
  type        = list(string)
  default     = []
}

variable "lb_hostname" {
  description = <<-EOT
    Optional DNS name added to the load balancer certificate. Leave empty to issue
    against the reserved IP only, which requires clients to pass --insecure.
  EOT
  type        = string
  default     = ""
}

variable "lb_certificate_name" {
  description = <<-EOT
    Name of an existing global Certificate Manager certificate to serve on the load
    balancer. When set, Terraform wraps it in a certificate map and the Gateway
    attaches that map; the self-signed fallback is not created and clients no longer
    need --insecure. Create the certificate out of band: issuance depends on
    _acme-challenge DNS records this repo does not manage.
  EOT
  type        = string
  default     = ""
}

variable "lb_additional_hostnames" {
  description = <<-EOT
    Extra hostnames sharing the Gateway with lb_hostname, one certificate map entry
    each. Needed by HTTPRoutes owned outside this repository — celesnity-core and
    celesnity-web both attach to this Gateway — because TLS is selected by SNI and a
    routed hostname with no map entry fails the handshake.

    Each name must be covered by lb_certificate_name.
  EOT
  type        = list(string)
  default     = []
}

variable "grafana_hostname" {
  description = <<-EOT
    Optional public hostname for Grafana. When set with enable_external_lb and
    install_grafana, the observability module attaches Grafana to the shared GKE
    Gateway and configures its external root URL. The name must be covered by the
    configured Certificate Manager certificate and have an A record pointing at
    trino_lb_address.
  EOT
  type        = string
  default     = ""

  validation {
    condition = (
      var.grafana_hostname == "" ||
      can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$", var.grafana_hostname))
    )
    error_message = "grafana_hostname must be empty or a lowercase DNS hostname such as grafana-dev.celesnity.com."
  }
}

variable "application_hostname" {
  description = "Public Web hostname monitored over HTTPS."
  type        = string
  default     = "dev.celesnity.com"
}

variable "monitoring_notification_email_addresses" {
  description = "Verified on-call email destinations for development alerts."
  type        = set(string)
  default     = []
}
