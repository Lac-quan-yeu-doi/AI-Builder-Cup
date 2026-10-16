#!/usr/bin/env bash
set -euo pipefail

# Review and run once as a project IAM administrator before importing the four
# application release triggers. Infrastructure builds deliberately use a
# different, more privileged service account.
PROJECT_ID="${PROJECT_ID:-celesnity-minder-platform}"
APPS_BUILD_SA="${APPS_BUILD_SA:-celesnity-apps-cloud-build@${PROJECT_ID}.iam.gserviceaccount.com}"
MEMBER="serviceAccount:${APPS_BUILD_SA}"

if ! gcloud iam service-accounts describe "${APPS_BUILD_SA}" \
  --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create celesnity-apps-cloud-build \
    --project "${PROJECT_ID}" \
    --display-name "Celesnity production application builds"
fi

ROLES=(
  roles/artifactregistry.writer
  roles/container.developer
  roles/compute.viewer
  roles/iam.serviceAccountViewer
  roles/secretmanager.secretAccessor
  roles/logging.logWriter
)

for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "${MEMBER}" \
    --role "${role}" \
    --condition=None
done
