########################################
# Namespace, credentials, and storage config
#
# These are the contract between Terraform and the Kubernetes manifests in
# deploy/. The manifests reference them by the names produced here, so renaming
# anything below requires the corresponding change in deploy/base.
########################################

resource "kubernetes_namespace_v1" "workload" {
  metadata {
    name = var.namespace
  }

  depends_on = [terraform_data.cluster_ready]
}

# Reading the RDS-managed secret places the plaintext password in Terraform
# state. That is the tradeoff for a single-apply bootstrap.
data "aws_secretsmanager_secret_version" "database" {
  secret_id = var.db_secret_arn
}

resource "kubernetes_secret_v1" "database" {
  metadata {
    name      = "celesnity-database"
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }

  data = {
    POSTGRES_HOST     = var.db_address
    POSTGRES_PORT     = tostring(var.db_port)
    POSTGRES_DB       = var.db_name
    POSTGRES_USER     = var.db_username
    POSTGRES_PASSWORD = jsondecode(data.aws_secretsmanager_secret_version.database.secret_string)["password"]
    POSTGRES_URL      = "jdbc:postgresql://${var.db_address}:${var.db_port}/${var.db_name}"
  }

  type = "Opaque"
}

resource "kubernetes_config_map_v1" "storage" {
  metadata {
    name      = "celesnity-storage"
    namespace = kubernetes_namespace_v1.workload.metadata[0].name
  }

  data = {
    AWS_REGION        = var.region
    WAREHOUSE_BUCKET  = var.warehouse_bucket
    ARTIFACTS_BUCKET  = var.artifacts_bucket
    WAREHOUSE_S3_PATH = "s3://${var.warehouse_bucket}/"
  }
}

# Sequencing handle so every Kubernetes resource here waits on the cluster addons
# without each one repeating the dependency.
resource "terraform_data" "cluster_ready" {
  input = var.cluster_dependencies
}

########################################
# Default gp3 StorageClass
#
# gp3 is about 20% cheaper than gp2 at equivalent performance in every region,
# and includes 3,000 IOPS and 125 MB/s at no extra charge.
########################################

resource "kubernetes_storage_class_v1" "gp3" {
  count = var.default_storage_class ? 1 : 0

  metadata {
    name = "gp3"

    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }

  storage_provisioner    = "ebs.csi.aws.com"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true
  reclaim_policy         = "Delete"

  parameters = {
    type      = "gp3"
    encrypted = "true"
  }

  depends_on = [terraform_data.cluster_ready]
}
