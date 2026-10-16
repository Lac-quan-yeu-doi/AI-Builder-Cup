resource "terraform_data" "cluster_ready" {
  input = var.cluster_dependencies
}

# Environments that set broker_data_disk_type reference this CSI StorageClass;
# environments that leave it empty continue using their cluster default. Keep
# the resource address unindexed because the production state predates that
# opt-in behavior. WaitForFirstConsumer provisions each disk with its broker.
resource "kubernetes_storage_class_v1" "broker_data" {
  metadata {
    name = "${var.name}-broker-data"
  }

  storage_provisioner    = "pd.csi.storage.gke.io"
  reclaim_policy         = "Retain"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true

  parameters = {
    type                        = var.broker_data_disk_type == "" ? "pd-balanced" : var.broker_data_disk_type
    "csi.storage.k8s.io/fstype" = "ext4"
  }

  depends_on = [terraform_data.cluster_ready]
}

locals {
  broker_storage_class_name = var.broker_data_disk_type == "" ? "" : kubernetes_storage_class_v1.broker_data.metadata[0].name
}

resource "google_container_node_pool" "redpanda" {
  name     = "${var.name}-redpanda"
  project  = var.project_id
  cluster  = var.cluster_name
  location = var.cluster_location
  # GKE interprets node_count per zone for a regional cluster. Production uses
  # one node in each of three zones rather than multiplying three broker replicas
  # into nine nodes.
  node_count = var.node_count

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
  }

  node_config {
    machine_type = var.node_machine_type
    disk_size_gb = var.node_disk_size_gb
    # Broker data lives on separately provisioned persistent volumes. The node
    # boot disk only holds the OS, kubelet state, and pulled images, so standard
    # persistent disk avoids consuming scarce SSD quota without downgrading the
    # Redpanda or EMQX data volumes.
    disk_type       = var.node_disk_type
    service_account = var.node_service_account_email
    oauth_scopes    = var.node_oauth_scopes

    workload_metadata_config { mode = "GKE_METADATA" }
    shielded_instance_config {
      enable_secure_boot          = var.node_enable_secure_boot
      enable_integrity_monitoring = true
    }
    labels = { "celesnity-io-pool" = "redpanda" }
    taint {
      key    = "celesnity.io/workload"
      value  = "redpanda"
      effect = "NO_SCHEDULE"
    }
  }

  depends_on = [terraform_data.cluster_ready]
}

resource "kubernetes_namespace_v1" "streaming" {
  metadata { name = var.namespace }
  depends_on = [terraform_data.cluster_ready]
}

resource "helm_release" "cert_manager" {
  count = var.redpanda_tls_enabled ? 1 : 0

  name             = "cert-manager"
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  version          = var.cert_manager_chart_version
  namespace        = "cert-manager"
  create_namespace = true
  wait             = true
  timeout          = 1200

  set = [{
    name  = "crds.enabled"
    value = "true"
  }]

  depends_on = [terraform_data.cluster_ready]
}

resource "random_password" "redpanda" {
  length  = 40
  special = false
}

resource "random_password" "emqx_api_secret" {
  length  = 48
  special = false
}

resource "random_password" "mqtt_connect_password" {
  length  = 48
  special = false
}

resource "kubernetes_secret_v1" "emqx_bootstrap" {
  metadata {
    name      = "emqx-bootstrap"
    namespace = kubernetes_namespace_v1.streaming.metadata[0].name
  }
  data = {
    "default_api_key.conf" = "celesnity-core:${random_password.emqx_api_secret.result}"
    "auth-built-in-db-bootstrap.csv" = join("\n", [
      "user_id,password,is_superuser",
      "celesnity-connect,${random_password.mqtt_connect_password.result},false",
    ])
    "acl.conf" = join("\n", [
      "{allow, {user, \"celesnity-connect\"}, subscribe, [\"tenants/#\"]}.",
      "{deny, all, all, [\"#\"]}.",
    ])
  }
}

resource "helm_release" "emqx" {
  name       = "emqx"
  repository = "https://repos.emqx.io/charts"
  chart      = "emqx"
  version    = var.emqx_chart_version
  namespace  = kubernetes_namespace_v1.streaming.metadata[0].name
  wait       = true
  timeout    = 1200

  values = [yamlencode({
    replicaCount = var.mqtt_broker_replicas
    persistence = merge({
      enabled = true
      size    = var.mqtt_broker_storage_size
      }, local.broker_storage_class_name == "" ? {} : {
      storageClassName = local.broker_storage_class_name
    })
    nodeSelector = { "celesnity-io-pool" = "redpanda" }
    tolerations = [{
      key = "celesnity.io/workload", operator = "Equal", value = "redpanda", effect = "NoSchedule"
    }]
    resources = {
      requests = { cpu = "1", memory = "2Gi" }
      limits   = { cpu = "2", memory = "4Gi" }
    }
    podManagementPolicy = "Parallel"
    pdb                 = { enabled = var.mqtt_broker_replicas > 1, maxUnavailable = 1 }
    ssl                 = { enabled = false }
    emqxConfig = {
      EMQX_API_KEY__BOOTSTRAP_FILE           = "/opt/emqx/etc/default_api_key.conf"
      EMQX_AUTHENTICATION__1__MECHANISM      = "password_based"
      EMQX_AUTHENTICATION__1__BACKEND        = "built_in_database"
      EMQX_AUTHENTICATION__1__USER_ID_TYPE   = "username"
      EMQX_AUTHENTICATION__1__BOOTSTRAP_FILE = "/opt/emqx/etc/auth-built-in-db-bootstrap.csv"
      EMQX_AUTHENTICATION__1__BOOTSTRAP_TYPE = "plain"
      EMQX_AUTHORIZATION__NO_MATCH           = "deny"
      EMQX_AUTHORIZATION__SOURCES__1__TYPE   = "built_in_database"
      EMQX_AUTHORIZATION__SOURCES__2__TYPE   = "file"
      EMQX_AUTHORIZATION__SOURCES__2__PATH   = "/opt/emqx/etc/acl.conf"
    }
    extraVolumes      = [{ name = "bootstrap", secret = { secretName = kubernetes_secret_v1.emqx_bootstrap.metadata[0].name } }]
    extraVolumeMounts = [{ name = "bootstrap", mountPath = "/opt/emqx/etc/default_api_key.conf", subPath = "default_api_key.conf", readOnly = true }, { name = "bootstrap", mountPath = "/opt/emqx/etc/auth-built-in-db-bootstrap.csv", subPath = "auth-built-in-db-bootstrap.csv", readOnly = true }, { name = "bootstrap", mountPath = "/opt/emqx/etc/acl.conf", subPath = "acl.conf", readOnly = true }]
  })]

  depends_on = [google_container_node_pool.redpanda]
}

locals {
  mqtt_neg_name = "${var.name}-emqx-mqtt"
}

resource "kubernetes_service_v1" "mqtt_backend" {
  metadata {
    name      = "emqx-mqtt-backend"
    namespace = kubernetes_namespace_v1.streaming.metadata[0].name
    annotations = {
      "cloud.google.com/neg" = jsonencode({ exposed_ports = { "1883" = { name = local.mqtt_neg_name } } })
    }
  }
  spec {
    type = "ClusterIP"
    selector = {
      "app.kubernetes.io/name"     = "emqx"
      "app.kubernetes.io/instance" = "emqx"
    }
    port {
      name        = "mqtt"
      port        = 1883
      target_port = "mqtt"
      protocol    = "TCP"
    }
  }

  # The GKE NEG controller writes its resolved zonal groups here after creating
  # them. Terraform owns the requested `cloud.google.com/neg` annotation, but
  # must not remove the controller's status on every plan/apply cycle.
  lifecycle {
    ignore_changes = [
      metadata[0].annotations["cloud.google.com/neg-status"],
    ]
  }

  depends_on = [helm_release.emqx]
}

# The GKE NEG controller creates the zonal NEG asynchronously after the Service.
resource "terraform_data" "mqtt_neg_ready" {
  triggers_replace = [kubernetes_service_v1.mqtt_backend.metadata[0].uid]
  provisioner "local-exec" { command = "sleep 45" }
}

resource "google_compute_global_address" "mqtt" {
  name         = "${var.name}-mqtt"
  project      = var.project_id
  address_type = "EXTERNAL"
}

resource "google_dns_record_set" "mqtt" {
  count        = var.mqtt_dns_managed_zone == "" ? 0 : 1
  project      = var.project_id
  managed_zone = var.mqtt_dns_managed_zone
  name         = "${trimsuffix(var.mqtt_hostname, ".")}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.mqtt.address]
}

resource "google_compute_health_check" "mqtt" {
  name                = "${var.name}-mqtt"
  project             = var.project_id
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  tcp_health_check { port = 1883 }
}

resource "google_compute_firewall" "mqtt_health_and_proxy" {
  name          = "${var.name}-allow-mqtt-proxy"
  project       = var.project_id
  network       = var.network
  direction     = "INGRESS"
  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]

  allow {
    protocol = "tcp"
    ports    = ["1883"]
  }
}

resource "google_compute_backend_service" "mqtt" {
  name                  = "${var.name}-mqtt"
  project               = var.project_id
  protocol              = "TCP"
  load_balancing_scheme = "EXTERNAL"
  timeout_sec           = 86400
  health_checks         = [google_compute_health_check.mqtt.id]

  dynamic "backend" {
    for_each = toset(var.cluster_zones)

    content {
      # The NEG name and zones are deterministic. Referencing their self-links
      # directly keeps the initial regional plan valid even though GKE creates
      # the NEGs asynchronously after the Service exists.
      group                        = "https://www.googleapis.com/compute/v1/projects/${var.project_id}/zones/${backend.value}/networkEndpointGroups/${local.mqtt_neg_name}"
      balancing_mode               = "CONNECTION"
      max_connections_per_endpoint = 100000
    }
  }

  depends_on = [terraform_data.mqtt_neg_ready]
}

resource "google_certificate_manager_certificate_map" "mqtt" {
  name    = "${var.name}-mqtt"
  project = var.project_id
}

resource "google_certificate_manager_certificate_map_entry" "mqtt" {
  name         = "${var.name}-mqtt"
  project      = var.project_id
  map          = google_certificate_manager_certificate_map.mqtt.name
  hostname     = var.mqtt_hostname
  certificates = ["projects/${var.project_id}/locations/global/certificates/${var.mqtt_certificate_name}"]
}

resource "google_compute_target_ssl_proxy" "mqtt" {
  name            = "${var.name}-mqtt"
  project         = var.project_id
  backend_service = google_compute_backend_service.mqtt.id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.mqtt.id}"
  proxy_header    = "NONE"
}

resource "google_compute_global_forwarding_rule" "mqtt" {
  name                  = "${var.name}-mqtt"
  project               = var.project_id
  ip_address            = google_compute_global_address.mqtt.id
  ip_protocol           = "TCP"
  port_range            = "8883"
  load_balancing_scheme = "EXTERNAL"
  target                = google_compute_target_ssl_proxy.mqtt.id
}

resource "helm_release" "redpanda" {
  name       = "redpanda"
  repository = "https://charts.redpanda.com"
  chart      = "redpanda"
  version    = var.redpanda_chart_version
  namespace  = kubernetes_namespace_v1.streaming.metadata[0].name
  wait       = true
  timeout    = 1200

  values = [yamlencode({
    image = { tag = var.redpanda_image_tag }
    statefulset = {
      replicas = var.broker_replicas
      podTemplate = {
        spec = {
          nodeSelector = { "celesnity-io-pool" = "redpanda" }
          tolerations = [{
            key      = "celesnity.io/workload"
            operator = "Equal"
            value    = "redpanda"
            effect   = "NoSchedule"
          }]
        }
      }
    }
    tls = { enabled = var.redpanda_tls_enabled }
    rackAwareness = {
      enabled        = var.redpanda_rack_awareness_enabled
      nodeAnnotation = "topology.kubernetes.io/zone"
    }
    auth = {
      sasl = {
        enabled = true
        users = [{
          name      = "celesnity-admin"
          password  = random_password.redpanda.result
          mechanism = "SCRAM-SHA-256"
        }]
      }
    }
    storage = {
      persistentVolume = merge({
        enabled = true
        size    = var.broker_storage_size
        }, local.broker_storage_class_name == "" ? {} : {
        storageClass = local.broker_storage_class_name
      })
    }
    resources = {
      cpu = { cores = 2 }
      memory = {
        container = { max = "6Gi" }
        redpanda  = { memory = "4Gi", reserveMemory = "512Mi" }
      }
    }
    console = { enabled = true }
  })]

  depends_on = [google_container_node_pool.redpanda, helm_release.cert_manager]
}

# The Redpanda chart renders the requested users into redpanda-users, but its
# post-install controller has not consistently reconciled that Secret into a
# newly bootstrapped broker cluster. Reconcile the application account
# explicitly with the chart's bootstrap identity before any platform client is
# deployed. Both create and update are safe, so a retry also repairs password
# drift without exposing the credential in logs.
resource "kubernetes_job_v1" "redpanda_client_user" {
  metadata {
    generate_name = "redpanda-client-user-"
    namespace     = kubernetes_namespace_v1.streaming.metadata[0].name
  }

  spec {
    # A bad rpk flag previously consumed almost six minutes of exponential
    # container restarts before Terraform received the error. Use fresh pods for
    # two bounded retries so transient Admin API readiness still recovers while
    # deterministic configuration errors fail quickly and retain useful logs.
    backoff_limit = 2

    template {
      metadata {
        labels = {
          "app.kubernetes.io/name"      = "redpanda-client-user"
          "app.kubernetes.io/part-of"   = "celesnity"
          "app.kubernetes.io/component" = "bootstrap"
        }
        annotations = {
          # A password rotation changes the immutable Job template and forces
          # a fresh reconciliation instead of leaving an old completed Job.
          "celesnity.com/client-password-sha256" = sha256(random_password.redpanda.result)
        }
      }

      spec {
        restart_policy = "Never"

        container {
          name  = "rpk"
          image = "docker.redpanda.com/redpandadata/redpanda:${var.redpanda_image_tag}"

          command = ["/bin/bash", "-ceu"]
          args = [<<-EOT
            CLIENT_PASSWORD="$(awk -F: '$1 == "celesnity-admin" { printf "%s", $2 }' /etc/redpanda/users/users.txt)"
            if [ -z "$CLIENT_PASSWORD" ]; then
              echo "ERROR: celesnity-admin is missing from the rendered Redpanda users Secret"
              exit 1
            fi

            RPK=(
              -X admin.hosts=redpanda.${var.namespace}.svc.cluster.local:9644
              -X user=kubernetes-controller
              -X pass="$BOOTSTRAP_PASSWORD"
            )
            if [ "${var.redpanda_tls_enabled}" = "true" ]; then
              RPK+=(-X admin.tls.enabled=true -X admin.tls.ca=/etc/redpanda/tls/ca.crt)
            fi

            if rpk security user list "$${RPK[@]}" | awk 'NR > 1 { print $1 }' | grep -Fxq celesnity-admin; then
              rpk security user update celesnity-admin \
                --new-password="$CLIENT_PASSWORD" --mechanism=SCRAM-SHA-256 "$${RPK[@]}"
            else
              rpk security user create celesnity-admin \
                --password="$CLIENT_PASSWORD" --mechanism=SCRAM-SHA-256 "$${RPK[@]}"
            fi
          EOT
          ]

          env {
            name = "BOOTSTRAP_PASSWORD"
            value_from {
              secret_key_ref {
                name = "redpanda-bootstrap-user"
                key  = "password"
              }
            }
          }

          volume_mount {
            name       = "users"
            mount_path = "/etc/redpanda/users"
            read_only  = true
          }

          dynamic "volume_mount" {
            for_each = var.redpanda_tls_enabled ? [1] : []
            content {
              name       = "redpanda-ca"
              mount_path = "/etc/redpanda/tls"
              read_only  = true
            }
          }

          resources {
            requests = {
              cpu    = "25m"
              memory = "32Mi"
            }
            limits = {
              memory = "128Mi"
            }
          }
        }

        volume {
          name = "users"
          secret {
            secret_name = "redpanda-users"
          }
        }

        dynamic "volume" {
          for_each = var.redpanda_tls_enabled ? [1] : []
          content {
            name = "redpanda-ca"
            secret {
              secret_name = "redpanda-default-cert"
              items {
                key  = "ca.crt"
                path = "ca.crt"
              }
            }
          }
        }
      }
    }
  }

  wait_for_completion = true

  timeouts {
    create = "10m"
  }

  depends_on = [helm_release.redpanda]
}

data "kubernetes_secret_v1" "redpanda_tls" {
  count = var.redpanda_tls_enabled ? 1 : 0

  metadata {
    name      = "redpanda-default-cert"
    namespace = kubernetes_namespace_v1.streaming.metadata[0].name
  }

  depends_on = [helm_release.redpanda]
}

locals {
  redpanda_ca_cert = var.redpanda_tls_enabled ? data.kubernetes_secret_v1.redpanda_tls[0].data["ca.crt"] : ""
}

resource "kubernetes_secret_v1" "streaming_clients" {
  metadata {
    name      = "celesnity-streaming"
    namespace = var.workload_namespace
  }
  data = {
    REDPANDA_BROKERS            = "redpanda.${var.namespace}.svc.cluster.local:9093"
    REDPANDA_USERNAME           = "celesnity-admin"
    REDPANDA_PASSWORD           = random_password.redpanda.result
    REDPANDA_REPLICATION_FACTOR = tostring(var.broker_replicas)
    REDPANDA_TLS_ENABLED        = tostring(var.redpanda_tls_enabled)
    REDPANDA_SECURITY_PROTOCOL  = var.redpanda_tls_enabled ? "SASL_SSL" : "SASL_PLAINTEXT"
    REDPANDA_CA_CERT            = local.redpanda_ca_cert
    REDPANDA_CA_CERT_PATH       = "/etc/redpanda/tls/ca.crt"
    "ca.crt"                    = local.redpanda_ca_cert
    MQTT_PUBLIC_ENDPOINT        = "mqtts://${var.mqtt_hostname}:8883"
    MQTT_BROKER_INTERNAL_URL    = "tcp://emqx.${var.namespace}.svc.cluster.local:1883"
    MQTT_CONNECT_USERNAME       = "celesnity-connect"
    MQTT_CONNECT_PASSWORD       = random_password.mqtt_connect_password.result
    EMQX_API_URL                = "http://emqx.${var.namespace}.svc.cluster.local:18083/api/v5"
    EMQX_API_KEY                = "celesnity-core"
    EMQX_API_SECRET             = random_password.emqx_api_secret.result
  }
  type       = "Opaque"
  depends_on = [kubernetes_job_v1.redpanda_client_user, helm_release.emqx]
}
