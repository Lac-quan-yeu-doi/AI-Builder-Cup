########################################
# AWS Load Balancer Controller
#
# Watches Ingress resources and provisions ALBs. Without it, a Service of type
# LoadBalancer falls back to the legacy in-tree provider and yields a Classic or
# Network Load Balancer instead of an ALB.
#
# Cost note: every Ingress with its own ALB is a separate ~$16.43/month charge
# plus LCUs plus $3.65/month per public IPv4 (an ALB uses one per AZ). Route
# multiple services through a single shared Ingress via
# alb.ingress.kubernetes.io/group.name rather than creating one ALB per service.
########################################

resource "helm_release" "alb_controller" {
  count = var.install_alb_controller ? 1 : 0

  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.alb_controller_chart_version
  namespace  = "kube-system"

  # The controller mutates Ingress state in AWS; let Helm settle before
  # dependent Ingress resources are reconciled.
  wait    = true
  timeout = 600

  values = [yamlencode({
    clusterName = var.cluster_name

    region = var.region
    vpcId  = var.vpc_id

    # No role-arn annotation: the pod identity association binds this
    # ServiceAccount to the IAM role from the EKS side.
    serviceAccount = {
      create = true
      name   = local.alb_service_account
    }

    # Two replicas is the chart default. On a four-node t4g.medium cluster the
    # memory is better spent on Trino, and a brief controller outage only delays
    # Ingress reconciliation.
    replicaCount = 1

    resources = {
      requests = {
        cpu    = "50m"
        memory = "96Mi"
      }
      limits = {
        memory = "192Mi"
      }
    }
  })]

  depends_on = [
    aws_iam_role_policy_attachment.alb_controller,
    # Without the association in place first, the controller starts, fails to get
    # credentials, and crash-loops until the next reconcile.
    aws_eks_pod_identity_association.alb_controller,
    terraform_data.cluster_ready,
  ]
}
