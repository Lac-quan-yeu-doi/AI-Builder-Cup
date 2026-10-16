output "tenant_id" {
  description = "Selected Identity Platform tenant ID; inject into Core and Web runtime configuration."
  value       = nonsensitive(local.selected_tenant_id)
}

output "project_id" {
  description = "Identity Platform project ID."
  value       = var.project_id
}

output "browser_api_key" {
  description = "Referrer-restricted Identity Platform browser API key; inject into Web IDENTITY_PLATFORM_API_KEY."
  value       = google_apikeys_key.browser.key_string
  sensitive   = true
}

output "browser_api_key_id" {
  description = "Managed API Keys API resource ID for rotation and audit operations."
  value       = google_apikeys_key.browser.id
}

output "tenant_id_secret_id" {
  description = "Secret Manager ID read by Core and Web deployment pipelines."
  value       = google_secret_manager_secret.tenant_id.secret_id
}

output "browser_api_key_secret_id" {
  description = "Secret Manager ID read by the Web deployment pipeline."
  value       = google_secret_manager_secret.browser_api_key.secret_id
}
