const DEFAULT_DATABASE_URL =
  'postgresql://celesnity:celesnity_dev_password@localhost:15432/celesnity?schema=celesnity_app';
const DEFAULT_DEVELOPMENT_CREDENTIAL_KEYS = 'v1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const DEFAULT_DEVELOPMENT_ALLOWED_HOSTS = 'host.docker.internal,sample-postgres';
const DEFAULT_DEVELOPMENT_MINIO_ACCESS_KEY = 'celesnity';
const DEFAULT_DEVELOPMENT_MINIO_SECRET_KEY = 'celesnity_minio_password';
const DEFAULT_SCRIPT_SOURCE_MAX_BYTES = 1024 * 1024;
// MinIO 8.0.7 only preserves If-None-Match for this workflow on a single PUT;
// capping source size prevents a multipart upload from weakening conditional creation.
const MAX_SCRIPT_SOURCE_BYTES = 64 * 1024 * 1024;
const DEFAULT_FIRMWARE_DOWNLOAD_URL_TTL_SECONDS = 900;
const DEFAULT_DEVELOPMENT_FIRMWARE_SIGNING_PRIVATE_KEY =
  'nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=';
// This key exists only for an unconfigured local Core. Production must provide
// a distinct secret through MINDER_ASSERTION_PRIVATE_KEY_PEM.
const DEFAULT_DEVELOPMENT_MINDER_ASSERTION_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIKMp5Zlb0rjzZVEDTZPbbmmCywcRAaprZyKU6L8cOAim
-----END PRIVATE KEY-----
`;

const ALLOWED_NODE_ENVIRONMENTS = new Set(['development', 'test', 'production']);

function stringValue(name: string, rawValue: unknown, fallback: string): string {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }
  if (typeof rawValue !== 'string') {
    throw new Error(`${name} must be a string`);
  }
  return rawValue;
}

function minderAgentApiUrl(rawValue: unknown): string {
  const value = stringValue('MINDER_AGENT_URL', rawValue, 'http://minder-agent.internal').replace(
    /\/+$/u,
    '',
  );
  const origin = value.replace(/\/api\/v[12]$/u, '');
  return `${origin}/api/v2`;
}

function stringAllowingEmpty(name: string, rawValue: unknown, fallback: string): string {
  if (rawValue === undefined || rawValue === null) {
    return fallback;
  }
  if (typeof rawValue !== 'string') {
    throw new Error(`${name} must be a string`);
  }
  return rawValue;
}

function requiredString(name: string, rawValue: unknown, fallback: string): string {
  const value = stringValue(name, rawValue, fallback).trim();
  if (value === '') throw new Error(`${name} is required`);
  return value;
}

function uuidValue(name: string, rawValue: unknown, fallback: string): string {
  const value = requiredString(name, rawValue, fallback);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error(`${name} must be a UUID`);
  }
  return value;
}

function enumValue<T extends string>(
  name: string,
  rawValue: unknown,
  fallback: T,
  allowed: readonly T[],
): T {
  const value = stringValue(name, rawValue, fallback);
  if (!allowed.includes(value as T)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function validatedUrl(name: string, rawValue: unknown, fallback: string): string {
  const value = stringValue(name, rawValue, fallback);
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  return value;
}

function validatedOrigins(name: string, rawValue: unknown, fallback: string): string {
  const value = stringValue(name, rawValue, fallback);
  for (const origin of value.split(',')) {
    const trimmed = origin.trim();
    if (trimmed === '') continue;
    try {
      new URL(trimmed);
    } catch {
      throw new Error(`${name} contains an invalid URL: ${trimmed}`);
    }
  }
  return value;
}

function validatedMqttEndpoint(name: string, rawValue: unknown, fallback: string): string {
  const value = validatedUrl(name, rawValue, fallback);
  const endpoint = new URL(value);
  if (
    !['mqtt:', 'mqtts:'].includes(endpoint.protocol) ||
    endpoint.hostname === '' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    (endpoint.pathname !== '' && endpoint.pathname !== '/') ||
    endpoint.search !== '' ||
    endpoint.hash !== ''
  ) {
    throw new Error(`${name} must be an mqtt:// or mqtts:// origin without credentials or a path`);
  }
  return value;
}

function validatedMinioEndpoint(rawValue: unknown): string {
  const value = validatedUrl('MINIO_ENDPOINT', rawValue, 'http://localhost:9000');
  const endpoint = new URL(value);
  if (
    (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    (endpoint.pathname !== '' && endpoint.pathname !== '/') ||
    endpoint.search !== '' ||
    endpoint.hash !== ''
  ) {
    throw new Error('MINIO_ENDPOINT must be an HTTP(S) origin without credentials or a path');
  }
  return value;
}

function validatedBucket(name: string, rawValue: unknown, fallback: string): string {
  const value = stringValue(name, rawValue, fallback).trim();
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(value) ||
    value.includes('..') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(value)
  ) {
    throw new Error(`${name} must be a valid S3 bucket name`);
  }
  return value;
}

function requiredMinioCredential(
  name: 'MINIO_ACCESS_KEY' | 'MINIO_SECRET_KEY',
  rawValue: unknown,
  fallback: string,
): string {
  const value = stringValue(name, rawValue, fallback);
  if (value.length < 1 || value.length > 1024) {
    throw new Error(`${name} must contain between 1 and 1024 characters`);
  }
  return value;
}

function requiredRedpandaPassword(rawValue: unknown, production: boolean): string {
  const value = stringValue(
    'REDPANDA_PASSWORD',
    rawValue,
    production ? '' : 'celesnity_redpanda_password',
  );
  if (production && value.length < 16) {
    throw new Error('REDPANDA_PASSWORD must contain at least 16 characters in production');
  }
  return value;
}

function requiredEmqxApiSecret(rawValue: unknown, production: boolean): string {
  const value = stringValue(
    'EMQX_API_SECRET',
    rawValue,
    production ? '' : 'celesnity_emqx_api_secret',
  );
  if (production && value.length < 32) {
    throw new Error('EMQX_API_SECRET must contain at least 32 characters in production');
  }
  return value;
}

function booleanValue(name: string, rawValue: unknown, fallback: boolean): boolean {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }
  if (rawValue === true || rawValue === 'true') {
    return true;
  }
  if (rawValue === false || rawValue === 'false') {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function integerValue(
  name: string,
  rawValue: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(rawValue ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function ed25519PrivateKey(name: string, rawValue: unknown, fallback: string): string {
  const value = requiredString(name, rawValue, fallback);
  try {
    if (createPrivateKey(value).asymmetricKeyType !== 'ed25519') {
      throw new Error('wrong key type');
    }
  } catch {
    throw new Error(`${name} must be an Ed25519 PKCS#8 private key.`);
  }
  return value;
}

function keyIdentifier(name: string, rawValue: unknown, fallback: string): string {
  const value = requiredString(name, rawValue, fallback);
  if (!/^[A-Za-z0-9._-]{1,64}$/u.test(value)) {
    throw new Error(
      `${name} must contain 1 through 64 letters, numbers, dots, underscores, or hyphens.`,
    );
  }
  return value;
}

function validateCredentialKeyring(value: string, activeVersion: string): void {
  const versions = new Set<string>();
  for (const entry of value.split(',')) {
    const separator = entry.indexOf(':');
    const version = entry.slice(0, separator).trim();
    const encodedKey = entry.slice(separator + 1).trim();
    if (separator < 1 || !/^[a-zA-Z0-9._-]{1,50}$/u.test(version)) {
      throw new Error('CONNECTION_CREDENTIAL_KEYS contains an invalid key version');
    }
    if (versions.has(version) || Buffer.from(encodedKey, 'base64').length !== 32) {
      throw new Error('CONNECTION_CREDENTIAL_KEYS must contain unique 32-byte base64 keys');
    }
    versions.add(version);
  }
  if (!versions.has(activeVersion)) {
    throw new Error(
      'CONNECTION_CREDENTIAL_ACTIVE_KEY_VERSION must exist in the credential keyring',
    );
  }
}

export function validateEnvironment(input: Record<string, unknown>): Record<string, unknown> {
  const nodeEnvironment = stringValue('NODE_ENV', input.NODE_ENV, 'development');
  if (!ALLOWED_NODE_ENVIRONMENTS.has(nodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const authenticationMode = enumValue(
    'CELESNITY_AUTH_MODE',
    input.CELESNITY_AUTH_MODE,
    'identity-platform',
    ['identity-platform', 'local-development'] as const,
  );
  if (nodeEnvironment === 'production' && authenticationMode === 'local-development') {
    throw new Error('CELESNITY_AUTH_MODE=local-development is forbidden in production');
  }
  const localDevelopmentSigningKey = stringAllowingEmpty(
    'LOCAL_DEV_AUTH_SIGNING_KEY',
    input.LOCAL_DEV_AUTH_SIGNING_KEY,
    '',
  );
  if (authenticationMode === 'local-development' && localDevelopmentSigningKey.length < 32) {
    throw new Error(
      'LOCAL_DEV_AUTH_SIGNING_KEY must contain at least 32 characters in local-development mode',
    );
  }

  // Development-only escape hatch: swaps the Identity Platform verifier for a
  // fixed-token one so a workstation needs no tenant, browser API key or
  // service-account credentials. Booting production with it set is a
  // configuration mistake serious enough to refuse to start.
  const localAuthBypass = booleanValue('LOCAL_AUTH_BYPASS', input.LOCAL_AUTH_BYPASS, false);
  if (localAuthBypass && nodeEnvironment === 'production') {
    throw new Error('LOCAL_AUTH_BYPASS must not be enabled in production');
  }
  const localAuthBypassToken = stringValue(
    'LOCAL_AUTH_BYPASS_TOKEN',
    input.LOCAL_AUTH_BYPASS_TOKEN,
    'local-development-session',
  );
  if (localAuthBypass && localAuthBypassToken.trim() === '') {
    throw new Error('LOCAL_AUTH_BYPASS_TOKEN is required when LOCAL_AUTH_BYPASS is enabled');
  }

  const credentialKeys = stringValue(
    'CONNECTION_CREDENTIAL_KEYS',
    input.CONNECTION_CREDENTIAL_KEYS,
    nodeEnvironment === 'production' ? '' : DEFAULT_DEVELOPMENT_CREDENTIAL_KEYS,
  );
  if (credentialKeys === '') {
    throw new Error('CONNECTION_CREDENTIAL_KEYS is required in production');
  }

  const metadataCrawlerLeaseMs = integerValue(
    'METADATA_CRAWLER_LEASE_MS',
    input.METADATA_CRAWLER_LEASE_MS,
    60_000,
    10_000,
    900_000,
  );
  const metadataCrawlerHeartbeatMs = integerValue(
    'METADATA_CRAWLER_HEARTBEAT_MS',
    input.METADATA_CRAWLER_HEARTBEAT_MS,
    15_000,
    1_000,
    300_000,
  );
  if (metadataCrawlerHeartbeatMs >= metadataCrawlerLeaseMs) {
    throw new Error('METADATA_CRAWLER_HEARTBEAT_MS must be less than METADATA_CRAWLER_LEASE_MS');
  }
  const activeKeyVersion = stringValue(
    'CONNECTION_CREDENTIAL_ACTIVE_KEY_VERSION',
    input.CONNECTION_CREDENTIAL_ACTIVE_KEY_VERSION,
    'v1',
  );
  validateCredentialKeyring(credentialKeys, activeKeyVersion);

  const warehouseBucket = validatedBucket(
    'MINIO_WAREHOUSE_BUCKET',
    input.MINIO_WAREHOUSE_BUCKET,
    'warehouse',
  );
  const artifactsBucket = validatedBucket(
    'MINIO_ARTIFACTS_BUCKET',
    input.MINIO_ARTIFACTS_BUCKET,
    'celesnity-artifacts',
  );
  const firmwareArtifactsBucket = validatedBucket(
    'FIRMWARE_ARTIFACTS_BUCKET',
    input.FIRMWARE_ARTIFACTS_BUCKET,
    artifactsBucket,
  );
  if (warehouseBucket === artifactsBucket) {
    throw new Error('MINIO_WAREHOUSE_BUCKET and MINIO_ARTIFACTS_BUCKET must be different');
  }

  // Canonical chart execution is deliberately bounded independently from the
  // legacy SQL workbench.  These limits are part of the chart contract: rows
  // and bytes are streamed transiently and never written to a result store.
  const chartQueryTimeoutMs = integerValue(
    'CHART_QUERY_TIMEOUT_MS',
    input.CHART_QUERY_TIMEOUT_MS,
    60_000,
    1_000,
    3_600_000,
  );
  const chartPreviewMaxRows = integerValue(
    'CHART_PREVIEW_MAX_ROWS',
    input.CHART_PREVIEW_MAX_ROWS,
    1_000,
    1,
    1_000_000,
  );
  const chartRunMaxRows = integerValue(
    'CHART_RUN_MAX_ROWS',
    input.CHART_RUN_MAX_ROWS,
    10_000,
    1,
    1_000_000,
  );
  const chartPreviewMaxBytes = integerValue(
    'CHART_PREVIEW_MAX_BYTES',
    input.CHART_PREVIEW_MAX_BYTES,
    10 * 1024 * 1024,
    1,
    100 * 1024 * 1024,
  );
  const chartRunMaxBytes = integerValue(
    'CHART_RUN_MAX_BYTES',
    input.CHART_RUN_MAX_BYTES,
    10 * 1024 * 1024,
    1,
    100 * 1024 * 1024,
  );
  if (chartPreviewMaxRows > chartRunMaxRows) {
    throw new Error('CHART_PREVIEW_MAX_ROWS must not exceed CHART_RUN_MAX_ROWS');
  }
  if (chartPreviewMaxBytes > chartRunMaxBytes) {
    throw new Error('CHART_PREVIEW_MAX_BYTES must not exceed CHART_RUN_MAX_BYTES');
  }
  return {
    ...input,
    NODE_ENV: nodeEnvironment,
    CELESNITY_AUTH_MODE: authenticationMode,
    LOCAL_DEV_AUTH_SIGNING_KEY: localDevelopmentSigningKey,
    PORT: integerValue('PORT', input.PORT, 3001, 1, 65_535),
    // Numeric TTL/rate configuration must be coerced explicitly. Otherwise
    // `config.getOrThrow<number>(...)` returns the
    // raw env *string*, and `now.getTime() + "86400000"` string-concatenates
    // instead of adding, producing an unparseable date (`RangeError: Invalid
    // time value` in PendingActionUseCases.propose).
    PENDING_ACTION_TTL_MS: integerValue(
      'PENDING_ACTION_TTL_MS',
      input.PENDING_ACTION_TTL_MS,
      86_400_000,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    CHART_QUERY_TIMEOUT_MS: chartQueryTimeoutMs,
    CHART_PREVIEW_MAX_ROWS: chartPreviewMaxRows,
    CHART_RUN_MAX_ROWS: chartRunMaxRows,
    CHART_PREVIEW_MAX_BYTES: chartPreviewMaxBytes,
    CHART_RUN_MAX_BYTES: chartRunMaxBytes,
    AGENT_WRITE_RATE_WINDOW_MS: integerValue(
      'AGENT_WRITE_RATE_WINDOW_MS',
      input.AGENT_WRITE_RATE_WINDOW_MS,
      60_000,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    AGENT_WRITE_RATE_LIMIT: integerValue(
      'AGENT_WRITE_RATE_LIMIT',
      input.AGENT_WRITE_RATE_LIMIT,
      120,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    WEB_ORIGIN: validatedOrigins('WEB_ORIGIN', input.WEB_ORIGIN, 'http://localhost:3000'),
    API_BIND_ADDRESS: stringValue('API_BIND_ADDRESS', input.API_BIND_ADDRESS, '127.0.0.1'),
    IDENTITY_PLATFORM_PROJECT_ID: requiredString(
      'IDENTITY_PLATFORM_PROJECT_ID',
      input.IDENTITY_PLATFORM_PROJECT_ID,
      nodeEnvironment === 'production' ? '' : 'celesnity-local',
    ),
    DEFAULT_ORGANIZATION_ID: uuidValue(
      'DEFAULT_ORGANIZATION_ID',
      input.DEFAULT_ORGANIZATION_ID,
      '00000000-0000-4000-8000-000000000001',
    ),
    AUDIT_HASH_KEY: requiredString(
      'AUDIT_HASH_KEY',
      input.AUDIT_HASH_KEY,
      nodeEnvironment === 'production' ? '' : 'development-audit-pseudonymization-key',
    ),
    AGENT_SERVICE_AUDIENCE: requiredString(
      'AGENT_SERVICE_AUDIENCE',
      input.AGENT_SERVICE_AUDIENCE,
      nodeEnvironment === 'production'
        ? ''
        : 'http://celesnity-core.celesnity.svc.cluster.local:3001',
    ),
    AGENT_SERVICE_ACCOUNT_EMAIL: requiredString(
      'AGENT_SERVICE_ACCOUNT_EMAIL',
      input.AGENT_SERVICE_ACCOUNT_EMAIL,
      nodeEnvironment === 'production' ? '' : 'local-agent@localhost',
    ),
    // Static shared secret for the agent-only MCP endpoints (chart/document
    // tool access over HTTP). Unlike AGENT_SERVICE_AUDIENCE's per-call GCP
    // workload-identity token, this is long-lived — minder-agent's MCP
    // Remote transport resolves its headers once at manifest load and never
    // refreshes them, so a token with a Google-enforced ~1hr expiry isn't
    // usable here. Rotate via the k8s Secret, not by redeploying code.
    MCP_SHARED_SECRET: requiredString(
      'MCP_SHARED_SECRET',
      input.MCP_SHARED_SECRET,
      nodeEnvironment === 'production' ? '' : 'local-development-mcp-shared-secret',
    ),
    MINDER_ASSERTION_PRIVATE_KEY_PEM: ed25519PrivateKey(
      'MINDER_ASSERTION_PRIVATE_KEY_PEM',
      input.MINDER_ASSERTION_PRIVATE_KEY_PEM,
      nodeEnvironment === 'production' ? '' : DEFAULT_DEVELOPMENT_MINDER_ASSERTION_PRIVATE_KEY,
    ),
    MINDER_ASSERTION_KEY_ID: keyIdentifier(
      'MINDER_ASSERTION_KEY_ID',
      input.MINDER_ASSERTION_KEY_ID,
      nodeEnvironment === 'production' ? '' : 'local-development-2026',
    ),
    MINDER_ASSERTION_TTL_SECONDS: integerValue(
      'MINDER_ASSERTION_TTL_SECONDS',
      input.MINDER_ASSERTION_TTL_SECONDS,
      60,
      30,
      60,
    ),
    LOCAL_AUTH_BYPASS: localAuthBypass,
    LOCAL_AUTH_BYPASS_TOKEN: localAuthBypassToken,
    LOCAL_AUTH_BYPASS_SUBJECT: requiredString(
      'LOCAL_AUTH_BYPASS_SUBJECT',
      input.LOCAL_AUTH_BYPASS_SUBJECT,
      'local-developer',
    ),
    LOCAL_AUTH_BYPASS_EMAIL: stringValue(
      'LOCAL_AUTH_BYPASS_EMAIL',
      input.LOCAL_AUTH_BYPASS_EMAIL,
      'local-developer@celesnity.local',
    ),
    DATABASE_URL: validatedUrl('DATABASE_URL', input.DATABASE_URL, DEFAULT_DATABASE_URL),
    MINIO_ENDPOINT: validatedMinioEndpoint(input.MINIO_ENDPOINT),
    MINIO_ACCESS_KEY: requiredMinioCredential(
      'MINIO_ACCESS_KEY',
      input.MINIO_ACCESS_KEY,
      nodeEnvironment === 'production' ? '' : DEFAULT_DEVELOPMENT_MINIO_ACCESS_KEY,
    ),
    MINIO_SECRET_KEY: requiredMinioCredential(
      'MINIO_SECRET_KEY',
      input.MINIO_SECRET_KEY,
      nodeEnvironment === 'production' ? '' : DEFAULT_DEVELOPMENT_MINIO_SECRET_KEY,
    ),
    MINIO_WAREHOUSE_BUCKET: warehouseBucket,
    MINIO_ARTIFACTS_BUCKET: artifactsBucket,
    FIRMWARE_ARTIFACTS_BUCKET: firmwareArtifactsBucket,
    FIRMWARE_ARTIFACT_STORAGE_PROVIDER: enumValue(
      'FIRMWARE_ARTIFACT_STORAGE_PROVIDER',
      input.FIRMWARE_ARTIFACT_STORAGE_PROVIDER,
      'MINIO',
      ['MINIO', 'GCS'] as const,
    ),
    FIRMWARE_DOWNLOAD_URL_TTL_SECONDS: integerValue(
      'FIRMWARE_DOWNLOAD_URL_TTL_SECONDS',
      input.FIRMWARE_DOWNLOAD_URL_TTL_SECONDS,
      DEFAULT_FIRMWARE_DOWNLOAD_URL_TTL_SECONDS,
      60,
      86_400,
    ),
    FIRMWARE_SIGNING_PROVIDER: enumValue(
      'FIRMWARE_SIGNING_PROVIDER',
      input.FIRMWARE_SIGNING_PROVIDER,
      nodeEnvironment === 'production' ? 'GCP_KMS' : 'LOCAL_ED25519',
      ['LOCAL_ED25519', 'GCP_KMS'] as const,
    ),
    FIRMWARE_SIGNING_KEY_ID: requiredString(
      'FIRMWARE_SIGNING_KEY_ID',
      input.FIRMWARE_SIGNING_KEY_ID,
      nodeEnvironment === 'production' ? '' : 'local-dev',
    ),
    FIRMWARE_SIGNING_PRIVATE_KEY: stringAllowingEmpty(
      'FIRMWARE_SIGNING_PRIVATE_KEY',
      input.FIRMWARE_SIGNING_PRIVATE_KEY,
      nodeEnvironment === 'production' ? '' : DEFAULT_DEVELOPMENT_FIRMWARE_SIGNING_PRIVATE_KEY,
    ),
    FIRMWARE_SIGNING_KMS_KEY_VERSION: stringAllowingEmpty(
      'FIRMWARE_SIGNING_KMS_KEY_VERSION',
      input.FIRMWARE_SIGNING_KMS_KEY_VERSION,
      '',
    ),
    SCRIPT_SOURCE_MAX_BYTES: integerValue(
      'SCRIPT_SOURCE_MAX_BYTES',
      input.SCRIPT_SOURCE_MAX_BYTES,
      DEFAULT_SCRIPT_SOURCE_MAX_BYTES,
      1,
      MAX_SCRIPT_SOURCE_BYTES,
    ),
    TRINO_URL: validatedUrl('TRINO_URL', input.TRINO_URL, 'http://localhost:18082'),
    SPARK_MASTER_URL: stringValue(
      'SPARK_MASTER_URL',
      input.SPARK_MASTER_URL,
      'spark://localhost:7077',
    ),
    // The status contract lives on the master's web UI. `SPARK_MASTER_STATUS_URL`
    // names it outright for the common local case where the submit URL points
    // at a Compose service this process cannot resolve; the port alone is
    // enough when host and port agree.
    SPARK_MASTER_STATUS_URL: stringAllowingEmpty(
      'SPARK_MASTER_STATUS_URL',
      input.SPARK_MASTER_STATUS_URL,
      '',
    ),
    SPARK_MASTER_UI_PORT: integerValue(
      'SPARK_MASTER_UI_PORT',
      input.SPARK_MASTER_UI_PORT,
      8080,
      1,
      65_535,
    ),
    CONNECTION_CREDENTIAL_KEYS: credentialKeys,
    CONNECTION_CREDENTIAL_ACTIVE_KEY_VERSION: activeKeyVersion,
    CONNECTION_ALLOW_PRIVATE_DESTINATIONS: booleanValue(
      'CONNECTION_ALLOW_PRIVATE_DESTINATIONS',
      input.CONNECTION_ALLOW_PRIVATE_DESTINATIONS,
      nodeEnvironment !== 'production',
    ),
    CONNECTION_ALLOWED_HOSTS: stringAllowingEmpty(
      'CONNECTION_ALLOWED_HOSTS',
      input.CONNECTION_ALLOWED_HOSTS,
      nodeEnvironment === 'production' ? '' : DEFAULT_DEVELOPMENT_ALLOWED_HOSTS,
    ),
    CONNECTION_TEST_TIMEOUT_MS: integerValue(
      'CONNECTION_TEST_TIMEOUT_MS',
      input.CONNECTION_TEST_TIMEOUT_MS,
      5000,
      100,
      60_000,
    ),
    EXECUTION_TIMEOUT_MS: integerValue(
      'EXECUTION_TIMEOUT_MS',
      input.EXECUTION_TIMEOUT_MS,
      900_000,
      1_000,
      86_400_000,
    ),
    EXECUTION_POLL_INTERVAL_MS: integerValue(
      'EXECUTION_POLL_INTERVAL_MS',
      input.EXECUTION_POLL_INTERVAL_MS,
      1_000,
      100,
      60_000,
    ),
    EXECUTION_CLAIM_BATCH_SIZE: integerValue(
      'EXECUTION_CLAIM_BATCH_SIZE',
      input.EXECUTION_CLAIM_BATCH_SIZE,
      1,
      1,
      100,
    ),
    EXECUTION_MAX_ATTEMPTS: integerValue(
      'EXECUTION_MAX_ATTEMPTS',
      input.EXECUTION_MAX_ATTEMPTS,
      3,
      1,
      10,
    ),
    DATA_WORKFLOW_WORKER_POLL_INTERVAL_MS: integerValue(
      'DATA_WORKFLOW_WORKER_POLL_INTERVAL_MS',
      input.DATA_WORKFLOW_WORKER_POLL_INTERVAL_MS,
      1_000,
      100,
      60_000,
    ),
    DATA_WORKFLOW_CLAIM_BATCH_SIZE: integerValue(
      'DATA_WORKFLOW_CLAIM_BATCH_SIZE',
      input.DATA_WORKFLOW_CLAIM_BATCH_SIZE,
      4,
      1,
      100,
    ),
    DATA_WORKFLOW_LEASE_MS: integerValue(
      'DATA_WORKFLOW_LEASE_MS',
      input.DATA_WORKFLOW_LEASE_MS,
      30_000,
      1_000,
      900_000,
    ),
    DATA_WORKFLOW_RECONCILIATION_INTERVAL_MS: integerValue(
      'DATA_WORKFLOW_RECONCILIATION_INTERVAL_MS',
      input.DATA_WORKFLOW_RECONCILIATION_INTERVAL_MS,
      5_000,
      100,
      300_000,
    ),
    DATA_WORKFLOW_WATCH_SOURCE_POLL_LIMIT: integerValue(
      'DATA_WORKFLOW_WATCH_SOURCE_POLL_LIMIT',
      input.DATA_WORKFLOW_WATCH_SOURCE_POLL_LIMIT,
      1_000,
      1,
      10_000,
    ),
    DATA_WORKFLOW_WATCH_SOURCE_TIMEOUT_MS: integerValue(
      'DATA_WORKFLOW_WATCH_SOURCE_TIMEOUT_MS',
      input.DATA_WORKFLOW_WATCH_SOURCE_TIMEOUT_MS,
      30_000,
      1_000,
      600_000,
    ),
    DATA_WORKFLOW_WATCH_SOURCE_RECONCILIATION_BATCH_SIZE: integerValue(
      'DATA_WORKFLOW_WATCH_SOURCE_RECONCILIATION_BATCH_SIZE',
      input.DATA_WORKFLOW_WATCH_SOURCE_RECONCILIATION_BATCH_SIZE,
      100,
      1,
      1_000,
    ),
    DATA_WORKFLOW_CDC_ENABLED: booleanValue(
      'DATA_WORKFLOW_CDC_ENABLED',
      input.DATA_WORKFLOW_CDC_ENABLED,
      false,
    ),
    DATA_WORKFLOW_CDC_TOPIC: stringValue(
      'DATA_WORKFLOW_CDC_TOPIC',
      input.DATA_WORKFLOW_CDC_TOPIC,
      'celesnity.data-workflow.cdc.v1',
    ),
    DATA_WORKFLOW_CDC_CONSUMER_GROUP_ID: stringValue(
      'DATA_WORKFLOW_CDC_CONSUMER_GROUP_ID',
      input.DATA_WORKFLOW_CDC_CONSUMER_GROUP_ID,
      'celesnity.data-workflow-cdc.v1',
    ),
    DATA_WORKFLOW_CDC_SEAL_INTERVAL_MS: integerValue(
      'DATA_WORKFLOW_CDC_SEAL_INTERVAL_MS',
      input.DATA_WORKFLOW_CDC_SEAL_INTERVAL_MS,
      1_000,
      100,
      60_000,
    ),
    DEBEZIUM_CONNECT_URL: validatedUrl(
      'DEBEZIUM_CONNECT_URL',
      input.DEBEZIUM_CONNECT_URL,
      'http://127.0.0.1:18083',
    ),
    DEBEZIUM_CONNECT_TIMEOUT_MS: integerValue(
      'DEBEZIUM_CONNECT_TIMEOUT_MS',
      input.DEBEZIUM_CONNECT_TIMEOUT_MS,
      5_000,
      100,
      60_000,
    ),
    METADATA_CRAWLER_SCHEDULE_INTERVAL_MS: integerValue(
      'METADATA_CRAWLER_SCHEDULE_INTERVAL_MS',
      input.METADATA_CRAWLER_SCHEDULE_INTERVAL_MS,
      15_000,
      1_000,
      300_000,
    ),
    METADATA_CRAWLER_CLAIM_BATCH_SIZE: integerValue(
      'METADATA_CRAWLER_CLAIM_BATCH_SIZE',
      input.METADATA_CRAWLER_CLAIM_BATCH_SIZE,
      2,
      1,
      32,
    ),
    METADATA_CRAWLER_CONSUMER_GROUP_ID: stringValue(
      'METADATA_CRAWLER_CONSUMER_GROUP_ID',
      input.METADATA_CRAWLER_CONSUMER_GROUP_ID,
      'celesnity.metadata-crawler-worker.v1',
    ),
    METADATA_CRAWLER_RECOVERY_INTERVAL_MS: integerValue(
      'METADATA_CRAWLER_RECOVERY_INTERVAL_MS',
      input.METADATA_CRAWLER_RECOVERY_INTERVAL_MS,
      60_000,
      1_000,
      86_400_000,
    ),
    METADATA_CRAWLER_LEASE_MS: metadataCrawlerLeaseMs,
    METADATA_CRAWLER_HEARTBEAT_MS: metadataCrawlerHeartbeatMs,
    METADATA_CRAWLER_MAX_ATTEMPTS: integerValue(
      'METADATA_CRAWLER_MAX_ATTEMPTS',
      input.METADATA_CRAWLER_MAX_ATTEMPTS,
      3,
      1,
      10,
    ),
    METADATA_CRAWLER_RELATION_CONCURRENCY: integerValue(
      'METADATA_CRAWLER_RELATION_CONCURRENCY',
      input.METADATA_CRAWLER_RELATION_CONCURRENCY,
      4,
      1,
      16,
    ),
    SPARK_EXECUTION_BACKEND: enumValue(
      'SPARK_EXECUTION_BACKEND',
      input.SPARK_EXECUTION_BACKEND,
      'docker',
      ['docker', 'kubernetes'],
    ),
    SPARK_SUBMIT_MASTER_URL: stringValue(
      'SPARK_SUBMIT_MASTER_URL',
      input.SPARK_SUBMIT_MASTER_URL,
      'spark://spark:7077',
    ),
    SPARK_CONTAINER: stringValue('SPARK_CONTAINER', input.SPARK_CONTAINER, 'celesnity-poc-spark-1'),
    SPARK_SUBMIT_BIN: stringValue(
      'SPARK_SUBMIT_BIN',
      input.SPARK_SUBMIT_BIN,
      '/opt/spark/bin/spark-submit',
    ),
    KUBERNETES_NAMESPACE: stringValue(
      'KUBERNETES_NAMESPACE',
      input.KUBERNETES_NAMESPACE,
      'celesnity',
    ),
    SPARK_EXECUTION_IMAGE: stringValue(
      'SPARK_EXECUTION_IMAGE',
      input.SPARK_EXECUTION_IMAGE,
      'celesnity/spark:3.5.7-iceberg-1.11.0',
    ),
    SPARK_JOB_SERVICE_ACCOUNT: stringValue(
      'SPARK_JOB_SERVICE_ACCOUNT',
      input.SPARK_JOB_SERVICE_ACCOUNT,
      'celesnity-spark-job',
    ),
    SPARK_KUBERNETES_POLL_INTERVAL_MS: integerValue(
      'SPARK_KUBERNETES_POLL_INTERVAL_MS',
      input.SPARK_KUBERNETES_POLL_INTERVAL_MS,
      1_000,
      250,
      60_000,
    ),
    SPARK_JOB_TTL_SECONDS: integerValue(
      'SPARK_JOB_TTL_SECONDS',
      input.SPARK_JOB_TTL_SECONDS,
      3_600,
      60,
      86_400,
    ),
    SPARK_DRIVER_MEMORY: stringValue('SPARK_DRIVER_MEMORY', input.SPARK_DRIVER_MEMORY, '1g'),
    SPARK_EXECUTOR_MEMORY: stringValue('SPARK_EXECUTOR_MEMORY', input.SPARK_EXECUTOR_MEMORY, '1g'),
    SPARK_EXECUTOR_CORES: integerValue(
      'SPARK_EXECUTOR_CORES',
      input.SPARK_EXECUTOR_CORES,
      1,
      1,
      16,
    ),
    SPARK_MAX_CORES: integerValue('SPARK_MAX_CORES', input.SPARK_MAX_CORES, 2, 1, 64),
    TRINO_USER: stringValue('TRINO_USER', input.TRINO_USER, 'celesnity'),
    // Empty means "send no credentials", which is what the local Compose stack
    // needs: it runs Trino unauthenticated over plain HTTP, and an Authorization
    // header on a server without a password authenticator is rejected outright.
    //
    // Deliberately not required in production. Whether Trino demands a password is
    // a property of the Trino deployment rather than of this environment, so
    // enforcing it here would break any setup that has authentication switched off
    // while telling the operator nothing useful.
    TRINO_PASSWORD: stringAllowingEmpty('TRINO_PASSWORD', input.TRINO_PASSWORD, ''),
    TRINO_CATALOG: stringValue('TRINO_CATALOG', input.TRINO_CATALOG, 'iceberg'),
    CATALOG_PREVIEW_MAX_ROWS: integerValue(
      'CATALOG_PREVIEW_MAX_ROWS',
      input.CATALOG_PREVIEW_MAX_ROWS,
      100,
      1,
      100_000,
    ),
    COLUMN_PROFILE_CACHE_TTL_MS: integerValue(
      'COLUMN_PROFILE_CACHE_TTL_MS',
      input.COLUMN_PROFILE_CACHE_TTL_MS,
      30 * 60_000,
      1_000,
      24 * 60 * 60_000,
    ),
    SQL_QUERY_TIMEOUT_MS: integerValue(
      'SQL_QUERY_TIMEOUT_MS',
      input.SQL_QUERY_TIMEOUT_MS,
      60_000,
      1_000,
      3_600_000,
    ),
    SQL_MAX_RESULT_ROWS: integerValue(
      'SQL_MAX_RESULT_ROWS',
      input.SQL_MAX_RESULT_ROWS,
      1_000,
      1,
      1_000_000,
    ),

    // --- Outbox relay -------------------------------------------------------
    OUTBOX_RELAY_POLL_INTERVAL_MS: integerValue(
      'OUTBOX_RELAY_POLL_INTERVAL_MS',
      input.OUTBOX_RELAY_POLL_INTERVAL_MS,
      1_000,
      100,
      60_000,
    ),
    OUTBOX_RELAY_BATCH_SIZE: integerValue(
      'OUTBOX_RELAY_BATCH_SIZE',
      input.OUTBOX_RELAY_BATCH_SIZE,
      100,
      1,
      1_000,
    ),
    OUTBOX_RELAY_MAX_ATTEMPTS: integerValue(
      'OUTBOX_RELAY_MAX_ATTEMPTS',
      input.OUTBOX_RELAY_MAX_ATTEMPTS,
      10,
      1,
      100,
    ),
    OUTBOX_RELAY_BASE_BACKOFF_MS: integerValue(
      'OUTBOX_RELAY_BASE_BACKOFF_MS',
      input.OUTBOX_RELAY_BASE_BACKOFF_MS,
      1_000,
      100,
      3_600_000,
    ),
    OUTBOX_RELAY_MAX_BACKOFF_MS: integerValue(
      'OUTBOX_RELAY_MAX_BACKOFF_MS',
      input.OUTBOX_RELAY_MAX_BACKOFF_MS,
      300_000,
      1_000,
      86_400_000,
    ),
    // Must exceed the time a batch can take to deliver, or a healthy relay's own
    // claims would be reclaimed underneath it and delivered twice.
    OUTBOX_RELAY_CLAIM_TIMEOUT_MS: integerValue(
      'OUTBOX_RELAY_CLAIM_TIMEOUT_MS',
      input.OUTBOX_RELAY_CLAIM_TIMEOUT_MS,
      300_000,
      10_000,
      86_400_000,
    ),
    OUTBOX_RELAY_MAINTENANCE_INTERVAL_MS: integerValue(
      'OUTBOX_RELAY_MAINTENANCE_INTERVAL_MS',
      input.OUTBOX_RELAY_MAINTENANCE_INTERVAL_MS,
      60_000,
      1_000,
      86_400_000,
    ),
    OUTBOX_RELAY_MAX_CONSECUTIVE_DRAINS: integerValue(
      'OUTBOX_RELAY_MAX_CONSECUTIVE_DRAINS',
      input.OUTBOX_RELAY_MAX_CONSECUTIVE_DRAINS,
      10,
      1,
      1_000,
    ),
    // Delivered messages are kept for a week by default: long enough to
    // investigate what was published, short enough that the table stays bounded.
    OUTBOX_RETENTION_MS: integerValue(
      'OUTBOX_RETENTION_MS',
      input.OUTBOX_RETENTION_MS,
      7 * 24 * 60 * 60 * 1_000,
      60_000,
      365 * 24 * 60 * 60 * 1_000,
    ),

    // --- MQTT streaming control plane -------------------------------------
    MQTT_PUBLIC_ENDPOINT: validatedMqttEndpoint(
      'MQTT_PUBLIC_ENDPOINT',
      input.MQTT_PUBLIC_ENDPOINT,
      'mqtt://localhost:1883',
    ),
    EMQX_API_URL: validatedUrl('EMQX_API_URL', input.EMQX_API_URL, 'http://localhost:18083/api/v5'),
    EMQX_API_KEY: stringValue('EMQX_API_KEY', input.EMQX_API_KEY, 'celesnity-core'),
    EMQX_API_SECRET: requiredEmqxApiSecret(input.EMQX_API_SECRET, nodeEnvironment === 'production'),
    REDPANDA_BROKERS: stringValue('REDPANDA_BROKERS', input.REDPANDA_BROKERS, 'localhost:19092'),
    REDPANDA_USERNAME: stringValue('REDPANDA_USERNAME', input.REDPANDA_USERNAME, 'celesnity-admin'),
    REDPANDA_PASSWORD: requiredRedpandaPassword(
      input.REDPANDA_PASSWORD,
      nodeEnvironment === 'production',
    ),
    REDPANDA_TLS_ENABLED: booleanValue(
      'REDPANDA_TLS_ENABLED',
      input.REDPANDA_TLS_ENABLED,
      nodeEnvironment === 'production',
    ),
    REDPANDA_CA_CERT: stringAllowingEmpty('REDPANDA_CA_CERT', input.REDPANDA_CA_CERT, ''),
    REDPANDA_CONTROL_TOPIC: stringValue(
      'REDPANDA_CONTROL_TOPIC',
      input.REDPANDA_CONTROL_TOPIC,
      'celesnity.streaming.control.v1',
    ),
    MINDER_AGENT_URL: minderAgentApiUrl(input.MINDER_AGENT_URL),
    AGENT_AUTOMATION_TOPICS: stringValue(
      'AGENT_AUTOMATION_TOPICS',
      input.AGENT_AUTOMATION_TOPICS,
      'celesnity.streaming.control.v1',
    ),
    AGENT_AUTOMATION_CONSUMER_GROUP_ID: stringValue(
      'AGENT_AUTOMATION_CONSUMER_GROUP_ID',
      input.AGENT_AUTOMATION_CONSUMER_GROUP_ID,
      'celesnity.agent-automation.v1',
    ),
    AGENT_AUTOMATION_SCHEDULE_INTERVAL_MS: integerValue(
      'AGENT_AUTOMATION_SCHEDULE_INTERVAL_MS',
      input.AGENT_AUTOMATION_SCHEDULE_INTERVAL_MS,
      15_000,
      1_000,
      3_600_000,
    ),
    AGENT_AUTOMATION_SCHEDULE_BATCH_SIZE: integerValue(
      'AGENT_AUTOMATION_SCHEDULE_BATCH_SIZE',
      input.AGENT_AUTOMATION_SCHEDULE_BATCH_SIZE,
      20,
      1,
      500,
    ),
    AGENT_ACTIONS_POLICY_PATH: stringValue(
      'AGENT_ACTIONS_POLICY_PATH',
      input.AGENT_ACTIONS_POLICY_PATH,
      'config/agent-actions.yaml',
    ),
    INTEGRATION_EVENT_PUBLISHER_BACKEND: enumValue(
      'INTEGRATION_EVENT_PUBLISHER_BACKEND',
      input.INTEGRATION_EVENT_PUBLISHER_BACKEND,
      nodeEnvironment === 'production' ? 'redpanda' : 'logging',
      ['logging', 'redpanda'],
    ),
    STREAMING_RECONCILE_INTERVAL_MS: integerValue(
      'STREAMING_RECONCILE_INTERVAL_MS',
      input.STREAMING_RECONCILE_INTERVAL_MS,
      2_000,
      250,
      60_000,
    ),
    STREAMING_RECONCILE_BATCH_SIZE: integerValue(
      'STREAMING_RECONCILE_BATCH_SIZE',
      input.STREAMING_RECONCILE_BATCH_SIZE,
      20,
      1,
      1_000,
    ),
    DEVICE_EXPECTED_CHECK_IN_INTERVAL_SECONDS: integerValue(
      'DEVICE_EXPECTED_CHECK_IN_INTERVAL_SECONDS',
      input.DEVICE_EXPECTED_CHECK_IN_INTERVAL_SECONDS,
      60,
      1,
      86_400,
    ),
    DEVICE_MISSED_CHECK_IN_THRESHOLD: integerValue(
      'DEVICE_MISSED_CHECK_IN_THRESHOLD',
      input.DEVICE_MISSED_CHECK_IN_THRESHOLD,
      3,
      1,
      100,
    ),
    DEVICE_CONTACT_MONITOR_INTERVAL_MS: integerValue(
      'DEVICE_CONTACT_MONITOR_INTERVAL_MS',
      input.DEVICE_CONTACT_MONITOR_INTERVAL_MS,
      5_000,
      250,
      60_000,
    ),
    DEVICE_CONTACT_MONITOR_BATCH_SIZE: integerValue(
      'DEVICE_CONTACT_MONITOR_BATCH_SIZE',
      input.DEVICE_CONTACT_MONITOR_BATCH_SIZE,
      100,
      1,
      1_000,
    ),
    DEVICE_CONFIGURATION_CONFIRMATION_TIMEOUT_SECONDS: integerValue(
      'DEVICE_CONFIGURATION_CONFIRMATION_TIMEOUT_SECONDS',
      input.DEVICE_CONFIGURATION_CONFIRMATION_TIMEOUT_SECONDS,
      300,
      5,
      86_400,
    ),
    DEVICE_CONFIGURATION_MONITOR_INTERVAL_MS: integerValue(
      'DEVICE_CONFIGURATION_MONITOR_INTERVAL_MS',
      input.DEVICE_CONFIGURATION_MONITOR_INTERVAL_MS,
      5_000,
      250,
      60_000,
    ),
    DEVICE_CONFIGURATION_MONITOR_BATCH_SIZE: integerValue(
      'DEVICE_CONFIGURATION_MONITOR_BATCH_SIZE',
      input.DEVICE_CONFIGURATION_MONITOR_BATCH_SIZE,
      100,
      1,
      1_000,
    ),
    FIRMWARE_BOOT_CONFIRMATION_TIMEOUT_SECONDS: integerValue(
      'FIRMWARE_BOOT_CONFIRMATION_TIMEOUT_SECONDS',
      input.FIRMWARE_BOOT_CONFIRMATION_TIMEOUT_SECONDS,
      300,
      5,
      86_400,
    ),
    FIRMWARE_CONFIRMATION_MONITOR_INTERVAL_MS: integerValue(
      'FIRMWARE_CONFIRMATION_MONITOR_INTERVAL_MS',
      input.FIRMWARE_CONFIRMATION_MONITOR_INTERVAL_MS,
      5_000,
      250,
      60_000,
    ),
    FIRMWARE_CONFIRMATION_MONITOR_BATCH_SIZE: integerValue(
      'FIRMWARE_CONFIRMATION_MONITOR_BATCH_SIZE',
      input.FIRMWARE_CONFIRMATION_MONITOR_BATCH_SIZE,
      100,
      1,
      1_000,
    ),
  };
}
import { createPrivateKey } from 'node:crypto';
