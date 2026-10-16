variable "project_id" {
  description = "Project hosting Identity Platform."
  type        = string
}

variable "secret_prefix" {
  description = "Environment prefix for deploy-time Identity Platform configuration secrets."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.secret_prefix))
    error_message = "secret_prefix must be 3-31 lowercase letters, digits, or hyphens and start with a letter."
  }
}

variable "tenant_id_source_version" {
  description = "Optional immutable version of the tenant ID secret to retain an existing tenant instead of switching application authentication to the Terraform-created tenant."
  type        = string
  default     = null

  validation {
    condition     = var.tenant_id_source_version == null || can(regex("^[1-9][0-9]*$", var.tenant_id_source_version))
    error_message = "tenant_id_source_version must be a positive Secret Manager version number."
  }
}

variable "tenant_display_name" {
  description = "Customer identity tenant display name."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9-]{3,19}$", var.tenant_display_name))
    error_message = "tenant_display_name must be 4-20 letters, digits, or hyphens and start with a letter."
  }
}

variable "authorized_domains" {
  description = "Exact browser domains allowed for Identity Platform redirects."
  type        = list(string)
  validation {
    condition     = length(var.authorized_domains) > 0 && alltrue([for domain in var.authorized_domains : !can(regex("^https?://", domain))])
    error_message = "authorized_domains must contain hostnames without a URL scheme."
  }
}

variable "browser_api_key_name" {
  description = "Stable API Keys API resource name for the browser Identity Platform key."
  type        = string
}

variable "browser_allowed_referrers" {
  description = "Exact browser referrer patterns allowed to call Identity Toolkit with this key."
  type        = list(string)

  validation {
    condition     = length(var.browser_allowed_referrers) > 0 && alltrue([for referrer in var.browser_allowed_referrers : can(regex("^https?://", referrer))])
    error_message = "browser_allowed_referrers must contain at least one HTTP or HTTPS referrer pattern."
  }
}
