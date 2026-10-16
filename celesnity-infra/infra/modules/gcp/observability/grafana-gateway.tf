locals {
  publish_grafana = var.install_grafana && var.grafana_hostname != ""
}

# Grafana owns its route and backend policies. The Gateway itself remains in the
# workload namespace and is shared with Trino and the application services.
resource "kubernetes_manifest" "grafana_http_route" {
  count = local.publish_grafana ? 1 : 0

  manifest = {
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "HTTPRoute"
    metadata = {
      name      = "grafana"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      parentRefs = [{
        name        = var.grafana_gateway_name
        namespace   = var.grafana_gateway_namespace
        sectionName = "https"
      }]
      hostnames = [var.grafana_hostname]
      rules = [{
        backendRefs = [{
          name = "grafana"
          port = 80
        }]
      }]
    }
  }

  depends_on = [helm_release.grafana]
}

resource "kubernetes_manifest" "grafana_health_check" {
  count = local.publish_grafana ? 1 : 0

  manifest = {
    apiVersion = "networking.gke.io/v1"
    kind       = "HealthCheckPolicy"
    metadata = {
      name      = "grafana"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      default = {
        checkIntervalSec   = 15
        timeoutSec         = 5
        healthyThreshold   = 1
        unhealthyThreshold = 3
        config = {
          type = "HTTP"
          httpHealthCheck = {
            port        = 3000
            requestPath = "/api/health"
          }
        }
      }
      targetRef = {
        group = ""
        kind  = "Service"
        name  = "grafana"
      }
    }
  }

  depends_on = [helm_release.grafana]
}

resource "kubernetes_manifest" "grafana_backend_policy" {
  count = local.publish_grafana ? 1 : 0

  manifest = {
    apiVersion = "networking.gke.io/v1"
    kind       = "GCPBackendPolicy"
    metadata = {
      name      = "grafana"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      default = {
        securityPolicy = var.grafana_security_policy_name
        timeoutSec     = 300
        connectionDraining = {
          drainingTimeoutSec = 30
        }
      }
      targetRef = {
        group = ""
        kind  = "Service"
        name  = "grafana"
      }
    }
  }

  depends_on = [helm_release.grafana]
}
