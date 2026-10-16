#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Keep development and production on the same API and IAM contract. The shared
# bootstrap is idempotent, so rerun it whenever infrastructure modules require
# a new Google API or Cloud Build permission.
export PROJECT_ID="${PROJECT_ID:-cosmos3-mmad-research}"
export INFRA_BUILD_SA="${INFRA_BUILD_SA:-celesnity-infra-cloud-build@${PROJECT_ID}.iam.gserviceaccount.com}"
export INFRA_BUILD_DISPLAY_NAME="${INFRA_BUILD_DISPLAY_NAME:-Celesnity development infrastructure builds}"

exec "${SCRIPT_DIRECTORY}/../gcp-prod/cloudbuild-setup.sh"
