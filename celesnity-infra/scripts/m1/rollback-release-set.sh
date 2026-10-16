#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage:
  rollback-release-set.sh <plan|execute> <core-image@sha256:...> <web-image@sha256:...> <agent-image@sha256:...> [evidence-directory]

Environment:
  CELESNITY_NAMESPACE  Application namespace (default: celesnity)
  AGENT_NAMESPACE      Agent namespace (default: minder)
  ROLLBACK_CONFIRM     Required for execute; must equal the current kubectl context

The database migration is intentionally not rolled back. This command never
restores anonymous or static-token authentication.
USAGE
  exit 2
}

mode="${1:-}"
core_image="${2:-}"
web_image="${3:-}"
agent_image="${4:-}"
evidence_directory="${5:-}"
application_namespace="${CELESNITY_NAMESPACE:-celesnity}"
agent_namespace="${AGENT_NAMESPACE:-minder}"

[[ "$mode" == "plan" || "$mode" == "execute" ]] || usage
[[ -n "$core_image" && -n "$web_image" && -n "$agent_image" ]] || usage

for image in "$core_image" "$web_image" "$agent_image"; do
  if [[ ! "$image" =~ @sha256:[0-9a-f]{64}$ ]]; then
    echo "ERROR: rollback images must be immutable @sha256 references: $image" >&2
    exit 2
  fi
done

for command_name in kubectl date find sort; do
  command -v "$command_name" >/dev/null || {
    echo "ERROR: required command is unavailable: $command_name" >&2
    exit 1
  }
done

if command -v sha256sum >/dev/null; then
  checksum_command=(sha256sum)
elif command -v shasum >/dev/null; then
  checksum_command=(shasum -a 256)
else
  echo "ERROR: sha256sum or shasum is required" >&2
  exit 1
fi

context="$(kubectl config current-context)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -z "$evidence_directory" ]]; then
  evidence_directory="m1-evidence/rollback-${timestamp}"
fi
mkdir -p "$evidence_directory"

record_state() {
  local label="$1"
  kubectl -n "$application_namespace" get deployment \
    celesnity-core celesnity-core-worker celesnity-web -o json \
    >"${evidence_directory}/${label}-application-deployments.json"
  kubectl -n "$agent_namespace" get deployment minder-serve -o json \
    >"${evidence_directory}/${label}-agent-deployment.json"
  kubectl get httproutes.gateway.networking.k8s.io -A -o json \
    >"${evidence_directory}/${label}-http-routes.json"
}

cat >"${evidence_directory}/rollback-inputs.txt" <<EOF
timestamp=${timestamp}
kubectl_context=${context}
mode=${mode}
application_namespace=${application_namespace}
agent_namespace=${agent_namespace}
core_image=${core_image}
web_image=${web_image}
agent_image=${agent_image}
database_migration_rollback=prohibited
static_authentication_restore=prohibited
EOF

record_state before

kubectl -n "$application_namespace" set image deployment/celesnity-core \
  "api=${core_image}" --dry-run=server -o yaml \
  >"${evidence_directory}/planned-core.yaml"
kubectl -n "$application_namespace" set image deployment/celesnity-core-worker \
  "worker=${core_image}" --dry-run=server -o yaml \
  >"${evidence_directory}/planned-core-worker.yaml"
kubectl -n "$application_namespace" set image deployment/celesnity-web \
  "web=${web_image}" --dry-run=server -o yaml \
  >"${evidence_directory}/planned-web.yaml"
kubectl -n "$agent_namespace" set image deployment/minder-serve \
  "minder-serve=${agent_image}" --dry-run=server -o yaml \
  >"${evidence_directory}/planned-agent.yaml"

if [[ "$mode" == "execute" ]]; then
  if [[ "${ROLLBACK_CONFIRM:-}" != "$context" ]]; then
    echo "ERROR: set ROLLBACK_CONFIRM exactly to the current context: $context" >&2
    exit 2
  fi

  # Update the release set before waiting so Web/Core/Agent converge within the
  # same controlled window rather than leaving a deliberately mixed contract.
  kubectl -n "$agent_namespace" set image deployment/minder-serve "minder-serve=${agent_image}"
  kubectl -n "$application_namespace" set image deployment/celesnity-core "api=${core_image}"
  kubectl -n "$application_namespace" set image deployment/celesnity-core-worker "worker=${core_image}"
  kubectl -n "$application_namespace" set image deployment/celesnity-web "web=${web_image}"

  kubectl -n "$agent_namespace" rollout status deployment/minder-serve --timeout=10m
  kubectl -n "$application_namespace" rollout status deployment/celesnity-core --timeout=10m
  kubectl -n "$application_namespace" rollout status deployment/celesnity-core-worker --timeout=10m
  kubectl -n "$application_namespace" rollout status deployment/celesnity-web --timeout=10m
  record_state after
fi

(
  cd "$evidence_directory"
  find . -maxdepth 1 -type f ! -name SHA256SUMS -print \
    | sort \
    | while IFS= read -r evidence_file; do
        "${checksum_command[@]}" "$evidence_file"
      done >SHA256SUMS
)

echo "PASS: rollback ${mode} completed for context ${context}"
echo "Evidence: ${evidence_directory}"
if [[ "$mode" == "plan" ]]; then
  echo "No workload was changed. Review and sign the evidence before execute mode."
fi
