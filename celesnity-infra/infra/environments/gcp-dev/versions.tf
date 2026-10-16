terraform {
  required_version = ">= 1.10.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.43"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.2"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.38"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
    # Generates the self-signed certificate for the Trino HTTPS listener.
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.1"
    }
  }

  # Cloud Build supplies the environment-specific bucket and prefix. Development
  # state contains generated database and service credentials, so it must use the
  # same remote, versioned, locked-state boundary as production.
  backend "gcs" {}
}
