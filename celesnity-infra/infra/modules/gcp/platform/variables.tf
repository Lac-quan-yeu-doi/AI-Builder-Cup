variable "name" {
  description = "Name prefix for Google service accounts created here."
  type        = string
}

variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "GCP region, exposed to workloads for the GCS client."
  type        = string
}

variable "enable_firmware_kms" {
  description = "Create the production Cloud KMS Ed25519 firmware signing key and grant Core signer access."
  type        = bool
  default     = false
}

variable "namespace" {
  description = "Namespace the Trino and Spark workloads run in."
  type        = string
  default     = "celesnity"
}

variable "service_account_name" {
  description = "Dedicated Google service account used only to issue Core's GCS HMAC key. It is not mounted into Kubernetes."
  type        = string
  default     = "celesnity-core-storage"
}

variable "agent_namespace" {
  description = "Namespace containing the Celesnity agent workload. It is intentionally not gateway-enabled."
  type        = string
  default     = "minder"
}

variable "agent_service_account_name" {
  description = "Kubernetes ServiceAccount used by the Celesnity agent."
  type        = string
  default     = "celesnity-agent"
}

variable "workload_identity_pool" {
  description = "Workload Identity pool from the cluster module, \"PROJECT_ID.svc.id.goog\"."
  type        = string
}

variable "cluster_dependencies" {
  description = "Opaque values to sequence against. Pass the cluster module's cluster_ready."
  type        = list(string)
  default     = []
}

########################################
# Data plane wiring
########################################

variable "db_host" {
  description = "Cloud SQL private IP."
  type        = string
}

variable "db_port" {
  description = "PostgreSQL port."
  type        = number
  default     = 5432
}

variable "db_name" {
  description = "Database name."
  type        = string
}

variable "db_username" {
  description = "Database username."
  type        = string
}

variable "db_password" {
  description = "Database password. Lands in Terraform state; use an encrypted backend."
  type        = string
  sensitive   = true
}

variable "db_server_ca_cert" {
  description = "PEM-encoded Cloud SQL server CA certificate."
  type        = string
}

variable "warehouse_bucket" {
  description = "Iceberg warehouse bucket name."
  type        = string
}

variable "artifacts_bucket" {
  description = "Artifacts bucket name."
  type        = string
}

########################################
# Catalog bootstrap
########################################

variable "catalog_bootstrap_sql" {
  description = <<-EOT
    Contents of the Iceberg catalog DDL, passed in so the module stays independent
    of repository layout. The caller reads config/sql/01-iceberg-catalog.sql, the
    same file the local Compose stack applies through docker-entrypoint-initdb.d.
  EOT
  type        = string
}

variable "default_storage_class" {
  description = <<-EOT
    Create a pd-balanced StorageClass and mark it default.

    Unlike EKS, GKE already ships a default StorageClass ("standard-rwo"), so this
    is off by default. Enable it only if you want to override GKE's choice.
  EOT
  type        = bool
  default     = false
}

########################################
# Trino authentication (GDPR Art. 32)
########################################

variable "trino_username" {
  description = "Trino user created in the password file. Clients authenticate as this."
  type        = string
  default     = "celesnity"
}

variable "trino_cert_validity_hours" {
  description = <<-EOT
    Lifetime of the self-signed external load-balancer fallback certificate.
    The internal Trino certificate is versioned separately in Secret Manager.

    Expiry is silent: clients using --insecure skip validation, so an expired
    certificate keeps working for them while anything that does validate starts
    failing. Rotate the fallback by replacing tls_self_signed_cert.trino_lb.
  EOT
  type        = number
  default     = 8760
}

variable "trino_tls_secret_version" {
  description = "Pinned Secret Manager version containing the Trino certificate followed by its private key."
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.trino_tls_secret_version))
    error_message = "trino_tls_secret_version must be an explicit numeric version, not latest or an alias."
  }
}

variable "trino_ca_secret_version" {
  description = "Pinned Secret Manager version containing the Trino client CA certificate."
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.trino_ca_secret_version))
    error_message = "trino_ca_secret_version must be an explicit numeric version, not latest or an alias."
  }
}

variable "trino_user_password_secret_version" {
  description = "Pinned Secret Manager version containing the Trino client password."
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.trino_user_password_secret_version))
    error_message = "trino_user_password_secret_version must be an explicit numeric version."
  }
}

variable "trino_shared_secret_version" {
  description = "Pinned Secret Manager version containing Trino's internal communication shared secret."
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.trino_shared_secret_version))
    error_message = "trino_shared_secret_version must be an explicit numeric version."
  }
}

variable "trino_kubernetes_secret_revision" {
  description = "Increment after changing either pinned Secret Manager version to resync Kubernetes write-only Secret data."
  type        = number

  validation {
    condition     = var.trino_kubernetes_secret_revision >= 1 && floor(var.trino_kubernetes_secret_revision) == var.trino_kubernetes_secret_revision
    error_message = "trino_kubernetes_secret_revision must be a positive integer."
  }
}

########################################
# External load balancer
########################################

variable "enable_external_lb" {
  description = <<-EOT
    Publish the Trino coordinator through an external Application Load Balancer.

    This puts an SQL engine on the public internet. Password authentication and
    HTTPS-only are enforced regardless, but read the note on
    lb_allowed_source_ranges before enabling it.

    Must be kept in step with the Ingress in deploy/overlays/gcp-dev: this creates
    the address, certificate, and Cloud Armor policy that the Ingress references
    by name. Enabling one without the other leaves a broken load balancer.
  EOT
  type        = bool
  default     = false
}

variable "lb_allowed_source_ranges" {
  description = <<-EOT
    CIDR ranges permitted to reach the load balancer, enforced by Cloud Armor.

    Leaving this empty means the default rule ALLOWS ALL, so anyone on the
    internet can reach the Trino login. The password is then the only control.
    Set it to your office or VPN egress ranges.

    Find your current address with:  curl -s https://ifconfig.me
    then use "<address>/32".

    GKE Ingress has no inbound-cidrs annotation, which is why this is a Cloud
    Armor policy rather than a load balancer setting. Cloud Armor bills per policy
    and per rule.
  EOT
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for cidr in var.lb_allowed_source_ranges : can(cidrhost(cidr, 0))
    ])
    error_message = "Each entry must be a valid CIDR, for example 203.0.113.4/32."
  }
}

variable "lb_hostname" {
  description = <<-EOT
    Optional DNS name for the load balancer, added to the certificate's subject
    alternative names.

    Leave empty to issue the certificate against the reserved IP address only.
    Once you own a domain, set this, point an A record at the reserved address,
    and move to a Google-managed certificate so clients no longer need --insecure.
  EOT
  type        = string
  default     = ""
}

variable "lb_certificate_name" {
  description = <<-EOT
    Name of an EXISTING Certificate Manager certificate to serve on the load
    balancer, for example "celesnity". Must be global, in the same project.

    When set, Terraform builds a certificate map around it and the Gateway attaches
    the map through networking.gke.io/certmap. The self-signed fallback is not
    created, and clients no longer need --insecure.

    When empty, a self-signed certificate is generated and served from a Kubernetes
    Secret instead. That encrypts the transport but cannot be verified.

    Deliberately NOT created by Terraform. Issuance depends on _acme-challenge
    records in a DNS zone this repo does not manage, and Certificate Manager
    validates within seconds of creation then backs off for hours on failure, so
    recreating it on apply would be a liability. Create it once by hand and set
    lb_hostname to a name it covers.
  EOT
  type        = string
  default     = ""

  # A certificate map entry selects a certificate by SNI hostname, so without a
  # hostname the entry is meaningless. Caught here rather than as an API error
  # partway through an apply.
  validation {
    condition     = var.lb_certificate_name == "" || var.lb_hostname != ""
    error_message = "lb_hostname must be set when lb_certificate_name is used; the certificate map entry matches on it."
  }
}

variable "lb_additional_hostnames" {
  description = <<-EOT
    Extra hostnames served by the same Gateway, address, and certificate as
    lb_hostname. One certificate map entry is created per name.

    Every hostname an HTTPRoute claims needs to be covered, including routes owned by
    other repositories: celesnity-core and celesnity-web attach their own routes to
    this Gateway from k8s/overlays/gcp-dev. Without a matching entry the handshake
    fails on SNI before routing runs, which looks like a broken load balancer rather
    than missing configuration.

    Wildcard matchers such as "*.celesnity.com" are accepted and are the intended
    form when the certificate is a wildcard: one entry then covers every subdomain,
    and adding a service needs an HTTPRoute and no change here. An exact hostname
    entry is matched before a wildcard, so the entry for lb_hostname still wins.

    Note that "*.celesnity.com" does NOT cover the apex "celesnity.com"; that needs
    its own entry and its own name on the certificate.

    Each name must be covered by lb_certificate_name; Certificate Manager will
    happily serve a certificate the client then rejects.
  EOT
  type        = list(string)
  default     = []

  validation {
    condition     = !contains(var.lb_additional_hostnames, var.lb_hostname)
    error_message = "lb_hostname already has an entry; do not repeat it in lb_additional_hostnames."
  }

  validation {
    condition     = length(var.lb_additional_hostnames) == length(distinct(var.lb_additional_hostnames))
    error_message = "lb_additional_hostnames must not contain duplicates; entry names are derived from the hostname."
  }

  # Entry names are derived from the hostname, and only "*" is translated. Any other
  # character outside the resource-name charset fails at apply time with a message
  # about the name rather than about the hostname that produced it.
  validation {
    condition = alltrue([
      for host in var.lb_additional_hostnames :
      can(regex("^(\\*\\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", host))
    ])
    error_message = "Each entry must be a lowercase DNS name, optionally prefixed with '*.' — for example dev.celesnity.com or *.celesnity.com."
  }
}
