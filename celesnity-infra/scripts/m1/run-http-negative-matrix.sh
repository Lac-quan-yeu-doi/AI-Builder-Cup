#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <cases.tsv> <evidence-dir>" >&2
  echo "TSV: case<TAB>method<TAB>url<TAB>token_env_or_dash<TAB>origin_or_dash<TAB>expected_status_csv<TAB>body_file_or_dash" >&2
}

if [[ $# -ne 2 ]]; then usage; exit 2; fi
cases_file=$1
evidence_dir=$2
mkdir -p "$evidence_dir/responses"
summary="$evidence_dir/results.tsv"
printf 'case\trequest_id\tstatus\texpected\tresult\n' > "$summary"
failed=0

while IFS=$'\t' read -r case_name method url token_env origin expected body_file; do
  [[ -z "$case_name" || "$case_name" == \#* ]] && continue
  request_id="m1-$(date -u +%s)-$(openssl rand -hex 8)"
  safe_name=$(printf '%s' "$case_name" | tr -cs 'A-Za-z0-9._-' '_')
  headers="$evidence_dir/responses/$safe_name.headers"
  response="$evidence_dir/responses/$safe_name.json"
  curl_args=(-sS -D "$headers" -o "$response" -X "$method" -H "X-Request-Id: $request_id" -H 'Accept: application/json')
  if [[ "$token_env" != "-" ]]; then
    token=${!token_env:-}
    if [[ -z "$token" ]]; then echo "Missing token environment variable: $token_env" >&2; exit 2; fi
    curl_args+=(-H "Authorization: Bearer $token")
  fi
  [[ "$origin" != "-" ]] && curl_args+=(-H "Origin: $origin")
  [[ "$body_file" != "-" ]] && curl_args+=(-H 'Content-Type: application/json' --data-binary "@$body_file")
  status=$(curl "${curl_args[@]}" -w '%{http_code}' "$url" || true)
  result=FAIL
  IFS=',' read -r -a allowed <<< "$expected"
  for allowed_status in "${allowed[@]}"; do [[ "$status" == "$allowed_status" ]] && result=PASS; done
  printf '%s\t%s\t%s\t%s\t%s\n' "$case_name" "$request_id" "$status" "$expected" "$result" >> "$summary"
  [[ "$result" == PASS ]] || failed=1
done < "$cases_file"

if [[ -n "${M1_AUDIT_URL:-}" ]]; then
  if [[ -z "${M1_AUDIT_TOKEN:-}" ]]; then echo 'M1_AUDIT_TOKEN is required with M1_AUDIT_URL.' >&2; exit 2; fi
  curl -fsS -H "Authorization: Bearer $M1_AUDIT_TOKEN" -H 'Accept: application/json' \
    "$M1_AUDIT_URL" > "$evidence_dir/audit-events.json"
  while IFS=$'\t' read -r case_name request_id _; do
    [[ "$case_name" == case ]] && continue
    if ! rg -Fq "$request_id" "$evidence_dir/audit-events.json"; then
      echo "Missing immutable audit correlation for $case_name ($request_id)" >&2
      failed=1
    fi
  done < "$summary"
fi

(cd "$evidence_dir" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS)
cat "$summary"
exit "$failed"
