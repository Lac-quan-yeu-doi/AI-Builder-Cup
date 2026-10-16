variable "name" {
  description = "Name prefix for IAM resources created here."
  type        = string
}

variable "region" {
  description = "AWS region, passed to the ALB controller and exposed to workloads."
  type        = string
}

variable "namespace" {
  description = "Namespace the Trino and Spark workloads run in."
  type        = string
  default     = "celesnity"
}

variable "service_account_name" {
  description = "ServiceAccount that Trino and Spark pods run as, bound to an IAM role by a pod identity association."
  type        = string
  default     = "celesnity"
}

########################################
# Cluster wiring
########################################

variable "cluster_name" {
  description = "EKS cluster name, required by the ALB controller."
  type        = string
}

variable "vpc_id" {
  description = "VPC the ALB controller provisions load balancers in."
  type        = string
}

variable "pod_identity_assume_role_policy" {
  description = <<-EOT
    Trust policy JSON for roles assumed via EKS Pod Identity, from the cluster
    module. The same document for every role; scoping is done by the
    aws_eks_pod_identity_association, not the trust policy.
  EOT
  type        = string
}

variable "cluster_dependencies" {
  description = <<-EOT
    Opaque values to sequence against. Pass the cluster module's addons_ready:
    the bootstrap Job and the Helm release both need CoreDNS resolving first.
  EOT
  type        = list(string)
  default     = []
}

########################################
# Data plane wiring
########################################

variable "db_address" {
  description = "RDS hostname."
  type        = string
}

variable "db_port" {
  description = "RDS port."
  type        = number
}

variable "db_name" {
  description = "Database name."
  type        = string
}

variable "db_username" {
  description = "Database username."
  type        = string
}

variable "db_secret_arn" {
  description = <<-EOT
    Secrets Manager ARN for the RDS master credentials. This module reads it to
    build a Kubernetes Secret, which places the plaintext password in Terraform
    state. Use an encrypted backend, or replace this with the External Secrets
    Operator pointed at the same ARN.
  EOT
  type        = string
}

variable "warehouse_bucket" {
  description = "Iceberg warehouse bucket name."
  type        = string
}

variable "warehouse_bucket_arn" {
  description = "Iceberg warehouse bucket ARN."
  type        = string
}

variable "artifacts_bucket" {
  description = "Artifacts bucket name."
  type        = string
}

variable "artifacts_bucket_arn" {
  description = "Artifacts bucket ARN."
  type        = string
}

########################################
# Catalog bootstrap
########################################

variable "catalog_bootstrap_sql" {
  description = <<-EOT
    Contents of the Iceberg catalog DDL, passed in rather than read here so the
    module stays independent of repository layout. The caller reads
    config/sql/01-iceberg-catalog.sql, which is the same file the local Compose
    stack applies through docker-entrypoint-initdb.d.
  EOT
  type        = string
}

########################################
# AWS Load Balancer Controller
########################################

variable "install_alb_controller" {
  description = "Install the AWS Load Balancer Controller so Kubernetes Ingress resources provision ALBs."
  type        = bool
  default     = true
}

variable "alb_controller_chart_version" {
  description = "Helm chart version for aws-load-balancer-controller. Chart 3.5.0 ships app v3.5.0."
  type        = string
  default     = "3.5.0"
}

variable "default_storage_class" {
  description = "Create a gp3 StorageClass and mark it default. EKS ships none with the EBS CSI addon."
  type        = bool
  default     = true
}

########################################
# Trino authentication (GDPR Art. 32)
########################################

variable "trino_username" {
  description = "Trino user created in the password file. Clients authenticate as this."
  type        = string
  default     = "celesnity"
}

variable "trino_cert_validity_hours" {
  description = <<-EOT
    Lifetime of the self-signed coordinator certificate. 8760 is one year.

    Expiry is silent: clients using --insecure skip validation, so an expired
    certificate keeps working for them while anything that does validate starts
    failing. Rotate by tainting tls_self_signed_cert.trino.
  EOT
  type        = number
  default     = 8760
}
