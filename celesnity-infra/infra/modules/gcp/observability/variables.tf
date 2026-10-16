variable "name" {
  description = "Name prefix for Google service accounts and buckets created here."
  type        = string
}

variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
}

variable "namespace" {
  description = "Namespace for the logging stack."
  type        = string
  default     = "monitoring"
}

variable "workload_identity_pool" {
  description = "Workload Identity pool from the cluster module."
  type        = string
}

variable "cluster_dependencies" {
  description = "Opaque values to sequence against. Pass the cluster module's cluster_ready."
  type        = list(string)
  default     = []
}

########################################
# Loki
########################################

variable "install_loki" {
  description = <<-EOT
    Deploy Loki in-cluster. Set false with loki_write_endpoint to ship to Grafana
    Cloud instead, which removes roughly 0.5 GiB of memory pressure.
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
  description = "GCS bucket for Loki chunks and index. Empty generates one."
  type        = string
  default     = ""
}

variable "loki_retention_hours" {
  description = "How long the compactor keeps log chunks. The main cost lever for logging."
  type        = number
  default     = 168 # 7 days
}

variable "loki_memory_limit" {
  description = "Memory limit for the Loki single-binary pod."
  type        = string
  default     = "512Mi"
}

variable "loki_write_endpoint" {
  description = "External Loki push URL. Empty targets the in-cluster Loki."
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
  description = "Memory limit per Alloy pod. A DaemonSet, so charged once per node."
  type        = string
  default     = "256Mi"
}

variable "log_namespaces" {
  description = "Namespaces to collect logs from. Empty collects everything, mostly adding kube-system noise."
  type        = list(string)
  default     = []
}

variable "drop_healthcheck_logs" {
  description = "Drop probe lines before shipping. Readiness probes dominate volume on an idle cluster."
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

variable "enable_error_alerts" {
  description = "Provision Grafana Discord contact point and service error rules after the webhook Kubernetes Secret has been created."
  type        = bool
  default     = false
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
  description = "PVC size for Grafana's SQLite database, holding UI-created dashboards and users."
  type        = string
  default     = "2Gi"
}

variable "grafana_hostname" {
  description = "Public Grafana hostname. Empty keeps Grafana private inside the cluster."
  type        = string
  default     = ""
}

variable "grafana_gateway_name" {
  description = "Name of the shared GKE Gateway Grafana attaches to."
  type        = string
  default     = ""
}

variable "grafana_gateway_namespace" {
  description = "Namespace containing the shared GKE Gateway."
  type        = string
  default     = ""
}

variable "grafana_security_policy_name" {
  description = "Global Cloud Armor policy attached to Grafana's Gateway backend."
  type        = string
  default     = ""

  validation {
    condition = (
      var.grafana_hostname == "" ||
      (
        var.grafana_gateway_name != "" &&
        var.grafana_gateway_namespace != "" &&
        var.grafana_security_policy_name != ""
      )
    )
    error_message = "Publishing Grafana requires gateway name, gateway namespace, and security policy name."
  }
}

variable "storage_class" {
  description = <<-EOT
    StorageClass for the Loki WAL and Grafana PVCs. GKE's built-in default is
    "standard-rwo", backed by pd-balanced — unlike EKS, no StorageClass has to be
    created first.
  EOT
  type        = string
  default     = "standard-rwo"
}
