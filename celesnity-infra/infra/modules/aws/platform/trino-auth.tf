########################################
# Trino authentication and TLS material
#
# Three pieces, all generated here so nothing is committed and nothing is typed by
# hand:
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
# All three land in Terraform state. Use the encrypted S3 backend commented in
# versions.tf rather than local state.
########################################

resource "random_password" "trino_shared_secret" {
  length = 64
  # Trino passes this in HTTP headers; keep it alphanumeric to avoid any encoding
  # question.
  special = false
}

resource "random_password" "trino_user" {
  length  = 32
  special = false
}

########################################
# Self-signed certificate
#
# Self-signed is honest for an internal-only listener reached by port-forward:
# there is no public DNS name to validate and no CA to trust it anyway, so clients
# connect with --insecure. It encrypts the transport, which is the Art. 32
# requirement, without pretending to provide identity verification.
#
# Replace with a real certificate (cert-manager, or Google-managed on a Load
# Balancer) when the coordinator gets a stable hostname and external users.
########################################

resource "tls_private_key" "trino" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "trino" {
  private_key_pem = tls_private_key.trino.private_key_pem

  subject {
    common_name  = "trino-coordinator.${var.namespace}.svc.cluster.local"
    organization = var.name
  }

  # Covers in-cluster service DNS and the localhost address a port-forward
  # presents, so the same certificate works for both access paths.
  dns_names = [
    "trino-coordinator",
    "trino-coordinator.${var.namespace}",
    "trino-coordinator.${var.namespace}.svc",
    "trino-coordinator.${var.namespace}.svc.cluster.local",
    "localhost",
  ]

  ip_addresses = ["127.0.0.1"]

  validity_period_hours = var.trino_cert_validity_hours

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]
}

resource "kubernetes_secret_v1" "trino_auth" {
  metadata {
    name      = "trino-auth"
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }

  data = {
    "shared-secret" = random_password.trino_shared_secret.result

    # htpasswd format. Terraform's bcrypt() uses cost 10; Trino requires at least 8.
    #
    # Note: bcrypt() produces a different hash on every run because the salt is
    # random, so this Secret would be replaced on every apply. keepers pins the
    # hash to the password, so it only changes when the password does.
    "password.db" = "${var.trino_username}:${bcrypt(random_password.trino_user.result)}"

    # Certificate first, then key. Trino reads both from one PEM file.
    "tls.pem" = "${tls_self_signed_cert.trino.cert_pem}${tls_private_key.trino.private_key_pem}"
  }

  type = "Opaque"

  lifecycle {
    # bcrypt() is not deterministic, so without this every plan shows a diff on
    # password.db and every apply restarts the coordinator.
    ignore_changes = [data["password.db"]]
  }
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
# Identical to the GCP module's copy on purpose: celesnity-core's k8s/base is
# cloud-neutral and references these key names on either cloud.
########################################

resource "kubernetes_secret_v1" "trino_client" {
  metadata {
    name      = "trino-client"
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }

  data = {
    # The plaintext password, which password.db only holds as a bcrypt hash. A hash
    # cannot be presented as a credential, so a client needs this. It is no wider an
    # exposure than it looks: the value is already in Terraform state and readable
    # with `terraform output -raw trino_password`.
    "password" = random_password.trino_user.result

    # The certificate WITHOUT the private key, unlike tls.pem above.
    #
    # This is the whole reason for the separate Secret. A client trusting a
    # self-signed certificate needs the certificate; it must never receive the key
    # that goes with it, and tls.pem concatenates the two.
    "ca.crt" = tls_self_signed_cert.trino.cert_pem

    # The matching username, so a client has the full credential from one place
    # rather than pairing this password with a name from a ConfigMap.
    "username" = var.trino_username
  }

  type = "Opaque"
}
