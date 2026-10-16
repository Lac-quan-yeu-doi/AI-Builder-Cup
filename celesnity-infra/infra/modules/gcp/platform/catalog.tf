########################################
# Iceberg catalog bootstrap
#
# Locally, config/sql/01-iceberg-catalog.sql runs automatically through
# docker-entrypoint-initdb.d. Neither RDS nor Cloud SQL has an equivalent, so the
# same file is shipped as a ConfigMap and applied once by a Job.
#
# Identical to the AWS module apart from the module path: the SQL is
# vendor-neutral PostgreSQL and the Secret keys are the same.
########################################

resource "kubernetes_config_map_v1" "catalog_bootstrap" {
  metadata {
    name      = "celesnity-catalog-bootstrap"
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }

  data = {
    "01-iceberg-catalog.sql" = var.catalog_bootstrap_sql
  }
}

resource "kubernetes_job_v1" "catalog_bootstrap" {
  metadata {
    generate_name = "celesnity-catalog-bootstrap-"
    namespace     = kubernetes_namespace_v1.workload.metadata[0].name
  }

  spec {
    backoff_limit = 6

    template {
      metadata {
        labels = {
          "app.kubernetes.io/name"      = "catalog-bootstrap"
          "app.kubernetes.io/part-of"   = "celesnity"
          "app.kubernetes.io/component" = "bootstrap"
        }
      }

      spec {
        restart_policy = "OnFailure"

        container {
          name = "psql"
          # Multi-arch image; e2 nodes are x86_64.
          image = "postgres:17.6-alpine"

          command = [
            "sh", "-c",
            # ON_ERROR_STOP makes the Job fail loudly rather than reporting success
            # after a partially applied script. The SQL is idempotent throughout,
            # so retries are safe.
            "psql --variable=ON_ERROR_STOP=1 --file=/sql/01-iceberg-catalog.sql",
          ]

          env {
            name = "PGHOST"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.database.metadata[0].name
                key  = "POSTGRES_HOST"
              }
            }
          }

          env {
            name = "PGPORT"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.database.metadata[0].name
                key  = "POSTGRES_PORT"
              }
            }
          }

          env {
            name = "PGDATABASE"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.database.metadata[0].name
                key  = "POSTGRES_DB"
              }
            }
          }

          env {
            name = "PGUSER"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.database.metadata[0].name
                key  = "POSTGRES_USER"
              }
            }
          }

          env {
            name = "PGPASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.database.metadata[0].name
                key  = "POSTGRES_PASSWORD"
              }
            }
          }

          # Cloud SQL enforces ssl_mode = ENCRYPTED_ONLY. libpq negotiates TLS
          # when this is set; without it the connection is refused.
          env {
            name  = "PGSSLMODE"
            value = "require"
          }

          volume_mount {
            name       = "sql"
            mount_path = "/sql"
            read_only  = true
          }

          resources {
            requests = {
              cpu    = "50m"
              memory = "64Mi"
            }
            limits = {
              memory = "128Mi"
            }
          }
        }

        volume {
          name = "sql"

          config_map {
            name = kubernetes_config_map_v1.catalog_bootstrap.metadata[0].name
          }
        }
      }
    }
  }

  wait_for_completion = true

  timeouts {
    create = "10m"
  }

  depends_on = [
    kubernetes_secret_v1.database,
    terraform_data.cluster_ready,
  ]
}
