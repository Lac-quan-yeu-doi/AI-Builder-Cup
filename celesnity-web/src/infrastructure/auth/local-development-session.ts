import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { LocalDevelopmentPersona } from '@/src/entities/models/session';
import { SESSION_MAX_AGE_SECONDS } from '@/src/entities/models/session';

const PERSONA_EMAILS: Readonly<Record<LocalDevelopmentPersona, string>> = {
  'local-owner': 'owner@local.celesnity.test',
  'local-data-engineer': 'engineer@local.celesnity.test',
  'local-analyst': 'analyst@local.celesnity.test',
  'local-viewer': 'viewer@local.celesnity.test',
};

export function createLocalDevelopmentSession(persona: LocalDevelopmentPersona): string {
  // NODE_ENV is not a usable guard here: Next.js inlines it into the
  // compiled bundle at `next build` time as a literal "production" string,
  // so a runtime override can never change it for code shipped via the
  // standalone Docker image. CELESNITY_AUTH_MODE is a plain runtime env
  // read and is the only functional gate — a real deployment simply never
  // sets it to "local-development".
  if (process.env.CELESNITY_AUTH_MODE !== 'local-development') {
    throw new Error('Local development authentication is disabled.');
  }
  const key = process.env.LOCAL_DEV_AUTH_SIGNING_KEY ?? '';
  if (key.length < 32) {
    throw new Error('LOCAL_DEV_AUTH_SIGNING_KEY must contain at least 32 characters.');
  }
  const tenantId = 'local';

  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    iss: 'celesnity-local-development',
    aud: 'celesnity-core-local',
    sub: persona,
    tid: tenantId,
    email: PERSONA_EMAILS[persona],
    email_verified: true,
    mfa_verified: true,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
    auth_time: now,
    sid: randomUUID(),
  });
  const input = `${header}.${payload}`;
  return `${input}.${createHmac('sha256', key).update(input).digest('base64url')}`;
}

export function verifyLocalDevelopmentSession(session: string): string {
  // See createLocalDevelopmentSession() above: NODE_ENV can't gate this in a
  // standalone Docker build, so CELESNITY_AUTH_MODE is the sole check.
  if (process.env.CELESNITY_AUTH_MODE !== 'local-development') {
    throw new Error('Local development authentication is disabled.');
  }
  const key = process.env.LOCAL_DEV_AUTH_SIGNING_KEY ?? '';
  if (key.length < 32) {
    throw new Error('LOCAL_DEV_AUTH_SIGNING_KEY must contain at least 32 characters.');
  }
  const parts = session.split('.');
  if (parts.length !== 3) throw new Error('Invalid local development session.');
  const [header, payload, signature] = parts;
  if (header === undefined || payload === undefined || signature === undefined) {
    throw new Error('Invalid local development session.');
  }
  const expected = createHmac('sha256', key).update(`${header}.${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid local development session signature.');
  }
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    aud?: unknown;
    exp?: unknown;
    sub?: unknown;
  };
  if (
    claims.aud !== 'celesnity-core-local' ||
    typeof claims.exp !== 'number' ||
    claims.exp <= Math.floor(Date.now() / 1_000) ||
    typeof claims.sub !== 'string' ||
    claims.sub === ''
  ) {
    throw new Error('Invalid or expired local development session.');
  }
  return claims.sub;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
