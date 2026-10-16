variable "name" {
  description = "Name prefix for IAM and S3 resources created here."
  type        = string
}

variable "region" {
  description = "AWS region, used for the Loki S3 backend."
  type        = string
}

variable "namespace" {
  description = "Namespace for the logging stack."
  type        = string
  default     = "monitoring"
}

########################################
# Cluster wiring
########################################

variable "cluster_name" {
  description = "EKS cluster name, required to create the Loki pod identity association."
  type        = string
}

variable "pod_identity_assume_role_policy" {
  description = "Trust policy JSON for roles assumed via EKS Pod Identity, from the cluster module."
  type        = string
}

variable "cluster_dependencies" {
  description = "Opaque values to sequence against. Pass the cluster module's addons_ready."
  type        = list(string)
  default     = []
}

########################################
# Loki
########################################

variable "install_loki" {
  description = <<-EOT
    Deploy Loki in-cluster. Set false and provide loki_write_endpoint to ship logs
    to Grafana Cloud or an external Loki instead, which removes roughly 0.5 GiB of
    memory pressure from the cluster.
  EOT
  type        = bool
  default     = true
}

variable "loki_chart_version" {
  description = "Helm chart version for grafana/loki. Chart 7.2.0 ships Loki 3.6.11."
  type        = string
  default     = "7.2.0"
}

variable "loki_bucket_name" {
  description = "S3 bucket for Loki chunks and ruler data. Empty generates one from name and account ID."
  type        = string
  default     = ""
}

variable "loki_retention_hours" {
  description = <<-EOT
    How long to keep log chunks. Retention is enforced by the compactor, and S3
    storage is billed per GB-month, so this is the main cost lever for logging.
  EOT
  type        = number
  default     = 168 # 7 days
}

variable "loki_memory_limit" {
  description = "Memory limit for the Loki single-binary pod."
  type        = string
  default     = "512Mi"
}

variable "loki_write_endpoint" {
  description = <<-EOT
    Where Alloy pushes logs. Empty targets the in-cluster Loki. Set to an external
    push URL (for example a Grafana Cloud endpoint) to skip running Loki locally.
  EOT
  type        = string
  default     = ""
}

########################################
# Alloy
########################################

variable "alloy_chart_version" {
  description = "Helm chart version for grafana/alloy. Chart 1.11.1 ships Alloy v1.18.1."
  type        = string
  default     = "1.11.1"
}

variable "alloy_memory_limit" {
  description = <<-EOT
    Memory limit per Alloy pod. Alloy runs as a DaemonSet, so this is charged once
    per node: the cluster-wide cost is this value times the node count.
  EOT
  type        = string
  default     = "256Mi"
}

variable "log_namespaces" {
  description = <<-EOT
    Namespaces to collect container logs from. Empty collects from all namespaces,
    which on a small cluster mostly means adding kube-system noise. Narrowing this
    is the cheapest way to cut ingest volume.
  EOT
  type        = list(string)
  default     = []
}

variable "drop_healthcheck_logs" {
  description = <<-EOT
    Drop lines matching common health-check probe patterns before shipping. Trino
    and Spark readiness probes fire every 10 seconds per pod and dominate log
    volume on an idle cluster.
  EOT
  type        = bool
  default     = true
}

########################################
# Grafana
########################################

variable "install_grafana" {
  description = "Deploy Grafana with the Loki datasource pre-provisioned."
  type        = bool
  default     = true
}

variable "grafana_chart_version" {
  description = "Helm chart version for grafana/grafana. Chart 10.5.15 ships Grafana 12.3.1."
  type        = string
  default     = "10.5.15"
}

variable "grafana_memory_limit" {
  description = "Memory limit for the Grafana pod."
  type        = string
  default     = "320Mi"
}

variable "grafana_persistence_size" {
  description = <<-EOT
    PVC size for Grafana's SQLite database, which holds dashboards and users
    created through the UI. Provisioned datasources survive without it; anything
    you build by hand does not.
  EOT
  type        = string
  default     = "2Gi"
}

variable "grafana_storage_class" {
  description = "StorageClass for the Grafana PVC. Defaults to the gp3 class created by the platform module."
  type        = string
  default     = "gp3"
}
