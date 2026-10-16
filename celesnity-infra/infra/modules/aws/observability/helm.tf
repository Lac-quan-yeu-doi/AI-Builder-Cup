resource "kubernetes_namespace_v1" "monitoring" {
  metadata {
    name = var.namespace
  }

  depends_on = [terraform_data.cluster_ready]
}

resource "terraform_data" "cluster_ready" {
  input = var.cluster_dependencies
}

########################################
# Loki
#
# SingleBinary mode: one process running all components. The chart defaults to
# SimpleScalable, which spreads read/write/backend across separate Deployments and
# does not fit a four-node t4g.medium cluster.
#
# The two settings that matter most here are chunksCache and resultsCache. Both
# default to enabled, with chunksCache asking for 8 GiB of memcached. That alone
# exceeds a single t4g.medium node, so both are disabled.
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
        type = "s3"

        bucketNames = {
          chunks = local.loki_bucket
          ruler  = local.loki_bucket
          admin  = local.loki_bucket
        }

        s3 = {
          region = var.region
          # accessKeyId and secretAccessKey stay unset so the AWS SDK falls
          # through to the IRSA web identity credentials.
          s3ForcePathStyle = false
        }
      }

      # Required: the chart ships an empty schemaConfig and refuses to start
      # without one unless useTestSchema is set.
      schemaConfig = {
        configs = [{
          from         = "2024-04-01"
          store        = "tsdb"
          object_store = "s3"
          schema       = "v13"
          index = {
            prefix = "loki_index_"
            period = "24h"
          }
        }]
      }

      limits_config = {
        retention_period = "${var.loki_retention_hours}h"
        # Trino stack traces are long; the default 256 KB line limit is fine but
        # the default ingestion rate is not, on a burst of Spark executor logs.
        ingestion_rate_mb          = 8
        ingestion_burst_size_mb    = 16
        max_query_series           = 5000
        reject_old_samples         = true
        reject_old_samples_max_age = "168h"
      }

      compactor = {
        retention_enabled    = true
        delete_request_store = "s3"
      }

      podLabels = {
        "app.kubernetes.io/part-of" = "celesnity"
      }
    }

    # No role-arn annotation: aws_eks_pod_identity_association.loki binds this
    # ServiceAccount to the IAM role from the EKS side.
    serviceAccount = {
      create = true
      name   = "loki"
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

      # Chunks and index live in S3; this is only the local write-ahead log.
      persistence = {
        enabled      = true
        size         = "4Gi"
        storageClass = var.grafana_storage_class
      }
    }

    # Everything below is either a different deployment mode, an optional extra,
    # or a memory hog that does not fit this cluster.
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
    aws_iam_role_policy_attachment.loki_s3,
    # Loki fails its S3 healthcheck and crash-loops if it starts before the
    # association exists.
    aws_eks_pod_identity_association.loki,
    aws_s3_bucket_public_access_block.loki,
  ]
}

########################################
# Alloy
#
# DaemonSet tailing /var/log/pods on each node. Cost note: the memory limit is
# charged once per node, so on four nodes a 256Mi limit is 1 GiB of cluster
# capacity reserved for log shipping.
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

      # Required for the hostPath tail of /var/log/pods.
      mounts = {
        varlog = true
      }

      # The pipeline is file-based, so no ingress ports are needed.
      enableReporting = false

      # NODE_NAME backs the discovery.kubernetes field selector so each pod only
      # discovers its own node's containers.
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

    # Alloy must run on every node, including any that are under memory pressure,
    # or that node's logs go uncollected.
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
  special = false # Avoids shell-quoting problems when pasting the value.
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

  values = [yamlencode({
    admin = {
      existingSecret = kubernetes_secret_v1.grafana_admin[0].metadata[0].name
      userKey        = "admin-user"
      passwordKey    = "admin-password"
    }

    # No Ingress. Same reasoning as the Trino Ingress: this stack has no TLS, and
    # Grafana would be a second unauthenticated-by-default surface if exposed.
    # Reach it with `make grafana`.
    service = {
      type = "ClusterIP"
    }

    persistence = {
      enabled          = true
      size             = var.grafana_persistence_size
      storageClassName = var.grafana_storage_class
    }

    datasources = {
      "datasources.yaml" = {
        apiVersion = 1
        datasources = [{
          name      = "Loki"
          type      = "loki"
          access    = "proxy"
          url       = "http://loki.${var.namespace}.svc.cluster.local:3100"
          isDefault = true
          jsonData = {
            # Link log lines to traces later without reprovisioning.
            maxLines = 1000
          }
        }]
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
    # ~100Mi. Provision dashboards through values instead if needed.
    sidecar = {
      dashboards  = { enabled = false }
      datasources = { enabled = false }
    }

    testFramework = {
      enabled = false
    }
  })]

  depends_on = [helm_release.loki]
}
