variable "name" { type = string }
variable "project_id" { type = string }
variable "cluster_name" { type = string }
variable "cluster_location" { type = string }
variable "cluster_zones" {
  description = "Zones containing GKE nodes. A regional cluster exposes one MQTT NEG in each of these zones."
  type        = list(string)
}
variable "region" { type = string }
variable "network" {
  description = "VPC network self-link used by the MQTT proxy load balancer firewall rule."
  type        = string
}
variable "node_service_account_email" { type = string }
variable "cluster_dependencies" { type = list(string) }
variable "workload_namespace" { type = string }

variable "namespace" {
  type    = string
  default = "celesnity-streaming"
}
variable "redpanda_chart_version" {
  type    = string
  default = "26.1.10"
}
variable "redpanda_image_tag" {
  type    = string
  default = "v26.1.14"
}
variable "broker_replicas" {
  type    = number
  default = 1
}
variable "broker_storage_size" {
  type    = string
  default = "50Gi"
}
variable "node_machine_type" {
  type    = string
  default = "n2-standard-4"
}
variable "node_count" {
  description = "Streaming nodes per zone. Set to one for a three-zone regional cluster with three Redpanda and three EMQX replicas."
  type        = number
  default     = 1
}
variable "node_disk_size_gb" {
  type    = number
  default = 100
}
variable "node_disk_type" {
  description = "Boot disk type for dedicated streaming nodes."
  type        = string
  default     = "pd-balanced"
}
variable "node_oauth_scopes" {
  description = "OAuth scopes retained on dedicated streaming nodes. Keep development imports aligned with the live pool; new production pools should normally use cloud-platform only."
  type        = list(string)
  default     = ["https://www.googleapis.com/auth/cloud-platform"]
}
variable "node_enable_secure_boot" {
  description = "Enable Shielded VM Secure Boot for dedicated streaming nodes. Changing this on an existing pool requires replacement."
  type        = bool
  default     = true
}
variable "broker_data_disk_type" {
  description = "Optional CSI persistent-disk type for broker PVCs. Empty keeps the cluster default StorageClass."
  type        = string
  default     = ""
}

variable "mqtt_broker_replicas" {
  description = "EMQX brokers. Development uses one; production should use three across zones."
  type        = number
  default     = 1
}
variable "mqtt_broker_storage_size" {
  type    = string
  default = "20Gi"
}
variable "mqtt_hostname" {
  description = "Public DNS name issued to MQTT publishers. Point it at mqtt_load_balancer_ip."
  type        = string
}
variable "mqtt_certificate_name" {
  description = "Existing global Certificate Manager certificate covering mqtt_hostname."
  type        = string
  default     = "celesnity"
}
variable "mqtt_dns_managed_zone" {
  description = "Optional Cloud DNS managed-zone name. Empty leaves DNS creation to the operator."
  type        = string
  default     = ""
}
variable "emqx_chart_version" {
  type    = string
  default = "5.8.9"
}

variable "redpanda_tls_enabled" {
  description = "Encrypt internal Redpanda client and inter-broker traffic and distribute the generated CA to platform clients."
  type        = bool
  default     = false
}

variable "redpanda_rack_awareness_enabled" {
  description = "Use the Kubernetes zone label as the Redpanda rack ID so replicas are placed across failure domains."
  type        = bool
  default     = false
}

variable "cert_manager_chart_version" {
  description = "Pinned cert-manager Helm chart used to issue Redpanda's private in-cluster certificates."
  type        = string
  default     = "v1.21.1"
}
