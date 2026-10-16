########################################
# Namespace, credentials, and storage config
#
# These are the contract between Terraform and the manifests in deploy/. The
# names match the AWS build exactly — celesnity-database and celesnity-storage —
# so deploy/base is genuinely cloud-neutral and only the overlay differs.
########################################

resource "kubernetes_namespace_v1" "workload" {
  metadata {
    name = var.namespace

    labels = {
      # Opt-in marker for the shared Gateway. Its listener admits routes only from
      # namespaces carrying this label rather than from All, so adding a namespace
      # to the cluster does not implicitly grant it the ability to publish itself
      # on the internet through the shared load balancer.
      "celesnity.io/gateway-access" = "true"
    }
  }

  depends_on = [terraform_data.cluster_ready]
}

resource "kubernetes_secret_v1" "database" {
  metadata {
    name      = "celesnity-database"
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }

  data = {
    POSTGRES_HOST     = var.db_host
    POSTGRES_PORT     = tostring(var.db_port)
    POSTGRES_DB       = var.db_name
    POSTGRES_USER     = var.db_username
    POSTGRES_PASSWORD = var.db_password
    POSTGRES_URL      = "jdbc:postgresql://${var.db_host}:${var.db_port}/${var.db_name}"
    POSTGRES_CA_CERT  = var.db_server_ca_cert
  }

  type = "Opaque"
}

# Same ConfigMap name and the same WAREHOUSE_S3_PATH key as the AWS build, so the
# Trino and Spark manifests need no changes. The value is a gs:// URI rather than
# s3://; the key name is kept for compatibility rather than accuracy.
resource "kubernetes_config_map_v1" "storage" {
  metadata {
    name      = "celesnity-storage"
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }

  data = {
    GCP_PROJECT_ID    = var.project_id
    GCP_REGION        = var.region
    WAREHOUSE_BUCKET  = var.warehouse_bucket
    ARTIFACTS_BUCKET  = var.artifacts_bucket
    WAREHOUSE_S3_PATH = "gs://${var.warehouse_bucket}/"
  }
}

# Sequencing handle so every Kubernetes resource waits on the node pool without
# each one repeating the dependency.
resource "terraform_data" "cluster_ready" {
  input = var.cluster_dependencies
}

########################################
# Optional StorageClass override
#
# GKE already provides a default ("standard-rwo", backed by pd-balanced), unlike
# EKS which ships none with the EBS CSI addon. This exists only to override it.
########################################

resource "kubernetes_storage_class_v1" "pd_balanced" {
  count = var.default_storage_class ? 1 : 0

  metadata {
    name = "celesnity-pd-balanced"

    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }

  storage_provisioner    = "pd.csi.storage.gke.io"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true
  reclaim_policy         = "Delete"

  parameters = {
    type = "pd-balanced"
  }

  depends_on = [terraform_data.cluster_ready]
}
