#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_REPOSITORY="$(cd "${SCRIPT_DIRECTORY}/.." && pwd)"
WORKSPACE_DIRECTORY="$(cd "${INFRA_REPOSITORY}/.." && pwd)"
CORE_REPOSITORY="${WORKSPACE_DIRECTORY}/celesnity-core"
WEB_REPOSITORY="${WORKSPACE_DIRECTORY}/celesnity-web"
AGENT_REPOSITORY="${WORKSPACE_DIRECTORY}/celesnity-agent"
CONTROL_PLANE_REPOSITORY="${WORKSPACE_DIRECTORY}/celesnity-control-plane-web"

for command_name in kubectl rg awk; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "ERROR: required command is unavailable: ${command_name}" >&2
    exit 1
  fi
done

for repository in "${INFRA_REPOSITORY}" "${CORE_REPOSITORY}" "${WEB_REPOSITORY}" "${AGENT_REPOSITORY}" "${CONTROL_PLANE_REPOSITORY}"; do
  if [[ ! -d "${repository}" ]]; then
    echo "ERROR: required repository is unavailable: ${repository}" >&2
    exit 1
  fi
done

RENDER_DIRECTORY="$(mktemp -d)"
trap 'rm -rf "${RENDER_DIRECTORY}"' EXIT

render_overlay() {
  local name="$1"
  local overlay="$2"
  kubectl kustomize "${overlay}" --load-restrictor LoadRestrictionsNone >"${RENDER_DIRECTORY}/${name}.yaml"
}

count_top_level_kind() {
  local manifest="$1"
  local kind="$2"
  awk -v expected_kind="${kind}" '$0 == "kind: " expected_kind { count += 1 } END { print count + 0 }' "${manifest}"
}

assert_equal() {
  local expected="$1"
  local actual="$2"
  local description="$3"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "ERROR: ${description}; expected ${expected}, found ${actual}" >&2
    exit 1
  fi
}

assert_manifest_contains() {
  local manifest="$1"
  local pattern="$2"
  local description="$3"
  if ! rg -q --multiline "${pattern}" "${manifest}"; then
    echo "ERROR: ${description}" >&2
    exit 1
  fi
}

assert_network_policy_contains() {
  local manifest="$1"
  local policy_name="$2"
  local pattern="$3"
  local description="$4"
  local document
  document="$(awk -v policy_name="${policy_name}" '
    BEGIN { RS = "---" }
    $0 ~ /kind: NetworkPolicy/ && $0 ~ ("name: " policy_name "([[:space:]]|$)") { print }
  ' "${manifest}")"
  if [[ -z "${document}" ]]; then
    echo "ERROR: NetworkPolicy ${policy_name} is missing" >&2
    exit 1
  fi
  if ! rg -q "${pattern}" <<<"${document}"; then
    echo "ERROR: NetworkPolicy ${policy_name} ${description}" >&2
    exit 1
  fi
}

assert_network_policy_port() {
  local manifest="$1"
  local policy_name="$2"
  local port="$3"
  assert_network_policy_contains \
    "${manifest}" "${policy_name}" "port: ${port}([[:space:]]|$)" \
    "does not allow TCP port ${port}"
}

echo "==> rendering development overlays"
render_overlay infra "${INFRA_REPOSITORY}/deploy/overlays/gcp-dev"
render_overlay infra-prod "${INFRA_REPOSITORY}/deploy/overlays/gcp-prod"
render_overlay core "${CORE_REPOSITORY}/k8s/overlays/gcp/dev"
render_overlay core-prod "${CORE_REPOSITORY}/k8s/overlays/gcp/prod"
render_overlay web "${WEB_REPOSITORY}/k8s/overlays/gcp/dev"
render_overlay agent "${AGENT_REPOSITORY}/k8s/overlays/gcp-dev"
render_overlay control-plane "${CONTROL_PLANE_REPOSITORY}/k8s/overlays/gcp/dev"

echo "==> verifying the public edge"
assert_equal 0 "$(count_top_level_kind "${RENDER_DIRECTORY}/infra.yaml" HTTPRoute)" "platform overlay must not expose Trino or MCP-Trino"
assert_equal 0 "$(count_top_level_kind "${RENDER_DIRECTORY}/core.yaml" HTTPRoute)" "Core must not have a public HTTPRoute"
assert_equal 0 "$(count_top_level_kind "${RENDER_DIRECTORY}/agent.yaml" HTTPRoute)" "Agent must not have a public HTTPRoute"
assert_equal 1 "$(count_top_level_kind "${RENDER_DIRECTORY}/web.yaml" HTTPRoute)" "Web must be the customer-facing public edge"
assert_equal 1 "$(count_top_level_kind "${RENDER_DIRECTORY}/control-plane.yaml" HTTPRoute)" "Control Plane must have exactly one IAP-protected operator edge"
assert_manifest_contains "${RENDER_DIRECTORY}/control-plane.yaml" 'iap:[[:space:]]*\n[[:space:]]+clientID:.*\n[[:space:]]+enabled: true' "Control Plane must enable IAP"
assert_manifest_contains "${RENDER_DIRECTORY}/control-plane.yaml" 'CONTROL_PLANE_ALLOWED_OPERATOR_DOMAIN: celesnity\.com' "Control Plane must reject operators outside celesnity.com"

echo "==> verifying private services and workload identities"
assert_manifest_contains "${RENDER_DIRECTORY}/core.yaml" 'name: celesnity-core' "Core service is missing"
assert_manifest_contains "${RENDER_DIRECTORY}/core.yaml" 'type: ClusterIP' "Core service must remain ClusterIP-only"
assert_manifest_contains "${RENDER_DIRECTORY}/agent.yaml" 'name: minder-serve' "Agent service is missing"
assert_manifest_contains "${RENDER_DIRECTORY}/agent.yaml" 'type: ClusterIP' "Agent service must remain ClusterIP-only"
if rg -n 'type: (LoadBalancer|NodePort)' "${RENDER_DIRECTORY}/core.yaml" "${RENDER_DIRECTORY}/agent.yaml"; then
  echo "ERROR: Core or Agent renders an externally reachable Kubernetes Service" >&2
  exit 1
fi
assert_manifest_contains "${RENDER_DIRECTORY}/agent.yaml" 'name: minder-default-deny-ingress' "Agent default-deny ingress NetworkPolicy is missing"
assert_manifest_contains "${RENDER_DIRECTORY}/agent.yaml" 'name: minder-serve-from-web-only' "Agent Web-only ingress NetworkPolicy is missing"
assert_manifest_contains "${RENDER_DIRECTORY}/core.yaml" 'serviceAccountName: celesnity-core-api' "Core API workload identity is missing"
assert_manifest_contains "${RENDER_DIRECTORY}/core.yaml" 'serviceAccountName: celesnity-core-worker' "Core worker workload identity is missing"
assert_manifest_contains "${RENDER_DIRECTORY}/web.yaml" 'serviceAccountName: celesnity-web' "Web workload identity is missing"
assert_manifest_contains "${RENDER_DIRECTORY}/agent.yaml" 'serviceAccountName: celesnity-agent' "Agent workload identity is missing"
assert_manifest_contains "${RENDER_DIRECTORY}/control-plane.yaml" 'serviceAccountName: celesnity-control-plane-web' "Control Plane workload identity is missing"
for manifest in "${RENDER_DIRECTORY}/infra.yaml" "${RENDER_DIRECTORY}/infra-prod.yaml"; do
  assert_manifest_contains "${manifest}" 'name: default-deny' "platform namespace default-deny NetworkPolicy is missing"
  if rg -q 'clusterIP: None' "${manifest}"; then
    echo "ERROR: Spark master must not use headless DNS" >&2
    exit 1
  fi
  assert_manifest_contains \
    "${manifest}" \
    'name: SPARK_MASTER_HOST[[:space:]]*\n[[:space:]]+valueFrom:[[:space:]]*\n[[:space:]]+fieldRef:[[:space:]]*\n[[:space:]]+fieldPath: status\.podIP' \
    "Spark master must bind to its own pod IP"
  assert_manifest_contains \
    "${manifest}" \
    'enableServiceLinks: false' \
    "Spark must disable conflicting Kubernetes service-link environment variables"
  assert_manifest_contains \
    "${manifest}" \
    'http://spark-master:8080/json/' \
    "Spark worker health must verify active-master registration"
  assert_network_policy_port "${manifest}" spark-master-ingress 8080
  assert_network_policy_contains \
    "${manifest}" spark-master-ingress \
    'app\.kubernetes\.io/component: worker' \
    "does not allow Spark workers to verify master registration"
  assert_network_policy_port "${manifest}" spark-worker-jdbc-egress 5432
  assert_network_policy_port "${manifest}" spark-worker-jdbc-egress 3306
  assert_network_policy_port "${manifest}" spark-execution-jdbc-egress 5432
  assert_network_policy_port "${manifest}" spark-execution-jdbc-egress 3306
  assert_network_policy_contains \
    "${manifest}" spark-worker-jdbc-egress \
    'app\.kubernetes\.io/component: worker' \
    "does not select Spark workers"
  assert_network_policy_contains \
    "${manifest}" spark-execution-jdbc-egress \
    'app\.kubernetes\.io/name: celesnity-spark-execution' \
    "does not select Spark execution drivers"
  assert_manifest_contains "${manifest}" 'serviceAccountName: celesnity-trino' "Trino dedicated workload identity is missing"
  assert_manifest_contains "${manifest}" 'serviceAccountName: celesnity-spark-runtime' "Spark runtime dedicated workload identity is missing"
  assert_manifest_contains "${manifest}" 'serviceAccountName: celesnity-iceberg-maintenance' "Iceberg maintenance dedicated workload identity is missing"
  assert_manifest_contains "${manifest}" 'serviceAccountName: celesnity-mcp-trino' "MCP-Trino dedicated workload identity is missing"
  assert_manifest_contains "${manifest}" 'serviceAccountName: celesnity-redpanda-connect' "Redpanda Connect dedicated workload identity is missing"
  if rg -q '^      serviceAccountName: celesnity$' "${manifest}"; then
    echo "ERROR: a platform workload still uses the shared celesnity ServiceAccount" >&2
    exit 1
  fi
done
for manifest in "${RENDER_DIRECTORY}/core.yaml" "${RENDER_DIRECTORY}/core-prod.yaml"; do
  assert_manifest_contains "${manifest}" 'SPARK_JOB_SERVICE_ACCOUNT: celesnity-spark-job' "Core Spark Jobs must use their dedicated identity"
done

echo "==> verifying legacy static credentials are absent"
if rg -n \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!**/target/**' \
  --glob '!**/docs/**' \
  --glob '!**/*.md' \
  --glob '!**/verify-m1-trust-boundary.sh' \
  --glob '!**/scripts/m1/**' \
  '(AGENT_SERVICE_TOKEN|agent-service-token|API_AUTH_ENABLED|API_BEARER_TOKEN)' \
  "${CORE_REPOSITORY}" "${WEB_REPOSITORY}" "${AGENT_REPOSITORY}" "${CONTROL_PLANE_REPOSITORY}" "${INFRA_REPOSITORY}"; then
  echo "ERROR: a legacy static credential or authentication compatibility flag remains" >&2
  exit 1
fi

echo "PASS: M1 source trust-boundary assertions passed"
echo "  public edges: customer Web plus IAP-protected celesnity.com Control Plane"
echo "  private services: Core, Agent, Trino and MCP-Trino"
echo "  agent ingress: default deny plus Web-only allow"
echo "  workload identities: dedicated per Core, Web, Agent, Trino, Spark, maintenance and streaming role"
echo "  Spark JDBC egress: PostgreSQL and MySQL ports available to drivers and workers"
echo "  legacy static credentials: absent from executable configuration"
