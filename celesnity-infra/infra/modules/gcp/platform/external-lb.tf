########################################
# External Application Load Balancer for the Trino coordinator
#
# This publishes an SQL engine on the public internet. Three controls make that
# defensible, and removing any one of them undoes the others:
#
#   1. Password authentication  already required by trino-auth.tf.
#   2. HTTPS only               the Ingress sets allow-http: "false", so there is
#                               no plaintext listener. Without this the bcrypt
#                               password crosses the internet in cleartext, which
#                               is far worse than the weak certificate below.
#   3. Cloud Armor              GKE Ingress has no equivalent of the ALB
#                               inbound-cidrs annotation, so source restriction
#                               has to go through a security policy.
#
# The Kubernetes side lives in deploy/overlays/gcp-dev/trino/. Terraform owns the
# address, the certificate, and the policy; the Ingress references all three by
# name, so the two halves must be enabled together.
########################################

locals {
  # Two mutually exclusive ways to give the load balancer a certificate.
  #
  # A Certificate Manager certificate is attached through a certificate MAP and the
  # networking.gke.io/certmap annotation. A Kubernetes Secret is attached through
  # the listener's certificateRefs. Setting both makes the Gateway controller
  # build an invalid certificateMap reference and it never programs, so the
  # self-signed fallback is switched off whenever a real certificate is named.
  use_cert_map    = var.enable_external_lb && var.lb_certificate_name != ""
  use_self_signed = var.enable_external_lb && var.lb_certificate_name == ""
}

########################################
# Reserved address
#
# Reserved rather than ephemeral for two reasons. An ephemeral address changes
# whenever the forwarding rule is recreated, which would invalidate the
# certificate below. And the address has to be known *before* the certificate is
# issued, since it is the only subject name a client can verify against when
# there is no domain. Reserving it first breaks that circular dependency.
########################################

resource "google_compute_global_address" "trino_lb" {
  count = var.enable_external_lb ? 1 : 0

  name         = "${var.name}-trino-lb"
  description  = "Frontend address for the Trino coordinator external ALB."
  address_type = "EXTERNAL"
  ip_version   = "IPV4"
}

########################################
# Frontend certificate
#
# Separate from the coordinator's own certificate in trino-auth.tf. That one is
# presented to in-cluster clients and port-forwards; this one is presented by the
# load balancer to external clients. They cover different names and are rotated
# independently.
#
# Still self-signed, because a Google-managed certificate requires a domain you
# control and DNS validation, which cannot be satisfied by a bare IP. Clients
# must therefore pass --insecure, so the transport is encrypted but the server is
# not authenticated: a client cannot detect a machine-in-the-middle.
#
# Set lb_hostname once you own a domain, then switch to a Google-managed
# certificate and drop --insecure. That is the one change that turns this from
# "encrypted" into "trustworthy".
########################################

resource "tls_private_key" "trino_lb" {
  count = local.use_self_signed ? 1 : 0

  # RSA 2048 deliberately, and not larger. Google Cloud bills self-managed
  # certificates at $0.45 per million load balancer connections when the key is
  # RSA-3072 or RSA-4096, and nothing at all for RSA-2048, ECDSA P-256, or
  # ECDSA P-384. Raising this to 4096 would look like hardening and would instead
  # just add a per-connection charge.
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "trino_lb" {
  count = local.use_self_signed ? 1 : 0

  private_key_pem = tls_private_key.trino_lb[0].private_key_pem

  subject {
    common_name  = var.lb_hostname != "" ? var.lb_hostname : google_compute_global_address.trino_lb[0].address
    organization = var.name
  }

  dns_names = var.lb_hostname != "" ? [var.lb_hostname] : []

  # The reserved address, so a client that pins the IP has something to verify.
  ip_addresses = [google_compute_global_address.trino_lb[0].address]

  validity_period_hours = var.trino_cert_validity_hours

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]
}

# Consumed by the Ingress through spec.tls.secretName. Must be type
# kubernetes.io/tls with tls.crt and tls.key; the GKE Ingress controller copies it
# into a Compute Engine SSL certificate.
resource "kubernetes_secret_v1" "trino_lb_tls" {
  count = local.use_self_signed ? 1 : 0

  metadata {
    name      = "trino-lb-tls"
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }

  type = "kubernetes.io/tls"

  data = {
    "tls.crt" = tls_self_signed_cert.trino_lb[0].cert_pem
    "tls.key" = tls_private_key.trino_lb[0].private_key_pem
  }
}

########################################
# Cloud Armor
#
# Created whenever the load balancer is, so the BackendConfig can reference a
# stable policy name. A BackendConfig pointing at a policy that does not exist
# makes the Ingress controller fail to sync the backend service, which surfaces as
# a permanently unhealthy backend rather than a clear error.
#
# Behaviour follows lb_allowed_source_ranges:
#   empty      one allow-all rule. The load balancer is open to the internet and
#              the Trino password is the only thing standing in front of the
#              warehouse. Valid for a short-lived demo, not much else.
#   non-empty  default deny, plus allow rules for the listed ranges.
########################################

resource "google_compute_security_policy" "trino_lb" {
  count = var.enable_external_lb ? 1 : 0

  name        = "${var.name}-trino-lb"
  description = "Source restriction for the Trino coordinator external ALB."

  # Cloud Armor requires a rule at this exact priority; it is the fallthrough and
  # cannot be deleted, only redefined. Flipping it to deny is what makes the
  # allow rules below meaningful.
  rule {
    action      = length(var.lb_allowed_source_ranges) > 0 ? "deny(403)" : "allow"
    priority    = 2147483647
    description = length(var.lb_allowed_source_ranges) > 0 ? "Default deny" : "Default allow - NO SOURCE RESTRICTION"

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }

  # Cloud Armor caps src_ip_ranges at 10 per rule, so the list is chunked rather
  # than failing at apply time on the eleventh entry.
  dynamic "rule" {
    for_each = chunklist(var.lb_allowed_source_ranges, 10)

    content {
      action      = "allow"
      priority    = 1000 + rule.key
      description = "Allowed source ranges ${rule.key * 10 + 1}-${rule.key * 10 + length(rule.value)}"

      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = rule.value
        }
      }
    }
  }
}

resource "google_compute_security_policy" "web" {
  count       = var.enable_external_lb ? 1 : 0
  name        = "${var.name}-web"
  description = "Public Web edge policy with bounded message-block stream openings."

  rule {
    action      = "throttle"
    priority    = 1000
    description = "Message-block stream openings: 300 per minute per source IP"
    match {
      expr {
        expression = "request.method == 'GET' && request.path.urlDecode().lower().startsWith('/api/core/rooms/') && request.path.urlDecode().lower().endsWith('/message-blocks/stream')"
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 300
        interval_sec = 60
      }
    }
  }

  rule {
    action      = "allow"
    priority    = 2147483647
    description = "Default allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}

########################################
# Certificate map
#
# A Certificate Manager certificate cannot be referenced by a Gateway directly.
# It is exposed through a certificate map, whose entries pick a certificate by SNI
# hostname, and the Gateway names the map in a networking.gke.io/certmap annotation.
#
# Terraform owns the map but NOT the certificate. The certificate and its DNS
# authorizations validate against records in a DNS zone this repo does not manage
# (Cloudflare), and issuance is slow and easy to fail: Certificate Manager checks
# for the _acme-challenge records within seconds of the certificate being created,
# and a single early failure puts it into a long retry backoff. Recreating it on
# every terraform apply would be a liability, so it is referenced by name.
#
# Create the certificate once, out of band, and leave the _acme-challenge CNAMEs in
# place afterwards — Google-managed certificates re-validate on renewal, so
# deleting those records breaks the renewal rather than the current certificate,
# which fails silently months later.
########################################

resource "google_certificate_manager_certificate_map" "trino_lb" {
  count = local.use_cert_map ? 1 : 0

  name        = "${var.name}-trino-lb"
  description = "Certificates served by the Trino Gateway, selected by SNI."
}

resource "google_certificate_manager_certificate_map_entry" "trino_lb" {
  count = local.use_cert_map ? 1 : 0

  name        = "${var.name}-${replace(var.lb_hostname, ".", "-")}"
  map         = google_certificate_manager_certificate_map.trino_lb[0].name
  description = "Serve ${var.lb_hostname} from the ${var.lb_certificate_name} certificate."

  # Matched on SNI. A client connecting by bare IP sends no SNI and matches no
  # entry, so it gets a TLS failure rather than a certificate — expected once the
  # load balancer is addressed by name. Add a matcher = "PRIMARY" entry if you want
  # a catch-all default instead.
  hostname = var.lb_hostname

  # Referenced by full resource name. The certificate lives in the same project and
  # must be global, matching the global GatewayClass.
  certificates = [
    "projects/${var.project_id}/locations/global/certificates/${var.lb_certificate_name}",
  ]
}

# Further hostnames sharing the one Gateway, one address, and one certificate.
#
# The Gateway admits an HTTPRoute for any hostname, but TLS is selected by SNI
# against the certificate map. A hostname with a route and no entry here fails the
# handshake before routing ever runs, which reads as a broken load balancer rather
# than as missing configuration — so every hostname any HTTPRoute claims needs to be
# covered by an entry.
#
# Wildcards are accepted, and are the reason this is a list of one in practice:
# "*.celesnity.com" covers every current and future subdomain, so adding a service
# needs an HTTPRoute and nothing here. Certificate Manager matches an exact hostname
# entry first and falls back to a wildcard entry, so the specific entry for
# lb_hostname above still wins for trino-dev.
#
# Each name must be covered by lb_certificate_name. Certificate Manager accepts an
# entry for a name the certificate does not cover and then serves a certificate the
# client rejects, so that is validated in variables.tf rather than left to fail at
# request time.
resource "google_certificate_manager_certificate_map_entry" "additional" {
  for_each = local.use_cert_map ? toset(var.lb_additional_hostnames) : toset([])

  # "*" is legal in a hostname matcher but not in a resource name, which has to be
  # lowercase alphanumerics and hyphens. Left in, apply fails on the API's name
  # validation rather than on anything that hints at the wildcard being the cause,
  # so "*.celesnity.com" becomes "wildcard-celesnity-com".
  name        = "${var.name}-${replace(replace(each.value, "*", "wildcard"), ".", "-")}"
  map         = google_certificate_manager_certificate_map.trino_lb[0].name
  description = "Serve ${each.value} from the ${var.lb_certificate_name} certificate."

  hostname = each.value

  certificates = [
    "projects/${var.project_id}/locations/global/certificates/${var.lb_certificate_name}",
  ]
}
