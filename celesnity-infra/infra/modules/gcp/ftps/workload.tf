########################################
# SFTPGo runtime
#
# The Deployment intentionally remains one replica: SQLite on a ReadWriteOnce
# PVC is durable for one Pod restart but is not a shared data provider.
########################################

locals {
  ftps_control_port       = 2121
  ftps_passive_port_start = 50000
  # The first prototype needs only three concurrent passive data ports. Each
  # public FTPS port consumes its own global forwarding rule and Target TCP
  # Proxy, so keep the initial footprint deliberately small.
  ftps_passive_port_end = 50002
  ftps_port_map = {
    for port in concat(
      [local.ftps_control_port],
      range(local.ftps_passive_port_start, local.ftps_passive_port_end + 1),
    ) : tostring(port) => port
  }
  ftps_neg_names = {
    for key, port in local.ftps_port_map : key => "${var.name}-sftpgo-ftps-${port}"
  }
  gfe_proxy_source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  sftpgo_labels = {
    "app.kubernetes.io/name"      = "sftpgo"
    "app.kubernetes.io/part-of"   = "celesnity"
    "app.kubernetes.io/component" = "ftps"
  }
}

# These values remain private to the SFTPGo runtime. Terraform stores generated
# Secret values in its encrypted remote state, so do not expose module outputs
# for this object or print it in CI logs.
resource "random_password" "bootstrap_admin" {
  length  = 48
  special = false
}

resource "random_password" "kms_master_key" {
  length  = 64
  special = false
}

resource "kubernetes_secret_v1" "runtime" {
  metadata {
    name      = "sftpgo-runtime"
    namespace = var.workload_namespace
  }

  data = {
    FTPS_BOOTSTRAP_ADMIN_USERNAME = "ftps-bootstrap-admin"
    FTPS_BOOTSTRAP_ADMIN_PASSWORD = random_password.bootstrap_admin.result
    FTPS_SFTPGO_MASTER_KEY        = random_password.kms_master_key.result
  }

  type = "Opaque"

  depends_on = [terraform_data.cluster_ready]
}

# A self-signed certificate is acceptable only for the initial development
# endpoint. A client must explicitly trust it. Replace this with a DNS-validated
# public certificate before a production partner integration.
resource "tls_private_key" "ftps" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "ftps" {
  private_key_pem = tls_private_key.ftps.private_key_pem

  subject {
    common_name  = var.hostname
    organization = var.name
  }

  dns_names             = [var.hostname]
  validity_period_hours = 8760
  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]
}

resource "kubernetes_secret_v1" "tls" {
  metadata {
    name      = "sftpgo-ftps-tls"
    namespace = var.workload_namespace
  }

  type = "kubernetes.io/tls"

  data = {
    "tls.crt" = tls_self_signed_cert.ftps.cert_pem
    "tls.key" = tls_private_key.ftps.private_key_pem
  }

  depends_on = [terraform_data.cluster_ready]
}

resource "kubernetes_persistent_volume_claim_v1" "state" {
  metadata {
    name      = "sftpgo-state"
    namespace = var.workload_namespace
  }

  spec {
    access_modes       = ["ReadWriteOnce"]
    storage_class_name = var.sqlite_storage_class != "" ? var.sqlite_storage_class : null

    resources {
      requests = {
        storage = var.sqlite_storage_size
      }
    }
  }

  # GKE's default standard-rwo class uses WaitForFirstConsumer. The Deployment
  # below is the first consumer, so waiting for Bound here would deadlock the
  # Terraform graph because the Deployment depends on this claim.
  wait_until_bound = false

  depends_on = [terraform_data.cluster_ready]
}

resource "kubernetes_config_map_v1" "bootstrap_script" {
  metadata {
    name      = "sftpgo-bootstrap-script"
    namespace = var.workload_namespace
  }

  data = {
    "bootstrap.py" = file("${path.module}/../../../../scripts/ftps/bootstrap.py")
  }

  depends_on = [terraform_data.cluster_ready]
}

resource "kubernetes_deployment_v1" "sftpgo" {
  metadata {
    name      = "sftpgo"
    namespace = var.workload_namespace
    labels    = local.sftpgo_labels
  }

  spec {
    replicas = 1

    # The single SFTPGo replica owns a ReadWriteOnce PVC for its SQLite state.
    # A rolling update can schedule the replacement on another node while the
    # old Pod still owns the disk, deadlocking the rollout. Stop the old Pod
    # before starting its replacement so the volume can detach and reattach.
    strategy {
      type = "Recreate"
    }

    selector {
      match_labels = local.sftpgo_labels
    }

    template {
      metadata {
        labels = local.sftpgo_labels
      }

      spec {
        service_account_name             = kubernetes_service_account_v1.sftpgo.metadata[0].name
        termination_grace_period_seconds = 30

        security_context {
          fs_group = 1000
        }

        container {
          name              = "sftpgo"
          image             = var.sftpgo_image
          image_pull_policy = "IfNotPresent"
          command           = ["sftpgo", "serve", "--config-dir", "/var/lib/sftpgo"]

          port {
            name           = "rest"
            container_port = 8080
            protocol       = "TCP"
          }

          dynamic "port" {
            for_each = local.ftps_port_map
            iterator = ftps_port

            content {
              name           = "ftps-${ftps_port.value}"
              container_port = ftps_port.value
              protocol       = "TCP"
            }
          }

          env {
            name  = "SFTPGO_DATA_PROVIDER__DRIVER"
            value = "sqlite"
          }

          env {
            name  = "SFTPGO_DATA_PROVIDER__NAME"
            value = "/var/lib/sftpgo/sftpgo.db"
          }

          env {
            name  = "SFTPGO_DATA_PROVIDER__USERS_BASE_DIR"
            value = "/srv/sftpgo/data"
          }

          env {
            name  = "SFTPGO_DATA_PROVIDER__CREATE_DEFAULT_ADMIN"
            value = "true"
          }

          env {
            name = "SFTPGO_DEFAULT_ADMIN_USERNAME"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.runtime.metadata[0].name
                key  = "FTPS_BOOTSTRAP_ADMIN_USERNAME"
              }
            }
          }

          env {
            name = "SFTPGO_DEFAULT_ADMIN_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.runtime.metadata[0].name
                key  = "FTPS_BOOTSTRAP_ADMIN_PASSWORD"
              }
            }
          }

          env {
            name = "SFTPGO_KMS__SECRETS__MASTER_KEY"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.runtime.metadata[0].name
                key  = "FTPS_SFTPGO_MASTER_KEY"
              }
            }
          }

          env {
            name  = "SFTPGO_COMMON__SETSTAT_MODE"
            value = "1"
          }

          # The TCP proxy writes a PROXY_V1 header for both control and passive
          # data connections. Strict mode preserves SFTPGo's peer-IP check and
          # rejects a direct, spoofed connection to the Pod.
          env {
            name  = "SFTPGO_COMMON__PROXY_PROTOCOL"
            value = "2"
          }

          env {
            name  = "SFTPGO_COMMON__PROXY_ALLOWED"
            value = join(",", local.gfe_proxy_source_ranges)
          }

          env {
            name  = "SFTPGO_SFTPD__BINDINGS__0__PORT"
            value = "0"
          }

          env {
            name  = "SFTPGO_FTPD__BINDINGS__0__PORT"
            value = tostring(local.ftps_control_port)
          }

          env {
            name  = "SFTPGO_FTPD__BINDINGS__0__TLS_MODE"
            value = "1"
          }

          env {
            name  = "SFTPGO_FTPD__BINDINGS__0__MIN_TLS_VERSION"
            value = "12"
          }

          env {
            name  = "SFTPGO_FTPD__BINDINGS__0__APPLY_PROXY_CONFIG"
            value = "true"
          }

          # force_passive_ip is deliberately unset: it only accepts an IPv4
          # address. The DNS name is resolved through passive_host instead.
          env {
            name  = "SFTPGO_FTPD__BINDINGS__0__PASSIVE_HOST"
            value = var.hostname
          }

          env {
            name  = "SFTPGO_FTPD__BINDINGS__0__PASSIVE_CONNECTIONS_SECURITY"
            value = "0"
          }

          env {
            name  = "SFTPGO_FTPD__BINDINGS__0__ACTIVE_CONNECTIONS_SECURITY"
            value = "0"
          }

          env {
            name  = "SFTPGO_FTPD__BINDINGS__0__CLIENT_AUTH_TYPE"
            value = "0"
          }

          env {
            name  = "SFTPGO_FTPD__CERTIFICATE_FILE"
            value = "/etc/sftpgo/certs/tls.crt"
          }

          env {
            name  = "SFTPGO_FTPD__CERTIFICATE_KEY_FILE"
            value = "/etc/sftpgo/certs/tls.key"
          }

          env {
            name  = "SFTPGO_FTPD__PASSIVE_PORT_RANGE__START"
            value = tostring(local.ftps_passive_port_start)
          }

          env {
            name  = "SFTPGO_FTPD__PASSIVE_PORT_RANGE__END"
            value = tostring(local.ftps_passive_port_end)
          }

          env {
            name  = "SFTPGO_FTPD__DISABLE_ACTIVE_MODE"
            value = "true"
          }

          env {
            name  = "SFTPGO_HTTPD__BINDINGS__0__PORT"
            value = "8080"
          }

          env {
            name  = "SFTPGO_HTTPD__BINDINGS__0__ENABLE_WEB_ADMIN"
            value = "false"
          }

          env {
            name  = "SFTPGO_HTTPD__BINDINGS__0__ENABLE_WEB_CLIENT"
            value = "false"
          }

          env {
            name  = "SFTPGO_HTTPD__BINDINGS__0__ENABLE_REST_API"
            value = "true"
          }

          readiness_probe {
            exec {
              command = ["sftpgo", "ping"]
            }

            initial_delay_seconds = 10
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 12
          }

          liveness_probe {
            exec {
              command = ["sftpgo", "ping"]
            }

            initial_delay_seconds = 30
            period_seconds        = 20
            timeout_seconds       = 5
            failure_threshold     = 3
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }

          volume_mount {
            name       = "state"
            mount_path = "/var/lib/sftpgo"
          }

          volume_mount {
            name       = "home"
            mount_path = "/srv/sftpgo/data"
          }

          volume_mount {
            name       = "tls"
            mount_path = "/etc/sftpgo/certs"
            read_only  = true
          }
        }

        volume {
          name = "state"
          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim_v1.state.metadata[0].name
          }
        }

        volume {
          name = "home"
          empty_dir {}
        }

        volume {
          name = "tls"
          secret {
            secret_name = kubernetes_secret_v1.tls.metadata[0].name
          }
        }
      }
    }
  }

  wait_for_rollout = true

  depends_on = [
    kubernetes_secret_v1.runtime,
    kubernetes_secret_v1.tls,
    kubernetes_persistent_volume_claim_v1.state,
    kubernetes_service_account_v1.sftpgo,
  ]
}

# Core uses this private Service for GET /api/v2/token and /api/v2/connections.
resource "kubernetes_service_v1" "rest" {
  metadata {
    name      = "sftpgo"
    namespace = var.workload_namespace
    labels    = local.sftpgo_labels
  }

  spec {
    type     = "ClusterIP"
    selector = local.sftpgo_labels

    port {
      name        = "rest"
      port        = 8080
      target_port = "rest"
      protocol    = "TCP"
    }
  }

  depends_on = [kubernetes_deployment_v1.sftpgo]
}

# This Service requests one standalone NEG per externally reachable FTPS port.
# It remains ClusterIP: public reachability comes only from the Compute Engine
# forwarding rules in network.tf.
resource "kubernetes_service_v1" "ftps_backend" {
  metadata {
    name      = "sftpgo-ftps-backend"
    namespace = var.workload_namespace
    annotations = {
      "cloud.google.com/neg" = jsonencode({
        exposed_ports = {
          for key, port in local.ftps_port_map : key => { name = local.ftps_neg_names[key] }
        }
      })
    }
  }

  spec {
    type     = "ClusterIP"
    selector = local.sftpgo_labels

    dynamic "port" {
      for_each = local.ftps_port_map
      iterator = ftps_port

      content {
        name        = "ftps-${ftps_port.value}"
        port        = ftps_port.value
        target_port = "ftps-${ftps_port.value}"
        protocol    = "TCP"
      }
    }
  }

  lifecycle {
    ignore_changes = [
      metadata[0].annotations["cloud.google.com/neg-status"],
    ]
  }

  depends_on = [kubernetes_deployment_v1.sftpgo]
}

resource "terraform_data" "bootstrap_revision" {
  input = var.bootstrap_revision
}

ephemeral "google_secret_manager_secret_version" "demo_password" {
  project = var.project_id
  secret  = var.demo_password_secret_name
  version = var.demo_password_secret_version
}

ephemeral "google_secret_manager_secret_version" "status_password" {
  project = var.project_id
  secret  = var.status_password_secret_name
  version = var.status_password_secret_version
}

# Infra owns this projection so a fresh platform apply does not depend on Core
# already having deployed celesnity-core-secrets. Core reads the same Secret
# Manager versions through its application deployment pipeline.
resource "kubernetes_secret_v1" "client_credentials" {
  metadata {
    name      = "sftpgo-client-credentials"
    namespace = var.workload_namespace
  }

  data_wo = {
    FTPS_DEMO_PASSWORD   = ephemeral.google_secret_manager_secret_version.demo_password.secret_data
    FTPS_STATUS_PASSWORD = ephemeral.google_secret_manager_secret_version.status_password.secret_data
  }

  data_wo_revision = var.kubernetes_secret_revision
  type             = "Opaque"
}

resource "kubernetes_job_v1" "bootstrap" {
  metadata {
    generate_name = "sftpgo-bootstrap-"
    namespace     = var.workload_namespace
    labels = {
      "app.kubernetes.io/name"      = "sftpgo-bootstrap"
      "app.kubernetes.io/part-of"   = "celesnity"
      "app.kubernetes.io/component" = "ftps"
    }
  }

  spec {
    backoff_limit = 3

    template {
      metadata {
        labels = {
          "app.kubernetes.io/name"      = "sftpgo-bootstrap"
          "app.kubernetes.io/part-of"   = "celesnity"
          "app.kubernetes.io/component" = "ftps"
        }
      }

      spec {
        restart_policy = "OnFailure"

        container {
          name              = "bootstrap"
          image             = "python:3.13-alpine"
          image_pull_policy = "IfNotPresent"
          command           = ["python", "/opt/ftps/bootstrap.py"]

          env {
            name  = "FTPS_SFTPGO_API_URL"
            value = "http://sftpgo:8080"
          }

          env {
            name = "FTPS_BOOTSTRAP_ADMIN_USERNAME"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.runtime.metadata[0].name
                key  = "FTPS_BOOTSTRAP_ADMIN_USERNAME"
              }
            }
          }

          env {
            name = "FTPS_BOOTSTRAP_ADMIN_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.runtime.metadata[0].name
                key  = "FTPS_BOOTSTRAP_ADMIN_PASSWORD"
              }
            }
          }

          env {
            name  = "FTPS_STATUS_USERNAME"
            value = "ftps-status-monitor"
          }

          env {
            name = "FTPS_STATUS_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.client_credentials.metadata[0].name
                key  = "FTPS_STATUS_PASSWORD"
              }
            }
          }

          env {
            name  = "FTPS_DEMO_USERNAME"
            value = "ftps-demo-user"
          }

          env {
            name = "FTPS_DEMO_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.client_credentials.metadata[0].name
                key  = "FTPS_DEMO_PASSWORD"
              }
            }
          }

          env {
            name  = "FTPS_RESET_PASSWORD"
            value = "true"
          }

          env {
            name  = "FTPS_STATUS_RESET_PASSWORD"
            value = "true"
          }

          env {
            name  = "FTPS_STORAGE_BACKEND"
            value = "gcs"
          }

          env {
            name  = "FTPS_INGRESS_BUCKET"
            value = google_storage_bucket.ingress.name
          }

          env {
            name  = "FTPS_TENANT_PREFIX"
            value = var.tenant_prefix
          }

          env {
            name  = "FTPS_SFTPGO_FOLDER_NAME"
            value = "ftps-demo-incoming"
          }

          resources {
            requests = {
              cpu    = "25m"
              memory = "64Mi"
            }
            limits = {
              memory = "128Mi"
            }
          }

          volume_mount {
            name       = "bootstrap-script"
            mount_path = "/opt/ftps"
            read_only  = true
          }
        }

        volume {
          name = "bootstrap-script"
          config_map {
            name = kubernetes_config_map_v1.bootstrap_script.metadata[0].name
          }
        }
      }
    }
  }

  wait_for_completion = true

  timeouts {
    create = "10m"
  }

  lifecycle {
    replace_triggered_by = [terraform_data.bootstrap_revision]
  }

  depends_on = [
    kubernetes_config_map_v1.bootstrap_script,
    kubernetes_secret_v1.client_credentials,
    kubernetes_deployment_v1.sftpgo,
    kubernetes_service_v1.rest,
  ]
}
