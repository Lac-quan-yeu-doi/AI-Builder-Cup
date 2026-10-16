output "project_id" {
  description = "GCP project this environment is deployed to."
  value       = var.project_id
}

output "identity_platform_tenant_id" {
  description = "Bootstrap Identity Platform tenant ID; applications resolve organization tenants dynamically."
  value       = module.identity.tenant_id
}

output "identity_platform_browser_api_key" {
  description = "Inject into Web IDENTITY_PLATFORM_API_KEY. Sensitive to prevent accidental build-log disclosure."
  value       = module.identity.browser_api_key
  sensitive   = true
}

output "identity_platform_browser_api_key_id" {
  description = "API Keys API resource ID used to rotate and audit the browser key."
  value       = module.identity.browser_api_key_id
}

output "identity_platform_tenant_id_secret_id" {
  description = "Secret Manager ID read by Core and Web deployment pipelines."
  value       = module.identity.tenant_id_secret_id
}

output "authorization_bootstrap_secret_ids" {
  description = "Terraform-managed Secret Manager containers; approved versions are supplied separately."
  value       = module.authorization_bootstrap_secrets.bootstrap_secret_ids
}

output "identity_platform_browser_api_key_secret_id" {
  description = "Secret Manager ID read by the Web deployment pipeline."
  value       = module.identity.browser_api_key_secret_id
}

output "region" {
  description = "GCP region. Read by `make image-push`."
  value       = var.region
}

output "cluster_name" {
  description = "GKE cluster name."
  value       = module.cluster.cluster_name
}

output "cluster_version" {
  description = "Running Kubernetes version, chosen by the release channel."
  value       = module.cluster.cluster_version
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint."
  value       = module.cluster.cluster_endpoint
}

output "kubeconfig_command" {
  description = "Command to point kubectl at this cluster."
  value       = module.cluster.kubeconfig_command
}

output "node_location" {
  description = "Zone for a zonal cluster, region for a regional one."
  value       = module.cluster.cluster_location
}

output "network_name" {
  description = "VPC network name."
  value       = module.network.network_name
}

output "egress_mode" {
  description = "How private nodes reach the internet."
  value       = module.network.egress_description
}

output "database_private_ip" {
  description = "Cloud SQL private IP, reachable only from inside the VPC."
  value       = module.data.db_private_ip
}

output "database_password_secret" {
  description = "Secret Manager secret holding the Cloud SQL password."
  value       = module.data.db_password_secret_id
}

output "warehouse_bucket" {
  description = "GCS bucket backing the Iceberg warehouse."
  value       = module.data.warehouse_bucket
}

output "artifacts_bucket" {
  description = "GCS bucket for job scripts and execution output."
  value       = module.data.artifacts_bucket
}

output "workload_namespace" {
  description = "Namespace holding the Trino and Spark workloads."
  value       = module.platform.namespace
}

output "workload_service_account" {
  description = "Deprecated compatibility name for the Spark runtime KSA; workloads use dedicated service accounts."
  value       = module.platform.service_account
}

output "workload_google_service_account" {
  description = "Dedicated Google service account used only to issue Core's GCS HMAC key."
  value       = module.platform.workload_service_account_email
}

output "spark_repository" {
  description = "Artifact Registry path for the Spark image, without the tag."
  value       = module.data.spark_repository
}

output "redpanda_bootstrap_brokers" {
  description = "Internal Kafka-compatible bootstrap address."
  value       = module.streaming.bootstrap_brokers
}

output "mqtt_endpoint" {
  description = "Managed MQTTS endpoint issued to device publishers."
  value       = module.streaming.mqtt_endpoint
}

output "mqtt_load_balancer_ip" {
  description = "Create an A record for mqtt_hostname pointing at this address."
  value       = module.streaming.mqtt_load_balancer_ip
}

output "ftps_endpoint" {
  description = "External explicit-FTPS endpoint. Configure FileZilla for explicit TLS and passive mode."
  value       = module.ftps.endpoint
}

output "ftps_ingress_bucket" {
  description = "Dedicated GCS bucket holding FTPS-uploaded objects."
  value       = module.ftps.ingress_bucket
}

output "ftps_google_service_account" {
  description = "Google service account SFTPGo impersonates through Workload Identity."
  value       = module.ftps.google_service_account_email
}

output "ftps_load_balancer_ip" {
  description = "Shared MQTT/FTPS static IP. Point the Cloudflare DNS-only FTPS hostname here after apply."
  value       = module.streaming.mqtt_load_balancer_ip
}

output "mqtt_certificate_map" {
  description = "Certificate Manager map used by the MQTT SSL proxy."
  value       = module.streaming.mqtt_certificate_map
}

output "spark_image_push_commands" {
  description = <<-EOT
    Build and push the Spark image. e2 machines are x86_64, so this builds amd64 —
    the opposite of the AWS build, where Graviton nodes required arm64.
  EOT

  value = trimspace(<<-EOT
    gcloud auth configure-docker ${var.region}-docker.pkg.dev --quiet

    docker buildx build --platform linux/amd64 \
      --tag ${module.data.spark_repository}:3.5.7-iceberg-1.11.0 \
      --push ../../../images/spark
  EOT
  )
}

output "apps_repository" {
  description = <<-EOT
    Artifact Registry repository for the application images. Cloud Build in
    celesnity-core and celesnity-web appends the image name, so this is what their
    _AR_REPO substitution should be set to.
  EOT

  value = module.data.apps_repository
}

output "apps_cloud_build_setup" {
  description = <<-EOT
    One-time grants for the Cloud Build service account behind the celesnity-core,
    celesnity-web, and control-plane-web triggers. Substitute the account these triggers actually run
    as; a trigger created without an explicit service account uses the legacy
    <project-number>@cloudbuild.gserviceaccount.com.
  EOT

  value = trimspace(<<-EOT
    SA=<cloud-build-service-account-email>

    # Push application images.
    gcloud artifacts repositories add-iam-policy-binding ${module.data.apps_repository_id} \
      --location ${var.region} --project ${var.project_id} \
      --member "serviceAccount:$SA" --role roles/artifactregistry.writer

    # Read the cluster endpoint and apply manifests. container.developer covers both.
    gcloud projects add-iam-policy-binding ${var.project_id} \
      --member "serviceAccount:$SA" --role roles/container.developer

    # Resolve the GKE-managed backend service ID used as the IAP signed-header
    # audience, and validate the dedicated Workload Identity service account.
    gcloud projects add-iam-policy-binding ${var.project_id} \
      --member "serviceAccount:$SA" --role roles/compute.viewer
    gcloud projects add-iam-policy-binding ${var.project_id} \
      --member "serviceAccount:$SA" --role roles/iam.serviceAccountViewer

    # Read the runtime secrets the core pipeline injects into its Secret manifest.
    gcloud projects add-iam-policy-binding ${var.project_id} \
      --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor

    # Write build logs. Required whenever a trigger names its own service account.
    gcloud projects add-iam-policy-binding ${var.project_id} \
      --member "serviceAccount:$SA" --role roles/logging.logWriter
  EOT
  )
}

output "apps_runtime_secrets" {
  description = <<-EOT
    Secret Manager secrets the celesnity-core and minder-agent pipelines read at deploy time. The
    application talks to GCS through the MinIO S3 client, so it needs HMAC
    credentials rather than the Workload Identity binding Trino and Spark use.
  EOT

  value = trimspace(<<-EOT
    # 1. Connection credential keyring. 32 raw bytes, base64, prefixed with a version.
    printf 'v1:%s' "$(openssl rand -base64 32)" \
      | gcloud secrets create ${var.environment}-core-credential-keys \
          --project ${var.project_id} --data-file=- \
          --replication-policy automatic

    # 2. GCS HMAC key for the workload service account, used as MINIO_ACCESS_KEY /
    #    MINIO_SECRET_KEY against https://storage.googleapis.com.
    gcloud storage hmac create ${module.platform.workload_service_account_email} \
      --project ${var.project_id} --format json > /tmp/hmac.json

    jq -r .metadata.accessId /tmp/hmac.json \
      | gcloud secrets create ${var.environment}-gcs-hmac-access-key \
          --project ${var.project_id} --data-file=- --replication-policy automatic

    jq -r .secret /tmp/hmac.json \
      | gcloud secrets create ${var.environment}-gcs-hmac-secret-key \
          --project ${var.project_id} --data-file=- --replication-policy automatic

    rm -f /tmp/hmac.json

    # 3. External FTPS client password. This is the same password provisioned
    #    for ftps-demo-user in the deployed SFTPGo instance and is read by Core
    #    only to render the connector details for the Web UI.
    openssl rand -base64 32 \
      | tr -d '\r\n' \
      | gcloud secrets create ${var.environment}-ftps-demo-password \
          --project ${var.project_id} --data-file=- --replication-policy automatic

    # 4. SFTPGo REST status-reader password. Provision this for the
    #    ftps-status-monitor identity with view-connections-only access.
    openssl rand -base64 32 \
      | tr -d '\r\n' \
      | gcloud secrets create ${var.environment}-ftps-status-password \
          --project ${var.project_id} --data-file=- --replication-policy automatic

    # 5. HMAC key used only to pseudonymize IP addresses in append-only audit events.
    openssl rand -base64 48 \
      | gcloud secrets create ${var.environment}-audit-hash-key \
          --project ${var.project_id} --data-file=- --replication-policy automatic

    # 6. Public RFC 8032 development test key used by devices and the legacy
    #    release verifier. Never reuse this key outside development.
    printf '%s' 'local-dev:11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=' \
      | gcloud secrets create ${var.environment}-firmware-signing-public-keys \
          --project ${var.project_id} --data-file=- --replication-policy automatic

    # 7. Ed25519 key pair used by Core/Minder principal assertions. Keep the
    #    private key in Secret Manager; Minder receives only the matching public
    #    key set. Reuse an existing private key so backfilling the public secret
    #    never breaks assertions already issued by Core.
    ASSERTION_PRIVATE_SECRET="${var.environment}-minder-assertion-private-key"
    ASSERTION_PUBLIC_SECRET="${var.environment}-minder-assertion-public-keys-json"
    ASSERTION_KEY_ID="celesnity-dev-assertion-v1"
    ASSERTION_TMP="$(mktemp -d)"
    trap 'rm -rf "$ASSERTION_TMP"' EXIT

    if gcloud secrets describe "$ASSERTION_PRIVATE_SECRET" --project ${var.project_id} >/dev/null 2>&1; then
      gcloud secrets versions access latest \
        --secret="$ASSERTION_PRIVATE_SECRET" --project ${var.project_id} \
        > "$ASSERTION_TMP/private.pem"
    else
      openssl genpkey -algorithm ED25519 -out "$ASSERTION_TMP/private.pem"
      gcloud secrets create "$ASSERTION_PRIVATE_SECRET" \
        --project ${var.project_id} --data-file="$ASSERTION_TMP/private.pem" \
        --replication-policy automatic
    fi

    openssl pkey -in "$ASSERTION_TMP/private.pem" -pubout \
      -out "$ASSERTION_TMP/public.pem"
    jq -n --arg kid "$ASSERTION_KEY_ID" --rawfile pem "$ASSERTION_TMP/public.pem" \
      '{($kid): $pem}' > "$ASSERTION_TMP/public.json"
    if gcloud secrets describe "$ASSERTION_PUBLIC_SECRET" --project ${var.project_id} >/dev/null 2>&1; then
      gcloud secrets versions add "$ASSERTION_PUBLIC_SECRET" \
        --project ${var.project_id} --data-file="$ASSERTION_TMP/public.json"
    else
      gcloud secrets create "$ASSERTION_PUBLIC_SECRET" \
        --project ${var.project_id} --data-file="$ASSERTION_TMP/public.json" \
        --replication-policy automatic
    fi

    # 8. Matching development-only seed used by Celesnity-managed signing.
    printf '%s' 'nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=' \
      | gcloud secrets create ${var.environment}-firmware-signing-private-key \
          --project ${var.project_id} --data-file=- --replication-policy automatic

  EOT
  )
}

output "monitoring_namespace" {
  description = "Namespace holding Alloy, Loki, and Grafana."
  value       = var.install_observability ? module.observability[0].namespace : null
}

output "loki_bucket" {
  description = "GCS bucket backing Loki chunks and index."
  value       = var.install_observability ? module.observability[0].loki_bucket : null
}

output "grafana_admin_password_command" {
  description = "Read the generated Grafana admin password."
  value       = var.install_observability ? module.observability[0].grafana_admin_password_command : null
}

output "grafana_port_forward_command" {
  description = "Reach Grafana without exposing it publicly."
  value       = var.install_observability ? module.observability[0].grafana_port_forward_command : null
}

output "grafana_url" {
  description = "Public Grafana URL, or null when Grafana is private."
  value       = var.install_observability ? module.observability[0].grafana_url : null
}

output "next_steps" {
  description = "Ordered follow-up after a successful apply."
  value = [
    "1. ${module.cluster.kubeconfig_command}",
    "2. make image-push CLOUD=gcp",
    "3. make deploy CLOUD=gcp",
    "4. kubectl -n ${module.platform.namespace} get pods -w",
  ]
}

output "trino_username" {
  description = "Trino user for client authentication."
  value       = module.platform.trino_username
}

output "agent_workload_identity" {
  description = "Agent Workload Identity values to place in Core and agent deployment configuration."
  value = {
    service_account_email = module.platform.agent_service_account_email
    kubernetes            = module.platform.agent_kubernetes_service_account
    core_audience         = "http://celesnity-core.${var.workload_namespace}.svc.cluster.local:3001"
  }
}

output "trino_secret_manager_versions" {
  description = "Pinned Secret Manager references for Trino credentials and TLS."
  value       = module.platform.trino_secret_manager_versions
}

output "trino_connect_command" {
  description = "How to reach the authenticated Trino coordinator over TLS."
  value       = module.platform.trino_connect_command
}

output "trino_lb_address" {
  description = "External address of the Trino load balancer, or null when disabled."
  value       = module.platform.trino_lb_address
}

output "trino_lb_source_restriction" {
  description = "Whether Cloud Armor restricts who can reach the load balancer."
  value       = module.platform.trino_lb_source_restriction
}

output "trino_lb_connect_command" {
  description = "How to reach Trino through the load balancer. Takes several minutes to provision."
  value       = module.platform.trino_lb_connect_command
}

output "trino_lb_tls_mode" {
  description = "Which certificate the load balancer serves, and whether clients can verify it."
  value       = module.platform.trino_lb_tls_mode
}

output "trino_lb_certificate_map" {
  description = "Certificate map attached to the Gateway, or null when serving the self-signed fallback."
  value       = module.platform.trino_lb_certificate_map
}
