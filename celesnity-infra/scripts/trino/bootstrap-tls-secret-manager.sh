#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bootstrap-tls-secret-manager.sh \
    --project PROJECT_ID \
    --environment gcp-dev|gcp-prod \
    --namespace KUBERNETES_NAMESPACE \
    [--locations REGION[,REGION...]] \
    [--validity-days DAYS] \
    [--rotate]

Creates an environment-specific self-signed Trino certificate and stores:
  celesnity-ENVIRONMENT-trino-tls-pem  certificate followed by private key
  celesnity-ENVIRONMENT-trino-ca-pem   certificate only
  celesnity-ENVIRONMENT-trino-user-password
  celesnity-ENVIRONMENT-trino-shared-secret

Existing enabled versions are preserved unless --rotate is supplied. The
command prints only the new version numbers required by terraform.tfvars.
EOF
}

PROJECT_ID=""
ENVIRONMENT=""
NAMESPACE=""
LOCATIONS="asia-southeast1"
VALIDITY_DAYS=365
ROTATE=false

while (($#)); do
  case "$1" in
    --project) PROJECT_ID="${2:?missing --project value}"; shift 2 ;;
    --environment) ENVIRONMENT="${2:?missing --environment value}"; shift 2 ;;
    --namespace) NAMESPACE="${2:?missing --namespace value}"; shift 2 ;;
    --locations) LOCATIONS="${2:?missing --locations value}"; shift 2 ;;
    --validity-days) VALIDITY_DAYS="${2:?missing --validity-days value}"; shift 2 ;;
    --rotate) ROTATE=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$PROJECT_ID" || -z "$ENVIRONMENT" || -z "$NAMESPACE" ]]; then
  echo "ERROR: --project, --environment, and --namespace are required" >&2
  usage >&2
  exit 2
fi
if [[ ! "$ENVIRONMENT" =~ ^gcp-[a-z0-9-]+$ ]]; then
  echo "ERROR: environment must match gcp-[a-z0-9-]+" >&2
  exit 2
fi
if [[ ! "$NAMESPACE" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
  echo "ERROR: namespace must be a DNS label" >&2
  exit 2
fi
if [[ ! "$VALIDITY_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: validity days must be a positive integer" >&2
  exit 2
fi

for command_name in gcloud openssl awk; do
  command -v "$command_name" >/dev/null || {
    echo "ERROR: required command not found: $command_name" >&2
    exit 1
  }
done

SECRET_PREFIX="celesnity-${ENVIRONMENT}"
TLS_SECRET="${SECRET_PREFIX}-trino-tls-pem"
CA_SECRET="${SECRET_PREFIX}-trino-ca-pem"
USER_PASSWORD_SECRET="${SECRET_PREFIX}-trino-user-password"
SHARED_SECRET="${SECRET_PREFIX}-trino-shared-secret"

ensure_secret() {
  local secret_name="$1"
  if gcloud secrets describe "$secret_name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    return
  fi
  gcloud secrets create "$secret_name" \
    --project "$PROJECT_ID" \
    --replication-policy user-managed \
    --locations "$LOCATIONS" \
    --labels "application=celesnity,environment=${ENVIRONMENT},component=trino,managed-by=operator" \
    >/dev/null
}

latest_enabled_version() {
  gcloud secrets versions list "$1" \
    --project "$PROJECT_ID" \
    --filter 'state=ENABLED' \
    --sort-by '~createTime' \
    --limit 1 \
    --format 'value(name)'
}

ensure_secret "$TLS_SECRET"
ensure_secret "$CA_SECRET"
ensure_secret "$USER_PASSWORD_SECRET"
ensure_secret "$SHARED_SECRET"

CURRENT_TLS_VERSION="$(latest_enabled_version "$TLS_SECRET")"
CURRENT_CA_VERSION="$(latest_enabled_version "$CA_SECRET")"
CURRENT_USER_PASSWORD_VERSION="$(latest_enabled_version "$USER_PASSWORD_SECRET")"
CURRENT_SHARED_SECRET_VERSION="$(latest_enabled_version "$SHARED_SECRET")"

if [[ ( -n "$CURRENT_TLS_VERSION" && -z "$CURRENT_CA_VERSION" ) \
   || ( -z "$CURRENT_TLS_VERSION" && -n "$CURRENT_CA_VERSION" ) ]]; then
  echo "ERROR: only one Trino TLS secret has an enabled version; use --rotate to repair the pair" >&2
  exit 1
fi
if [[ ( -n "$CURRENT_USER_PASSWORD_VERSION" && -z "$CURRENT_SHARED_SECRET_VERSION" ) \
   || ( -z "$CURRENT_USER_PASSWORD_VERSION" && -n "$CURRENT_SHARED_SECRET_VERSION" ) ]]; then
  echo "ERROR: only one Trino credential secret has an enabled version; use --rotate to repair the pair" >&2
  exit 1
fi

if [[ "$ROTATE" == false && -n "$CURRENT_TLS_VERSION" && -n "$CURRENT_USER_PASSWORD_VERSION" ]]; then
  echo "Trino Secret Manager versions already exist; no credential or certificate was changed."
  printf 'trino_tls_secret_version = "%s"\n' "$CURRENT_TLS_VERSION"
  printf 'trino_ca_secret_version = "%s"\n' "$CURRENT_CA_VERSION"
  printf 'trino_user_password_secret_version = "%s"\n' "$CURRENT_USER_PASSWORD_VERSION"
  printf 'trino_shared_secret_version = "%s"\n' "$CURRENT_SHARED_SECRET_VERSION"
  exit 0
fi

WORK_DIR="$(mktemp -d)"
chmod 700 "$WORK_DIR"

KEY_FILE="$WORK_DIR/tls.key"
CERT_FILE="$WORK_DIR/tls.crt"
TLS_FILE="$WORK_DIR/tls.pem"
USER_PASSWORD_FILE="$WORK_DIR/user-password"
SHARED_SECRET_FILE="$WORK_DIR/shared-secret"
trap 'rm -f "$KEY_FILE" "$CERT_FILE" "$TLS_FILE" "$USER_PASSWORD_FILE" "$SHARED_SECRET_FILE"; rmdir "$WORK_DIR"' EXIT
COMMON_NAME="trino-coordinator.${NAMESPACE}.svc.cluster.local"
SUBJECT_ALT_NAMES="DNS:trino-coordinator,DNS:trino-coordinator.${NAMESPACE},DNS:trino-coordinator.${NAMESPACE}.svc,DNS:${COMMON_NAME},DNS:localhost,IP:127.0.0.1"

if [[ "$ROTATE" == true || -z "$CURRENT_TLS_VERSION" ]]; then
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes \
    -days "$VALIDITY_DAYS" \
    -subj "/O=Celesnity/CN=${COMMON_NAME}" \
    -addext "subjectAltName=${SUBJECT_ALT_NAMES}" \
    -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
    -addext "extendedKeyUsage=serverAuth" \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    >/dev/null 2>&1

  chmod 600 "$KEY_FILE" "$CERT_FILE"
  openssl x509 -in "$CERT_FILE" -noout -checkend 86400 >/dev/null
  openssl pkey -in "$KEY_FILE" -check -noout >/dev/null
  awk '1' "$CERT_FILE" "$KEY_FILE" > "$TLS_FILE"
  chmod 600 "$TLS_FILE"

  CA_VERSION_NAME="$(gcloud secrets versions add "$CA_SECRET" \
    --project "$PROJECT_ID" --data-file "$CERT_FILE" --format 'value(name)')"
  TLS_VERSION_NAME="$(gcloud secrets versions add "$TLS_SECRET" \
    --project "$PROJECT_ID" --data-file "$TLS_FILE" --format 'value(name)')"
  CA_VERSION="${CA_VERSION_NAME##*/}"
  TLS_VERSION="${TLS_VERSION_NAME##*/}"
else
  CA_VERSION="$CURRENT_CA_VERSION"
  TLS_VERSION="$CURRENT_TLS_VERSION"
fi

if [[ "$ROTATE" == true || -z "$CURRENT_USER_PASSWORD_VERSION" ]]; then
  openssl rand -hex 16 > "$USER_PASSWORD_FILE"
  openssl rand -hex 32 > "$SHARED_SECRET_FILE"
  chmod 600 "$USER_PASSWORD_FILE" "$SHARED_SECRET_FILE"

  USER_PASSWORD_VERSION_NAME="$(gcloud secrets versions add "$USER_PASSWORD_SECRET" \
    --project "$PROJECT_ID" --data-file "$USER_PASSWORD_FILE" --format 'value(name)')"
  SHARED_SECRET_VERSION_NAME="$(gcloud secrets versions add "$SHARED_SECRET" \
    --project "$PROJECT_ID" --data-file "$SHARED_SECRET_FILE" --format 'value(name)')"
  USER_PASSWORD_VERSION="${USER_PASSWORD_VERSION_NAME##*/}"
  SHARED_SECRET_VERSION="${SHARED_SECRET_VERSION_NAME##*/}"
else
  USER_PASSWORD_VERSION="$CURRENT_USER_PASSWORD_VERSION"
  SHARED_SECRET_VERSION="$CURRENT_SHARED_SECRET_VERSION"
fi

echo "Stored fresh Trino authentication material in environment-scoped Secret Manager secrets."
printf 'trino_tls_secret_version = "%s"\n' "$TLS_VERSION"
printf 'trino_ca_secret_version = "%s"\n' "$CA_VERSION"
printf 'trino_user_password_secret_version = "%s"\n' "$USER_PASSWORD_VERSION"
printf 'trino_shared_secret_version = "%s"\n' "$SHARED_SECRET_VERSION"
echo "Set or increment trino_kubernetes_secret_revision before the deployment that adopts these versions."
