#!/usr/bin/env bash
set -euo pipefail

usage() { echo "Usage: $0 <plan|execute> <project> <source-instance> <target-instance> <UTC-point-in-time> [evidence-dir]" >&2; }
if [[ $# -lt 5 || $# -gt 6 ]]; then usage; exit 2; fi
mode=$1 project=$2 source_instance=$3 target_instance=$4 point_in_time=$5
evidence_dir=${6:-"evidence/recovery/$(date -u +%Y%m%dT%H%M%SZ)"}
[[ "$mode" == plan || "$mode" == execute ]] || { usage; exit 2; }
[[ "$source_instance" != "$target_instance" ]] || { echo 'Target must be a new disposable instance.' >&2; exit 2; }
mkdir -p "$evidence_dir"

gcloud sql instances describe "$source_instance" --project "$project" --format=json > "$evidence_dir/source-before.json"
gcloud sql backups list --instance "$source_instance" --project "$project" --limit=20 --format=json > "$evidence_dir/backups.json"
printf 'gcloud sql instances clone %q %q --project %q --point-in-time %q\n' \
  "$source_instance" "$target_instance" "$project" "$point_in_time" > "$evidence_dir/restore-command.txt"

if [[ "$mode" == execute ]]; then
  expected="CREATE ${target_instance} FROM ${source_instance} IN ${project}"
  [[ "${RECOVERY_CONFIRM:-}" == "$expected" ]] || {
    echo "Set RECOVERY_CONFIRM='$expected' to authorize creation of the billable rehearsal instance." >&2
    exit 2
  }
  gcloud sql instances clone "$source_instance" "$target_instance" --project "$project" --point-in-time "$point_in_time" --async \
    --format=json > "$evidence_dir/clone-operation.json"
fi

(cd "$evidence_dir" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS)
echo "Recovery evidence: $evidence_dir"
