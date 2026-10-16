#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <project> <cluster> <location> <workload-namespace> <agent-namespace> [evidence-dir]" >&2
}

if [[ $# -lt 5 || $# -gt 6 ]]; then usage; exit 2; fi

project=$1
cluster=$2
location=$3
namespace=$4
agent_namespace=$5
evidence_dir=${6:-"evidence/m1/$(date -u +%Y%m%dT%H%M%SZ)"}
repo_root=$(git rev-parse --show-toplevel)
mkdir -p "$evidence_dir"

active_project=$(gcloud config get-value project 2>/dev/null)
if [[ "$active_project" != "$project" ]]; then
  echo "Refusing to collect evidence: active project is '$active_project', expected '$project'." >&2
  exit 1
fi

gcloud container clusters get-credentials "$cluster" --location "$location" --project "$project" >/dev/null

{
  printf 'collected_at_utc=%s\n' "$(date -u +%FT%TZ)"
  printf 'project=%s\ncluster=%s\nlocation=%s\n' "$project" "$cluster" "$location"
  printf 'context=%s\n' "$(kubectl config current-context)"
  printf 'workload_namespace=%s\nagent_namespace=%s\n' "$namespace" "$agent_namespace"
} > "$evidence_dir/scope.txt"

for repository in celesnity-infra celesnity-core celesnity-web celesnity-agent celesnity-control-plane-web; do
  repository_path="$(dirname "$repo_root")/$repository"
  {
    printf 'repository=%s\n' "$repository"
    git -C "$repository_path" rev-parse HEAD
    git -C "$repository_path" status --short
  } > "$evidence_dir/repository-$repository.txt"
done

"$repo_root/scripts/verify-m1-trust-boundary.sh" > "$evidence_dir/source-verification.txt" 2>&1

kubectl get httproutes.gateway.networking.k8s.io -A -o yaml > "$evidence_dir/http-routes.yaml"
kubectl get services -A -o wide > "$evidence_dir/services.txt"
kubectl -n "$namespace" get deployments,statefulsets,cronjobs,jobs,pods -o wide > "$evidence_dir/workloads.txt"
kubectl -n "$agent_namespace" get deployments,pods,services -o wide > "$evidence_dir/agent-workloads.txt"
kubectl -n "$namespace" get deployment -o json > "$evidence_dir/workload-deployments.json"
kubectl -n "$agent_namespace" get deployment -o json > "$evidence_dir/agent-deployments.json"
kubectl -n "$namespace" get networkpolicy -o yaml > "$evidence_dir/workload-network-policies.yaml"
kubectl -n "$agent_namespace" get networkpolicy -o yaml > "$evidence_dir/agent-network-policies.yaml"
kubectl -n "$namespace" get serviceaccount -o yaml > "$evidence_dir/workload-service-accounts.yaml"
kubectl -n "$agent_namespace" get serviceaccount -o yaml > "$evidence_dir/agent-service-accounts.yaml"
kubectl get secret -A -o name | rg '(agent-service-token|api-bearer)' > "$evidence_dir/forbidden-secret-names.txt" || true

if [[ -s "$evidence_dir/forbidden-secret-names.txt" ]]; then
  echo "Forbidden legacy secret names remain; evidence collection failed." >&2
  exit 1
fi

(cd "$evidence_dir" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS)
echo "Evidence bundle: $evidence_dir"
