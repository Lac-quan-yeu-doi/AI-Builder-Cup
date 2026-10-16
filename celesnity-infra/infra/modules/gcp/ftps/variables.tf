variable "name" {
  description = "Name prefix for FTPS resources."
  type        = string
}

variable "project_id" {
  description = "GCP project hosting the FTPS runtime."
  type        = string
}

variable "region" {
  description = "GCP region used for the ingress bucket."
  type        = string
}

variable "network" {
  description = "VPC self-link used by the external TCP proxy firewall rule."
  type        = string
}

variable "cluster_zones" {
  description = "Zones in which GKE creates standalone FTPS NEGs."
  type        = list(string)
}

variable "cluster_dependencies" {
  description = "Opaque values used to sequence Kubernetes resources after GKE is ready."
  type        = list(string)
  default     = []
}

variable "workload_identity_pool" {
  description = "GKE Workload Identity pool, for example PROJECT_ID.svc.id.goog."
  type        = string
}

variable "workload_namespace" {
  description = "Existing Core namespace. SFTPGo must run here so Core resolves http://sftpgo:8080."
  type        = string
}

variable "shared_global_ip_id" {
  description = "Identifier of the existing global address reserved by the MQTT classic proxy load balancer."
  type        = string
}

variable "hostname" {
  description = "Bare public DNS hostname that SFTPGo advertises for passive FTPS connections."
  type        = string

  validation {
    condition     = can(regex("^[a-zA-Z0-9][a-zA-Z0-9.-]*$", var.hostname)) && !strcontains(var.hostname, "..")
    error_message = "hostname must be a bare DNS name or IP address without a scheme, port, path, or consecutive dots."
  }
}

variable "ingress_bucket_name" {
  description = "Optional globally unique GCS ingress bucket name. Empty derives one from name and project_id."
  type        = string
  default     = ""
}

variable "bucket_location" {
  description = "Optional bucket location override. Empty uses region."
  type        = string
  default     = ""
}

variable "tenant_prefix" {
  description = "Tenant-scoped GCS object prefix used by the demo FTPS virtual folder."
  type        = string

  validation {
    condition     = can(regex("^tnt_[a-z0-9]{12,48}$", var.tenant_prefix))
    error_message = "tenant_prefix must match tnt_[a-z0-9]{12,48}."
  }
}

variable "sftpgo_image" {
  description = "Pinned SFTPGo image used by the GKE Deployment."
  type        = string
  default     = "drakkan/sftpgo:v2.7.5"
}

variable "sqlite_storage_size" {
  description = "Small ReadWriteOnce PVC size for the single SFTPGo SQLite state database."
  type        = string
  default     = "5Gi"
}

variable "sqlite_storage_class" {
  description = "Optional StorageClass for the SFTPGo SQLite PVC. Empty uses GKE's default StorageClass."
  type        = string
  default     = ""
}

variable "force_destroy_bucket" {
  description = "Permit Terraform destroy to remove a non-empty FTPS ingress bucket. Development only."
  type        = bool
}

variable "bootstrap_revision" {
  description = "Increment to rerun the idempotent bootstrap Job after intentionally rotating FTPS credentials."
  type        = string
  default     = "v1"
}

variable "demo_password_secret_name" {
  description = "Secret Manager secret containing the external FTPS demo-user password."
  type        = string
}

variable "demo_password_secret_version" {
  description = "Pinned Secret Manager version for the external FTPS demo-user password."
  type        = string
}

variable "status_password_secret_name" {
  description = "Secret Manager secret containing the private SFTPGo status-reader password."
  type        = string
}

variable "status_password_secret_version" {
  description = "Pinned Secret Manager version for the private SFTPGo status-reader password."
  type        = string
}

variable "kubernetes_secret_revision" {
  description = "Monotonic write revision used to sync pinned FTPS credentials into Kubernetes."
  type        = number
}
