resource "google_project_service" "identitytoolkit" {
  project = var.project_id
  service = "identitytoolkit.googleapis.com"

  disable_on_destroy = false
}

resource "google_project_service" "apikeys" {
  project = var.project_id
  service = "apikeys.googleapis.com"

  disable_on_destroy = false
}

resource "google_project_service" "secretmanager" {
  project = var.project_id
  service = "secretmanager.googleapis.com"

  disable_on_destroy = false
}

resource "google_identity_platform_config" "this" {
  project = var.project_id

  autodelete_anonymous_users = true
  authorized_domains         = var.authorized_domains

  sign_in {
    allow_duplicate_emails = false
    anonymous {
      enabled = false
    }
    email {
      enabled           = true
      password_required = true
    }
    phone_number {
      enabled = false
    }
  }

  mfa {
    state = "MANDATORY"
    provider_configs {
      state = "ENABLED"
      totp_provider_config {
        adjacent_intervals = 1
      }
    }
  }

  multi_tenant {
    allow_tenants = true
  }
  monitoring {
    request_logging {
      enabled = true
    }
  }

  depends_on = [google_project_service.identitytoolkit]
}

resource "google_identity_platform_tenant" "celesnity" {
  project               = var.project_id
  display_name          = var.tenant_display_name
  allow_password_signup = true
  disable_auth          = false
  client {
    permissions {
      disabled_user_signup   = true
      disabled_user_deletion = true
    }
  }
  depends_on = [google_identity_platform_config.this]
}

resource "google_apikeys_key" "browser" {
  project      = var.project_id
  name         = var.browser_api_key_name
  display_name = "${var.tenant_display_name} browser"

  restrictions {
    browser_key_restrictions {
      allowed_referrers = var.browser_allowed_referrers
    }

    api_targets {
      service = "identitytoolkit.googleapis.com"
    }
  }

  deletion_policy = "ABANDON"
  depends_on      = [google_project_service.apikeys, google_project_service.identitytoolkit]
}

# Application repositories retain fail-closed placeholders. Environment values
# are delivered only at deploy time, so one immutable application commit can be
# configured independently for development and production and API-key rotation
# does not require committing browser configuration to source control.
resource "google_secret_manager_secret" "tenant_id" {
  project   = var.project_id
  secret_id = "${var.secret_prefix}-identity-platform-tenant-id"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager]
}

# A pinned existing version is the reviewed source for a tenant already bound
# to application organizations. Reading an immutable version avoids a later
# Terraform apply silently reverting Web/Core to a newly generated tenant.
data "google_secret_manager_secret_version" "selected_tenant" {
  count   = var.tenant_id_source_version == null ? 0 : 1
  secret  = google_secret_manager_secret.tenant_id.id
  version = var.tenant_id_source_version
}

locals {
  selected_tenant_id = var.tenant_id_source_version == null ? google_identity_platform_tenant.celesnity.name : data.google_secret_manager_secret_version.selected_tenant[0].secret_data
}

resource "google_secret_manager_secret_version" "tenant_id" {
  secret      = google_secret_manager_secret.tenant_id.id
  secret_data = local.selected_tenant_id
}

resource "google_secret_manager_secret" "browser_api_key" {
  project   = var.project_id
  secret_id = "${var.secret_prefix}-identity-platform-browser-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "browser_api_key" {
  secret      = google_secret_manager_secret.browser_api_key.id
  secret_data = google_apikeys_key.browser.key_string
}
