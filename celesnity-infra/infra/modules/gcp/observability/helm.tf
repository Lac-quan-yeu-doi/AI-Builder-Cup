resource "kubernetes_namespace_v1" "monitoring" {
  metadata {
    name = var.namespace

    labels = var.install_grafana && var.grafana_hostname != "" ? {
      # The shared Gateway admits cross-namespace routes only from explicitly
      # opted-in namespaces. Grafana's HTTPRoute lives beside its Service here.
      "celesnity.io/gateway-access" = "true"
    } : {}
  }

  depends_on = [terraform_data.cluster_ready]
}

resource "terraform_data" "cluster_ready" {
  input = var.cluster_dependencies
}

########################################
# Loki
#
# SingleBinary mode with GCS storage. The chart defaults to SimpleScalable, which
# spreads read/write/backend across separate Deployments and does not fit a small
# node pool.
#
# The two settings that matter most are chunksCache and resultsCache. Both default
# to enabled, with chunksCache requesting 8 GiB of memcached. Both are disabled.
########################################

resource "helm_release" "loki" {
  count = var.install_loki ? 1 : 0

  name       = "loki"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "loki"
  version    = var.loki_chart_version
  namespace  = kubernetes_namespace_v1.monitoring.metadata[0].name

  wait    = true
  timeout = 900

  values = [yamlencode({
    deploymentMode = "SingleBinary"

    loki = {
      # Single tenant. With auth enabled every request needs an X-Scope-OrgID
      # header, which Alloy and Grafana would both have to set.
      auth_enabled = false

      commonConfig = {
        replication_factor = 1
      }

      storage = {
        type = "gcs"

        bucketNames = {
          chunks = local.loki_bucket
          ruler  = local.loki_bucket
          admin  = local.loki_bucket
        }

        # No credentials block. Loki's GCS client uses Google Application Default
        # Credentials, which Workload Identity serves from the GKE metadata server.
        gcs = {
          enable_http2 = true
        }
      }

      # Required: the chart ships an empty schemaConfig and refuses to start
      # without one. object_store is gcs here rather than s3.
      schemaConfig = {
        configs = [{
          from         = "2024-04-01"
          store        = "tsdb"
          object_store = "gcs"
          schema       = "v13"
          index = {
            prefix = "loki_index_"
            period = "24h"
          }
        }]
      }

      limits_config = {
        retention_period           = "${var.loki_retention_hours}h"
        ingestion_rate_mb          = 8
        ingestion_burst_size_mb    = 16
        max_query_series           = 5000
        reject_old_samples         = true
        reject_old_samples_max_age = "168h"
      }

      compactor = {
        retention_enabled    = true
        delete_request_store = "gcs"
      }

      podLabels = {
        "app.kubernetes.io/part-of" = "celesnity"
      }
    }

    # The Workload Identity annotation. Without it Loki falls back to the node
    # service account, which has no bucket access, and fails its storage check.
    serviceAccount = {
      create = true
      name   = "loki"
      annotations = {
        "iam.gke.io/gcp-service-account" = google_service_account.loki[0].email
      }
    }

    singleBinary = {
      replicas = 1

      resources = {
        requests = {
          cpu    = "100m"
          memory = "256Mi"
        }
        limits = {
          memory = var.loki_memory_limit
        }
      }

      # Chunks and index live in GCS; this is only the local write-ahead log.
      persistence = {
        enabled      = true
        size         = "4Gi"
        storageClass = var.storage_class
      }
    }

    read         = { replicas = 0 }
    write        = { replicas = 0 }
    backend      = { replicas = 0 }
    gateway      = { enabled = false }
    chunksCache  = { enabled = false }
    resultsCache = { enabled = false }
    lokiCanary   = { enabled = false }
    test         = { enabled = false }
    minio        = { enabled = false }
  })]

  depends_on = [
    google_storage_bucket_iam_member.loki,
    google_service_account_iam_member.loki,
  ]
}

########################################
# Alloy
#
# Byte-identical pipeline to the AWS build: the config reads container logs from
# /var/log/pods and pushes to Loki, with no cloud-specific anything.
########################################

resource "helm_release" "alloy" {
  count = var.install_loki || var.loki_write_endpoint != "" ? 1 : 0

  name       = "alloy"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "alloy"
  version    = var.alloy_chart_version
  namespace  = kubernetes_namespace_v1.monitoring.metadata[0].name

  wait    = true
  timeout = 600

  # Helm's client-side validation downloads the API server's full OpenAPI schema,
  # which is ~3 MB on GKE 1.34, inside a fixed 32-second deadline. Over a
  # long-haul link to asia-southeast1 that single transfer is the most likely
  # thing in the whole apply to fail, and it fails with a misleading
  # "network is unreachable" rather than a timeout.
  #
  # The tradeoff is real but small: this only skips schema validation of the
  # upstream chart's rendered manifests. Server-side validation still rejects
  # anything invalid at apply time, so the failure moves rather than disappears.
  disable_openapi_validation = true

  # Without this, an install that dies partway leaves its objects behind and the
  # next run trips over them.
  cleanup_on_fail = true

  values = [yamlencode({
    controller = {
      type = "daemonset"
    }

    alloy = {
      configMap = {
        content = templatefile("${path.module}/config/logs.alloy.tftpl", {
          loki_push_url         = local.loki_push_url
          cluster_label         = var.name
          log_namespaces        = var.log_namespaces
          drop_healthcheck_logs = var.drop_healthcheck_logs
        })
      }

      mounts = {
        varlog = true
      }

      enableReporting = false

      extraEnv = [{
        name = "NODE_NAME"
        valueFrom = {
          fieldRef = {
            fieldPath = "spec.nodeName"
          }
        }
      }]

      resources = {
        requests = {
          cpu    = "50m"
          memory = "128Mi"
        }
        limits = {
          memory = var.alloy_memory_limit
        }
      }

      # Reading other containers' logs under /var/log/pods requires root.
      securityContext = {
        runAsUser  = 0
        runAsGroup = 0
      }
    }

    tolerations = [{
      operator = "Exists"
    }]

    crds = {
      create = false
    }
  })]

  depends_on = [helm_release.loki]
}

########################################
# Grafana
########################################

resource "random_password" "grafana_admin" {
  count = var.install_grafana ? 1 : 0

  length  = 24
  special = false
}

resource "kubernetes_secret_v1" "grafana_admin" {
  count = var.install_grafana ? 1 : 0

  metadata {
    name      = "grafana-admin"
    namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
  }

  data = {
    "admin-user"     = "admin"
    "admin-password" = random_password.grafana_admin[0].result
  }

  type = "Opaque"
}

resource "helm_release" "grafana" {
  count = var.install_grafana ? 1 : 0

  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  version    = var.grafana_chart_version
  namespace  = kubernetes_namespace_v1.monitoring.metadata[0].name

  wait    = true
  timeout = 600

  # See the note on helm_release.alloy. Grafana failed on the /apis discovery call
  # rather than the OpenAPI fetch, which this does not eliminate, but it removes
  # the largest transfer and so the largest share of the risk.
  disable_openapi_validation = true
  cleanup_on_fail            = true

  values = [yamlencode({
    admin = {
      existingSecret = kubernetes_secret_v1.grafana_admin[0].metadata[0].name
      userKey        = "admin-user"
      passwordKey    = "admin-password"
    }

    # No Ingress. The Service stays HTTP-only inside the cluster; when published,
    # the shared Gateway terminates TLS and forwards plaintext HTTP to this port.
    service = {
      type = "ClusterIP"
    }

    serviceAccount = {
      create = true
      name   = "grafana"
      annotations = {
        "iam.gke.io/gcp-service-account" = google_service_account.grafana[0].email
      }
    }

    # The webhook value is supplied by a pre-created Kubernetes Secret, never
    # by Terraform variables or state. Grafana expands it while provisioning.
    envFromSecret = var.enable_error_alerts ? "grafana-discord-webhook" : ""

    "grafana.ini" = var.grafana_hostname != "" ? {
      server = {
        domain   = var.grafana_hostname
        root_url = "https://${var.grafana_hostname}"
      }
    } : {}

    persistence = {
      enabled          = true
      size             = var.grafana_persistence_size
      storageClassName = var.storage_class
    }

    # Grafana's single ReadWriteOnce PVC cannot be attached to both the old
    # and replacement pods during a rolling update.
    deploymentStrategy = {
      type = "Recreate"
    }

    datasources = {
      "datasources.yaml" = {
        apiVersion = 1
        datasources = [
          {
            name = "Loki"
            # Preserve the UID assigned by the original provisioned datasource.
            # Changing a provisioned datasource UID in place makes Grafana 12
            # fail startup with "data source not found" on existing PVCs.
            uid       = "P8E80F9AEF21F6940"
            type      = "loki"
            access    = "proxy"
            url       = "http://loki.${var.namespace}.svc.cluster.local:3100"
            isDefault = true
            editable  = false
            jsonData = {
              maxLines = 1000
            }
          },
          {
            name      = "Google Cloud Monitoring"
            uid       = "google-cloud-monitoring"
            type      = "stackdriver"
            access    = "proxy"
            isDefault = false
            editable  = false
            jsonData = {
              authenticationType = "gce"
              defaultProject     = var.project_id
            }
          },
        ]
      }
    }

    alerting = jsondecode(var.enable_error_alerts ? jsonencode({
      "00-discord-contactpoint.yaml" = {
        apiVersion = 1
        contactPoints = [{
          orgId = 1
          name  = "celesnity-discord-errors"
          receivers = [{
            uid  = "celesnity_discord_errors"
            type = "discord"
            settings = {
              url = "$DISCORD_WEBHOOK_URL"
              # The Helm chart applies tpl to alerting files before Grafana
              # reads them. A Helm raw string preserves Grafana's templates.
              message = <<-EOT
                {{`{{ if .Alerts.Firing }}**Firing: {{ len .Alerts.Firing }} Celesnity error(s)**
                {{ range .Alerts.Firing }}
                • {{ .Annotations.summary }}
                Alert started: {{ .StartsAt.Format "2006-01-02 15:04:05 MST" }}
                {{ with .Annotations.description }}{{ . }}
                {{ end }}{{ with .Annotations.logs_url }}Protected logs: {{ . }}
                {{ end }}{{ end }}{{ end }}{{ if .Alerts.Resolved }}**Resolved: {{ len .Alerts.Resolved }} Celesnity error(s)**
                {{ range .Alerts.Resolved }}
                • {{ .Annotations.summary }}
                {{ end }}{{ end }}`}}
              EOT
            }
          }]
        }]
      }
      "10-service-errors.yaml" = local.error_alert_rules
    }) : "{}")

    dashboardProviders = {
      "dashboardproviders.yaml" = {
        apiVersion = 1
        providers = [{
          name            = "Celesnity"
          folder          = "Celesnity"
          type            = "file"
          disableDeletion = true
          editable        = false
          options = {
            path = "/var/lib/grafana/dashboards/celesnity"
          }
        }]
      }
    }

    dashboards = {
      celesnity = {
        "platform-overview" = {
          json = replace(
            replace(
              file("${path.module}/dashboards/platform-overview.json"),
              "__PROJECT_ID__",
              var.project_id,
            ),
            "__LOKI_DATASOURCE_UID__",
            "P8E80F9AEF21F6940",
          )
        }
      }
    }

    resources = {
      requests = {
        cpu    = "50m"
        memory = "160Mi"
      }
      limits = {
        memory = var.grafana_memory_limit
      }
    }

    # Sidecar dashboard discovery watches all ConfigMaps cluster-wide and costs
    # ~100Mi. Provision through values instead if needed.
    sidecar = {
      dashboards  = { enabled = false }
      datasources = { enabled = false }
    }

    testFramework = {
      enabled = false
    }
  })]

  depends_on = [
    helm_release.loki,
    google_project_iam_member.grafana_monitoring_viewer,
    google_service_account_iam_member.grafana,
  ]
}
