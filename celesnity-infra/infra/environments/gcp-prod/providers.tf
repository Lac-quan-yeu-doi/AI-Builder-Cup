provider "google" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true

  default_labels = local.labels
}

# The Kubernetes and Helm providers authenticate with a short-lived OAuth token
# from the google provider's own credentials, rather than shelling out to gcloud.
# That keeps a single credential source and avoids depending on gcloud being on
# PATH — the GCP equivalent of `aws eks get-token` without the subprocess.
data "google_client_config" "current" {}

# On a first apply from empty state these providers cannot reach a cluster that
# does not exist yet. Create the infrastructure first, then the rest:
#
#   terraform apply -target=module.network -target=module.cluster -target=module.data
#   terraform apply
#
# `make infra-apply CLOUD=gcp` does both steps.
provider "kubernetes" {
  host                   = "https://${module.cluster.cluster_endpoint}"
  cluster_ca_certificate = base64decode(module.cluster.cluster_ca_certificate)
  token                  = data.google_client_config.current.access_token
}

# Note: the Helm provider v3 takes `kubernetes` as a nested attribute (`= {`),
# unlike the Kubernetes provider which still uses a block.
provider "helm" {
  kubernetes = {
    host                   = "https://${module.cluster.cluster_endpoint}"
    cluster_ca_certificate = base64decode(module.cluster.cluster_ca_certificate)
    token                  = data.google_client_config.current.access_token
  }
}
