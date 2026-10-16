#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: container-smoke.sh IMAGE}"
name="minder-phase-0-smoke-$$"
postgres_name="minder-phase-0-postgres-$$"
network_name="minder-phase-0-network-$$"
health_file="${TMPDIR:-/tmp}/minder-health-${$}.json"
metrics_file="${TMPDIR:-/tmp}/minder-metrics-${$}.txt"
ready=0
trap 'docker rm -f "$name" "$postgres_name" >/dev/null 2>&1 || true; docker network rm "$network_name" >/dev/null 2>&1 || true; rm -f "$health_file" "$metrics_file"' EXIT

# Production authentication uses a shared PostgreSQL replay store. Exercise that
# real startup path rather than weakening the smoke container to an in-memory or
# non-production configuration that cannot detect deployment regressions.
docker network create "$network_name" >/dev/null
docker run -d --name "$postgres_name" --network "$network_name" \
  --network-alias replay-db \
  -e POSTGRES_USER="minder" \
  -e POSTGRES_PASSWORD="container-smoke-password" \
  -e POSTGRES_DB="minder_smoke" \
  postgres:17.6-alpine >/dev/null

postgres_ready=0
for _ in $(seq 1 30); do
  if docker exec "$postgres_name" pg_isready -U minder -d minder_smoke >/dev/null 2>&1; then
    postgres_ready=1
    break
  fi
  sleep 1
done
if [ "$postgres_ready" != 1 ]; then
  echo "PostgreSQL failed to become ready: $postgres_name" >&2
  docker logs "$postgres_name" >&2 || true
  exit 1
fi

docker run -d --name "$name" --network "$network_name" --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --tmpfs /home/nonroot:rw,noexec,nosuid,size=16m \
  -e LLM_BASE_URL="http://127.0.0.1:18081/v1" \
  -e LLM_API_KEY="container-smoke-key" \
  -e LLM_MODEL="container-smoke-model" \
  -e MINDER_AUTH_MODE="core-assertion" \
  -e MINDER_ASSERTION_ISSUER="celesnity-core" \
  -e MINDER_ASSERTION_AUDIENCE="minder-agent" \
  -e 'MINDER_ASSERTION_PUBLIC_KEYS_JSON={"smoke":"-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAjIj170dq3ZtmtM8LpaIFRPfqY5zhXicuFxHXHJcP/2g=\n-----END PUBLIC KEY-----"}' \
  -e MINDER_ASSERTION_REPLAY_CACHE_CAPACITY="1024" \
  -e DATABASE_URL="postgresql://minder:container-smoke-password@replay-db:5432/minder_smoke" \
  -e MINDER_DATABASE_SCHEMA="minder_agent" \
  -e CELESNITY_CORE_URL="http://core-smoke.invalid:3001" \
  -e CELESNITY_CORE_AUDIENCE="http://core-smoke.invalid:3001" \
  -e MINIO_ENDPOINT="http://127.0.0.1:18082" \
  -e MINIO_ACCESS_KEY="container-smoke-key" \
  -e MINIO_SECRET_KEY="container-smoke-secret" \
  -e MINIO_WORKSPACE_BUCKET="container-smoke" \
  "$image" >/dev/null

fetch_endpoint() {
  local endpoint="$1"
  local output_file="$2"

  docker exec "$name" /nodejs/bin/node --input-type=module -e \
    'const response = await fetch(process.argv[1]);
     if (!response.ok) process.exit(1);
     process.stdout.write(await response.text());' \
    "http://127.0.0.1:8080${endpoint}" > "$output_file" 2>/dev/null
}

for _ in $(seq 1 30); do
  if fetch_endpoint "/healthz" "$health_file"; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" != 1 ]; then
  echo "Container failed to become ready: $name" >&2
  docker ps -a --filter "name=$name" >&2 || true
  docker inspect "$name" >&2 || true
  docker logs "$name" >&2 || true
  exit 1
fi

test "$(<"$health_file")" = '{"status":"ok"}'
test "$(docker inspect --format '{{.Config.User}}' "$image")" = '65532:65532'
fetch_endpoint "/metrics" "$metrics_file"
grep -F 'http_server_active_requests' "$metrics_file"
