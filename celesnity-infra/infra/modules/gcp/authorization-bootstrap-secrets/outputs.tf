output "bootstrap_secret_ids" {
  description = "Secret Manager IDs whose approved values must be supplied before Core deployment."
  value       = { for suffix, secret in google_secret_manager_secret.bootstrap : suffix => secret.secret_id }
}
