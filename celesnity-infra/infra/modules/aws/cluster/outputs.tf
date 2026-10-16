output "cluster_name" {
  description = "EKS cluster name."
  value       = aws_eks_cluster.this.name
}

output "cluster_version" {
  description = "Running Kubernetes version."
  value       = aws_eks_cluster.this.version
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint."
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_ca_certificate" {
  description = "Base64-encoded cluster CA, for provider configuration."
  value       = aws_eks_cluster.this.certificate_authority[0].data
}

output "cluster_security_group_id" {
  description = "EKS-managed cluster security group, carried by every node. Reference it to allow database access."
  value       = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

output "pod_identity_assume_role_policy" {
  description = <<-EOT
    Trust policy JSON for any role that pods assume through EKS Pod Identity.
    Identical for every role, which is the point: scoping happens in the
    aws_eks_pod_identity_association, not here.
  EOT
  value       = data.aws_iam_policy_document.pod_identity_assume.json
}

output "node_group_name" {
  description = "Managed node group name."
  value       = aws_eks_node_group.default.node_group_name
}

output "node_role_arn" {
  description = "IAM role assumed by worker nodes."
  value       = aws_iam_role.node.arn
}

output "addons_ready" {
  description = <<-EOT
    Depend on this to sequence Kubernetes resources after the cluster is usable.
    CoreDNS is the last addon to converge, so anything needing in-cluster DNS
    (the catalog bootstrap Job, Helm releases) should wait on it.
  EOT
  value = [
    aws_eks_addon.coredns.id,
    aws_eks_addon.ebs_csi.id,
    # Pods cannot obtain AWS credentials until this is Ready.
    aws_eks_addon.pod_identity_agent.id,
  ]
}
