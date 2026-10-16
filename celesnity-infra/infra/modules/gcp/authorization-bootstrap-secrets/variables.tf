variable "project_id" {
  description = "Project containing the environment's Identity Platform tenant and bootstrap secrets."
  type        = string
}

variable "environment" {
  description = "Environment prefix, for example gcp-dev or gcp-prod."
  type        = string
}

variable "region" {
  description = "Region in which bootstrap identifiers, including owner email, are replicated."
  type        = string
}

variable "tenant_id_secret_id" {
  description = "Existing Identity Platform tenant ID Secret Manager secret ID."
  type        = string
}

variable "core_build_service_account_email" {
  description = "Service account used by the Core release Cloud Build trigger."
  type        = string
}
