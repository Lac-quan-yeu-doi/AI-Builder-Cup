#!/usr/bin/env bash
# Creates the local organization the demos are seeded into, with the
# local-development persona `local-owner` as its owner. Run once per fresh
# Postgres volume, from the repository root, after `docker compose up`.
#
#   bash mock-data/bootstrap-local-org.sh
#
# Why this exists: in local-development auth mode the web sign-in works, but
# Core answers 401 until an organization with an owner membership exists, and
# the bootstrap job records the owner under the `identity-platform` provider
# while local mode looks identities up under `local-development`.
set -euo pipefail

ORG_ID="${BOOTSTRAP_ORGANIZATION_ID:-7d0c2a52-3f1e-4b8a-9c41-5e2f8a6b1d01}"

# The compose file requires these at parse time; their values do not matter here.
export LLM_BASE_URL="${LLM_BASE_URL:-unused}" LLM_API_KEY="${LLM_API_KEY:-unused}"

PSQL=(docker compose exec -T postgres psql -U "${POSTGRES_USER:-celesnity}" -d "${POSTGRES_DB:-celesnity}" -v ON_ERROR_STOP=1)

if [ "$("${PSQL[@]}" -Atc "SELECT count(*) FROM celesnity_app.organizations WHERE id = '$ORG_ID' AND status = 'ACTIVE'")" = "1" ]; then
  echo "Organization $ORG_ID already exists; skipping bootstrap."
else
docker compose run --rm --no-deps -T \
  -e BOOTSTRAP_ORGANIZATION_ID="$ORG_ID" \
  -e BOOTSTRAP_ORGANIZATION_SLUG=local-demo \
  -e BOOTSTRAP_ORGANIZATION_NAME="Local Demo" \
  -e BOOTSTRAP_HOME_REGION=asia-southeast1 \
  -e BOOTSTRAP_IDENTITY_TENANT_ID=local \
  -e BOOTSTRAP_OWNER_SUBJECT=local-owner \
  -e BOOTSTRAP_OWNER_EMAIL=owner@local.celesnity.test \
  celesnity-api node dist/bootstrap/organization-bootstrap-main.js
fi

"${PSQL[@]}" -c \
  "UPDATE celesnity_app.user_identities SET provider = 'local-development'
    WHERE subject = 'local-owner' AND identity_tenant_id = 'local' AND provider = 'identity-platform';"

echo "Organization ready. Sign in at http://localhost:3000 with \"Continue as organization owner\"."
