#!/usr/bin/env bash
set -euo pipefail

# Shared infrastructure-build bootstrap. Review and run this as a project IAM
# administrator. It is not invoked by Cloud Build.
PROJECT_ID="${PROJECT_ID:-celesnity-minder-platform}"
INFRA_BUILD_SA="${INFRA_BUILD_SA:-celesnity-infra-cloud-build@${PROJECT_ID}.iam.gserviceaccount.com}"
INFRA_BUILD_DISPLAY_NAME="${INFRA_BUILD_DISPLAY_NAME:-Celesnity production infrastructure builds}"
MEMBER="serviceAccount:${INFRA_BUILD_SA}"

# Cloud Build must exist before its v2 repository connection and trigger can be
# inspected or imported. The remaining APIs are used by the first Terraform
# apply; enabling them here avoids a partially initialized production project.
gcloud services enable \
  apikeys.googleapis.com \
  artifactregistry.googleapis.com \
  certificatemanager.googleapis.com \
  cloudbuild.googleapis.com \
  cloudkms.googleapis.com \
  cloudresourcemanager.googleapis.com \
  compute.googleapis.com \
  container.googleapis.com \
  iam.googleapis.com \
  identitytoolkit.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  secretmanager.googleapis.com \
  servicenetworking.googleapis.com \
  serviceusage.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  --project "${PROJECT_ID}"

if ! gcloud iam service-accounts describe "${INFRA_BUILD_SA}" \
  --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create celesnity-infra-cloud-build \
    --project "${PROJECT_ID}" \
    --display-name "${INFRA_BUILD_DISPLAY_NAME}"
fi

ROLES=(
  roles/artifactregistry.admin
  roles/certificatemanager.editor
  roles/cloudkms.admin
  roles/cloudsql.admin
  roles/compute.networkAdmin
  roles/compute.securityAdmin
  roles/container.admin
  roles/firebase.admin
  roles/iam.roleAdmin
  roles/iam.serviceAccountAdmin
  roles/iam.serviceAccountUser
  roles/identityplatform.admin
  roles/logging.admin
  roles/monitoring.editor
  roles/resourcemanager.projectIamAdmin
  roles/secretmanager.admin
  roles/servicenetworking.networksAdmin
  roles/serviceusage.apiKeysAdmin
  roles/serviceusage.serviceUsageAdmin
  roles/storage.admin
  roles/storage.hmacKeyAdmin
)

for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "${MEMBER}" \
    --role "${role}" \
    --condition=None
done

# Required when a Cloud Build trigger uses an explicit service account.
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "${MEMBER}" \
  --role roles/logging.logWriter \
  --condition=None
