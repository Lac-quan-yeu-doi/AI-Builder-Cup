terraform {
  required_providers {
    google     = { source = "hashicorp/google" }
    helm       = { source = "hashicorp/helm" }
    kubernetes = { source = "hashicorp/kubernetes" }
    random     = { source = "hashicorp/random" }
    tls        = { source = "hashicorp/tls" }
  }
}
