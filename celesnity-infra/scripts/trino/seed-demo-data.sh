#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  seed-demo-data.sh --server https://HOST:PORT --user USERNAME [--password]

Runs trino/seed/demo-tabular.sql against the given Trino coordinator,
creating and populating the shared, read-only iceberg.demo schema every
organization can browse. Idempotent: the fixture drops and recreates its
own tables on every run.

Requires the `trino` CLI (https://trino.io/docs/current/client/cli.html)
on PATH — the same client documented in `trino_connect_command`.
EOF
}

SERVER=""
TRINO_USER=""
ASK_PASSWORD=false

while (($#)); do
  case "$1" in
    --server) SERVER="${2:?missing --server value}"; shift 2 ;;
    --user) TRINO_USER="${2:?missing --user value}"; shift 2 ;;
    --password) ASK_PASSWORD=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument $1"; usage; exit 1 ;;
  esac
done

if [ -z "$SERVER" ] || [ -z "$TRINO_USER" ]; then
  echo "ERROR: --server and --user are required"
  usage
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="$SCRIPT_DIR/../../../trino/seed/demo-tabular.sql"

if [ ! -f "$FIXTURE" ]; then
  echo "ERROR: fixture not found at $FIXTURE — run celesnity-core/scripts/trino/generate-demo-data.mjs first"
  exit 1
fi

PASSWORD_FLAG=()
if [ "$ASK_PASSWORD" = true ]; then
  PASSWORD_FLAG=(--password)
fi

echo "==> seeding iceberg.demo on $SERVER"
# The ${arr[@]+"${arr[@]}"} idiom, not a bare "${arr[@]}", because macOS ships
# bash 3.2 by default, where expanding an empty array under `set -u` throws
# "unbound variable" (fixed only in bash 4.4+).
trino --server "$SERVER" --user "$TRINO_USER" ${PASSWORD_FLAG[@]+"${PASSWORD_FLAG[@]}"} --file "$FIXTURE"
echo "==> done"
