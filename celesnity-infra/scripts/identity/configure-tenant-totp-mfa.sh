#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 <apply|check> <project-id> <tenant-id> [adjacent-intervals]" >&2
  exit 2
}

mode="${1:-}"
project_id="${2:-}"
tenant_id="${3:-}"
adjacent_intervals="${4:-1}"

case "$mode" in
  apply | check) ;;
  *) usage ;;
esac

if [[ -z "$project_id" || -z "$tenant_id" || ! "$adjacent_intervals" =~ ^([0-9]|10)$ ]]; then
  usage
fi

for command_name in curl gcloud; do
  command -v "$command_name" >/dev/null || {
    echo "ERROR: $command_name is required" >&2
    exit 1
  }
done

# Reuse the interpreter that is already running gcloud. This works both with
# Cloud SDK's bundled Python and installations that use a system interpreter,
# without assuming that a `python3` executable is independently on PATH.
python_command="$(gcloud info --format='value(basic.python_location)')"
if [[ -z "$python_command" || ! -x "$python_command" ]]; then
  echo "ERROR: gcloud Python interpreter is unavailable" >&2
  exit 1
fi

tenant_url="https://identitytoolkit.googleapis.com/v2/projects/${project_id}/tenants/${tenant_id}"
access_token="$(gcloud auth print-access-token)"

request() {
  curl --fail --silent --show-error "$@" \
    -H "Authorization: Bearer ${access_token}" \
    -H "X-Goog-User-Project: ${project_id}"
}

if [[ "$mode" == "apply" ]]; then
  # The Cloud SDK builder guarantees Python, but does not include jq. The
  # interval has already been constrained to an integer from 0 through 10, so
  # formatting the otherwise static JSON does not introduce an injection path.
  payload="$(printf \
    '{"mfaConfig":{"state":"MANDATORY","providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":%s}}]}}' \
    "$adjacent_intervals")"
  request --request PATCH \
    "${tenant_url}?updateMask=mfaConfig" \
    -H "Content-Type: application/json" \
    --data-binary "$payload" >/dev/null
fi

tenant="$(request "$tenant_url")"
if ! "$python_command" -c '
import json
import sys

tenant = json.load(sys.stdin)
adjacent_intervals = int(sys.argv[1])
mfa = tenant.get("mfaConfig", {})
enabled = any(
    provider.get("state") == "ENABLED"
    and provider.get("totpProviderConfig", {}).get("adjacentIntervals") == adjacent_intervals
    for provider in mfa.get("providerConfigs", [])
)
raise SystemExit(0 if mfa.get("state") == "MANDATORY" and enabled else 1)
' "$adjacent_intervals" <<<"$tenant"; then
  echo "ERROR: tenant ${tenant_id} does not require enabled TOTP MFA" >&2
  exit 1
fi

echo "==> tenant ${tenant_id} requires TOTP MFA"
