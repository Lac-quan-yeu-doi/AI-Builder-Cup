import { createHmac, timingSafeEqual } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';

import type {
  IdentityTokenVerifier,
  VerifiedIdentityToken,
} from '@application/administration/identity-token.verifier';

const ISSUER = 'celesnity-local-development';
const AUDIENCE = 'celesnity-core-local';
const TENANT_ID = 'local';
const MAX_TOKEN_BYTES = 8_192;

interface LocalPersona {
  readonly email: string;
  readonly displayName: string;
}

const PERSONAS: Readonly<Record<string, LocalPersona>> = {
  'local-owner': {
    email: 'owner@local.celesnity.test',
    displayName: 'Local Organization Owner',
  },
  'local-data-engineer': {
    email: 'engineer@local.celesnity.test',
    displayName: 'Local Data Engineer',
  },
  'local-analyst': {
    email: 'analyst@local.celesnity.test',
    displayName: 'Local Analyst',
  },
  'local-viewer': {
    email: 'viewer@local.celesnity.test',
    displayName: 'Local Viewer',
  },
};

export class LocalDevelopmentIdentityTokenVerifier implements IdentityTokenVerifier {
  private readonly signingKey: string;

  public constructor(config: ConfigService) {
    if (config.getOrThrow<string>('NODE_ENV') === 'production') {
      throw new Error('Local development authentication is forbidden in production');
    }
    this.signingKey = config.getOrThrow<string>('LOCAL_DEV_AUTH_SIGNING_KEY');
    if (this.signingKey.length < 32) {
      throw new Error('LOCAL_DEV_AUTH_SIGNING_KEY must contain at least 32 characters');
    }
  }

  public async verify(token: string): Promise<VerifiedIdentityToken> {
    await Promise.resolve();
    if (Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES) throw invalidToken();
    const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.');
    if (
      encodedHeader === undefined ||
      encodedPayload === undefined ||
      encodedSignature === undefined ||
      extra !== undefined
    )
      throw invalidToken();

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expected = createHmac('sha256', this.signingKey).update(signingInput).digest();
    const actual = decodeBase64Url(encodedSignature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw invalidToken();
    }

    const header = parseObject(encodedHeader);
    const payload = parseObject(encodedPayload);
    if (header.alg !== 'HS256' || header.typ !== 'JWT') throw invalidToken();

    const now = Math.floor(Date.now() / 1_000);
    const subject = requiredString(payload.sub);
    const tenantId = requiredString(payload.tid);
    const persona = PERSONAS[subject];
    if (
      persona === undefined ||
      payload.iss !== ISSUER ||
      payload.aud !== AUDIENCE ||
      tenantId !== TENANT_ID ||
      payload.email !== persona.email ||
      payload.email_verified !== true ||
      payload.mfa_verified !== true ||
      !isInteger(payload.iat) ||
      !isInteger(payload.exp) ||
      !isInteger(payload.auth_time) ||
      payload.iat > now + 30 ||
      payload.exp <= now ||
      payload.exp > now + 43_230 ||
      payload.auth_time > now + 30
    )
      throw invalidToken();

    return {
      subject,
      tenantId,
      email: persona.email,
      displayName: persona.displayName,
      emailVerified: true,
      sessionId: typeof payload.sid === 'string' ? payload.sid : undefined,
      authenticationTime: payload.auth_time,
      mfaVerified: true,
    };
  }
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(value).toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw invalidToken();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw invalidToken();
  }
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw invalidToken();
  return Buffer.from(value, 'base64url');
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value === '') throw invalidToken();
  return value;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function invalidToken(): Error {
  return new Error('The local development session is invalid or expired');
}
