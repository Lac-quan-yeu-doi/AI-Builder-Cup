########################################
# Trino authentication and TLS material
#
# Three pieces are assembled here without committing or printing credentials:
#
#   shared-secret  internal-communication.shared-secret, required on the
#                  coordinator AND every worker once authentication is enabled.
#   password.db    htpasswd-format bcrypt hashes for the file authenticator.
#   tls.pem        certificate followed by private key, for the HTTPS listener.
#
# GDPR Art. 32(1)(a) and 32(1)(b): without this, the read-only access control
# restricted writes but left every row in the warehouse readable by anyone who
# could reach the coordinator.
#
# Authentication and TLS values are read ephemerally from Secret Manager and
# written to Kubernetes through write-only attributes, so credential payloads do
# not enter Terraform plans or state.
########################################

# One-time M1 migration: the login and internal shared secret now live in Secret
# Manager. Forget the old random resources without invoking destroy semantics.
removed {
  from = random_password.trino_user

  lifecycle {
    destroy = false
  }
}

removed {
  from = random_password.trino_shared_secret

  lifecycle {
    destroy = false
  }
}

########################################
# Secret Manager-backed credentials and TLS
#
# TLS is generated outside Terraform by scripts/trino/bootstrap-tls-secret-manager.sh.
# Terraform reads the explicitly pinned versions ephemerally, so private-key and
# certificate payloads do not enter Terraform state. Kubernetes write-only data
# keeps the synced Secret payloads out of state as well.
########################################

ephemeral "google_secret_manager_secret_version" "trino_tls" {
  project = var.project_id
  secret  = "${var.name}-trino-tls-pem"
  version = var.trino_tls_secret_version
}

ephemeral "google_secret_manager_secret_version" "trino_ca" {
  project = var.project_id
  secret  = "${var.name}-trino-ca-pem"
  version = var.trino_ca_secret_version
}

ephemeral "google_secret_manager_secret_version" "trino_user_password" {
  project = var.project_id
  secret  = "${var.name}-trino-user-password"
  version = var.trino_user_password_secret_version
}

ephemeral "google_secret_manager_secret_version" "trino_shared_secret" {
  project = var.project_id
  secret  = "${var.name}-trino-shared-secret"
  version = var.trino_shared_secret_version
}

resource "kubernetes_secret_v1" "trino_auth" {
  metadata {
    name      = "trino-auth"
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }

  data_wo = {
    "shared-secret" = ephemeral.google_secret_manager_secret_version.trino_shared_secret.secret_data

    # htpasswd format. Terraform's bcrypt() uses cost 10; Trino requires at least 8.
    #
    # bcrypt() uses a random salt. data_wo_revision is the explicit write gate, so
    # Terraform sends a new password file only during a deliberate Secret sync.
    "password.db" = "${var.trino_username}:${bcrypt(ephemeral.google_secret_manager_secret_version.trino_user_password.secret_data)}"

    # Certificate first, then key. Trino reads both from one PEM file.
    "tls.pem" = ephemeral.google_secret_manager_secret_version.trino_tls.secret_data
  }

  data_wo_revision = var.trino_kubernetes_secret_revision

  type = "Opaque"
}

########################################
# Client credentials
#
# A SECOND Secret, deliberately, rather than two more keys on trino-auth.
#
# trino-auth holds the coordinator's private key. celesnity-core needs the password
# and the certificate to *verify* the coordinator, and nothing else — so it reads a
# Secret that cannot leak the key even if the whole thing were mounted by mistake.
# Splitting them is what makes "core may read its Trino credentials" expressible as
# RBAC on one Secret name.
#
# Consumed by celesnity-core/k8s/base/{api,worker}.yaml, which projects ca.crt as a
# file for NODE_EXTRA_CA_CERTS and reads password as TRINO_PASSWORD. Renaming a key
# here breaks that repository, so keep the two in step.
########################################

resource "kubernetes_secret_v1" "trino_client" {
  metadata {
    name      = "trino-client"
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }

  data_wo = {
    # The plaintext password, which password.db only holds as a bcrypt hash. A hash
    # cannot be presented as a credential, so a client needs this. It is no wider an
    # exposure than it looks: Secret Manager is the source of truth and this
    # Kubernetes payload is written through a write-only provider attribute.
    "password" = ephemeral.google_secret_manager_secret_version.trino_user_password.secret_data

    # The certificate WITHOUT the private key, unlike tls.pem above.
    #
    # This is the whole reason for the separate Secret. A client trusting a
    # self-signed certificate needs the certificate; it must never receive the key
    # that goes with it, and tls.pem concatenates the two.
    "ca.crt" = ephemeral.google_secret_manager_secret_version.trino_ca.secret_data

    # The matching username, so a client has the full credential from one place
    # rather than pairing this password with a name from a ConfigMap.
    "username" = var.trino_username
  }

  data_wo_revision = var.trino_kubernetes_secret_revision

  type = "Opaque"
}
