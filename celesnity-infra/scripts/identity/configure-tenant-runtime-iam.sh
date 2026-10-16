#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 <apply|check> <project-id> <tenant-id> <web-service-account> <core-api-service-account>" >&2
  exit 2
}

mode="${1:-}"
project_id="${2:-}"
tenant_id="${3:-}"
web_service_account="${4:-}"
core_api_service_account="${5:-}"

case "$mode" in
  apply | check) ;;
  *) usage ;;
esac

if [[ -z "$project_id" || -z "$tenant_id" || -z "$web_service_account" || -z "$core_api_service_account" ]]; then
  usage
fi

for command_name in curl gcloud; do
  command -v "$command_name" >/dev/null || {
    echo "ERROR: $command_name is required" >&2
    exit 1
  }
done

python_command="$(gcloud info --format='value(basic.python_location)')"
if [[ -z "$python_command" || ! -x "$python_command" ]]; then
  echo "ERROR: gcloud Python interpreter is unavailable" >&2
  exit 1
fi

tenant_iam_url="https://identitytoolkit.googleapis.com/admin/v2/projects/${project_id}/tenants/${tenant_id}"
access_token="$(gcloud auth print-access-token)"

request() {
  curl --fail --silent --show-error "$@" \
    -H "Authorization: Bearer ${access_token}" \
    -H "X-Goog-User-Project: ${project_id}" \
    -H "Content-Type: application/json"
}

policy="$(request --request POST "${tenant_iam_url}:getIamPolicy" --data-binary '{}')"

if [[ "$mode" == "apply" ]]; then
  # Tenant-aware account lookup does not inherit firebaseauth.users.get from a
  # project custom-role binding. Identity Platform requires Viewer on the tenant
  # resource itself. Preserve unrelated bindings and the etag during reconciliation.
  policy="$(
    WEB_MEMBER="serviceAccount:${web_service_account}" \
      CORE_MEMBER="serviceAccount:${core_api_service_account}" \
      "$python_command" -c '
import json
import os
import sys

policy = json.load(sys.stdin)
viewer_role = "roles/identityplatform.viewer"
admin_role = "roles/identityplatform.admin"
web_member = os.environ["WEB_MEMBER"]
core_member = os.environ["CORE_MEMBER"]
bindings = policy.setdefault("bindings", [])
binding = next((item for item in bindings if item.get("role") == viewer_role), None)
if binding is None:
    bindings.append({"role": viewer_role, "members": [web_member]})
else:
    binding["members"] = sorted((set(binding.get("members", [])) | {web_member}) - {core_member})

admin_binding = next((item for item in bindings if item.get("role") == admin_role), None)
if admin_binding is None:
    bindings.append({"role": admin_role, "members": [core_member]})
else:
    admin_binding["members"] = sorted(set(admin_binding.get("members", [])) | {core_member})

# Web session management remains in its project custom role and must never gain
# tenant administration. Remove obsolete editor access and the ineffective
# tenant binding of the former project custom role from both identities.
for item in bindings:
    members = set(item.get("members", []))
    if item.get("role") == admin_role:
        members.discard(web_member)
    if item.get("role") == "roles/identityplatform.editor" or item.get("role", "").endswith("_identity_user_administration"):
        members -= {web_member, core_member}
    item["members"] = sorted(members)
policy["bindings"] = [item for item in bindings if item.get("members")]
json.dump(policy, sys.stdout, separators=(",", ":"))
' <<<"$policy"
  )"

  payload="$(POLICY="$policy" "$python_command" -c '
import json
import os
print(json.dumps({"policy": json.loads(os.environ["POLICY"]), "updateMask": "bindings,etag"}, separators=(",", ":")))
')"
  policy="$(request --request POST "${tenant_iam_url}:setIamPolicy" --data-binary "$payload")"
fi

if ! WEB_MEMBER="serviceAccount:${web_service_account}" \
  CORE_MEMBER="serviceAccount:${core_api_service_account}" \
  "$python_command" -c '
import json
import os
import sys

policy = json.load(sys.stdin)
web_member = os.environ["WEB_MEMBER"]
core_member = os.environ["CORE_MEMBER"]
viewer_members = set()
admin_members = set()
for binding in policy.get("bindings", []):
    if binding.get("role") == "roles/identityplatform.viewer":
        viewer_members.update(binding.get("members", []))
    if binding.get("role") == "roles/identityplatform.admin":
        admin_members.update(binding.get("members", []))
raise SystemExit(0 if web_member in viewer_members and core_member in admin_members and web_member not in admin_members else 1)
' <<<"$policy"; then
  echo "ERROR: tenant ${tenant_id} is missing Web Viewer or Core tenant-admin bindings" >&2
  exit 1
fi

echo "==> tenant ${tenant_id} grants Web Viewer and tenant-scoped Core administration"
