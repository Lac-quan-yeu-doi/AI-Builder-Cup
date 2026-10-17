/**
 * Shared HTTP access for the demo seed scripts (Demo Data 1 and Demo Data 2).
 *
 * Defaults target the local Docker Compose stack in this repository: Core on
 * 127.0.0.1:3001, the agent on 127.0.0.1:8090, and the compose default
 * local-development signing key. Override with environment variables to seed a
 * deployed environment instead:
 *
 *   CELESNITY_CORE_URL         Core API base, e.g. https://dev.example.com/api/v1
 *   CELESNITY_ACCESS_TOKEN     bearer token for the demo user (deployed stacks)
 *   LOCAL_DEV_AUTH_SIGNING_KEY local stacks: mint a local-development token
 *   CELESNITY_LOCAL_PERSONA    local persona, default local-owner
 *   MINDER_AGENT_URL           agent API base, e.g. http://127.0.0.1:8090/api/v2
 *
 * Core is not uniform about request casing. `plant-model`, `pipelines` and
 * `metadata-crawlers` take camelCase bodies; `dashboards`, `chart-authoring`
 * and `chart-collections` take snake_case. Nothing here converts between them —
 * each caller sends what its own endpoint documents.
 */
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

/** The signing key docker-compose.yaml uses when .env does not set one. */
const COMPOSE_DEFAULT_SIGNING_KEY = 'local-development-only-signing-key-do-not-use-in-prod';

export function coreUrl() {
  return (process.env.CELESNITY_CORE_URL ?? 'http://127.0.0.1:3001/api/v1').replace(/\/$/u, '');
}

const isLocalCore = () => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//u.test(`${coreUrl()}/`);

/**
 * Mints the HMAC token `LocalDevelopmentIdentityTokenVerifier` accepts, so the
 * seed scripts can run against a laptop stack without a deployment. Local
 * development only — Core refuses this verifier when NODE_ENV is production.
 */
function localDevelopmentToken(signingKey, subject = 'local-owner') {
  const emails = {
    'local-owner': 'owner@local.celesnity.test',
    'local-data-engineer': 'engineer@local.celesnity.test',
    'local-analyst': 'analyst@local.celesnity.test',
    'local-viewer': 'viewer@local.celesnity.test',
  };
  const email = emails[subject];
  if (email === undefined) throw new Error(`Unknown local development persona ${subject}.`);
  const now = Math.floor(Date.now() / 1_000);
  const encode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: subject,
    tid: 'local',
    iss: 'celesnity-local-development',
    aud: 'celesnity-core-local',
    email,
    email_verified: true,
    mfa_verified: true,
    iat: now,
    auth_time: now,
    exp: now + 40_000,
  })}`;
  return `${body}.${createHmac('sha256', signingKey).update(body).digest('base64url')}`;
}

export function accessToken() {
  const value = process.env.CELESNITY_ACCESS_TOKEN;
  if (value) return value;
  const signingKey =
    process.env.LOCAL_DEV_AUTH_SIGNING_KEY ?? (isLocalCore() ? COMPOSE_DEFAULT_SIGNING_KEY : undefined);
  if (signingKey) {
    return localDevelopmentToken(signingKey, process.env.CELESNITY_LOCAL_PERSONA ?? 'local-owner');
  }
  throw new Error(
    'Set CELESNITY_ACCESS_TOKEN to a bearer token for the demo user, or ' +
      'LOCAL_DEV_AUTH_SIGNING_KEY to seed a local stack.',
  );
}

/**
 * Calls Core and unwraps its `{ success, data }` envelope. A failure carries the
 * response body, because Core's validation errors name the offending field and
 * losing that turns a seed run into guesswork.
 */
export async function coreFetch(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${coreUrl()}/${path.replace(/^\//u, '')}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed with HTTP ${response.status}: ${text.slice(0, 2_000)}`,
    );
  }
  if (text === '') return undefined;
  const parsed = JSON.parse(text);
  return Object.hasOwn(parsed, 'data') ? parsed.data : parsed;
}

const agentBase = () =>
  (process.env.MINDER_AGENT_URL ?? 'http://127.0.0.1:8090/api/v2').replace(/\/$/u, '');

/**
 * Calls the minder agent as the demo user. The agent (core-assertion auth mode)
 * accepts only a short-lived Core-signed assertion, exchanged per call — the
 * same thing the web app's /api/agent proxy does.
 */
export async function agentFetch(path, init = {}) {
  const { token } = await coreFetch('administration/minder-principal-assertion', { method: 'POST' });
  const response = await fetch(`${agentBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status}: ${text.slice(0, 500)}`);
  }
  return text === '' ? undefined : JSON.parse(text);
}

/**
 * Ids the later seed scripts need, one file per demo so both demos can live in
 * one workspace. Not secret — they are workspace identifiers.
 */
export function idsStore(path) {
  const readIds = () => {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return {};
    }
  };
  const writeIds = (values) => {
    const merged = { ...readIds(), ...values };
    writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    return merged;
  };
  return { readIds, writeIds };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};

/**
 * The source database both demos read, as Core reaches it inside the compose
 * network (`sample-postgres`, loaded from mock-data/init). Override the parts
 * with SAMPLE_POSTGRES_* when seeding a different environment.
 */
export function sourceDatabase() {
  return {
    host: process.env.SAMPLE_POSTGRES_HOST ?? 'sample-postgres',
    port: Number(process.env.SAMPLE_POSTGRES_INTERNAL_PORT ?? 5432),
    database: process.env.SAMPLE_POSTGRES_DB ?? 'sample',
    username: process.env.SAMPLE_POSTGRES_USER ?? 'sample',
    password: process.env.SAMPLE_POSTGRES_PASSWORD ?? 'sample_dev_password',
  };
}

/** The pinned end date of the committed dumps (see build-dumps.mjs). */
export const DATA_END_DATE = '2026-10-09';
