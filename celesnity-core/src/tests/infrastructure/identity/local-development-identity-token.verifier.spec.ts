import { createHmac } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { LocalDevelopmentIdentityTokenVerifier } from '@infrastructure/identity/local-development-identity-token.verifier';

const key = 'local-development-signing-key-with-32-characters';

describe('LocalDevelopmentIdentityTokenVerifier', () => {
  it('accepts a signed, tenant-bound known persona', async () => {
    const verifier = createVerifier();
    const now = Math.floor(Date.now() / 1_000);

    await expect(
      verifier.verify(
        sign({
          iss: 'celesnity-local-development',
          aud: 'celesnity-core-local',
          sub: 'local-analyst',
          tid: 'local',
          email: 'analyst@local.celesnity.test',
          email_verified: true,
          mfa_verified: true,
          iat: now,
          exp: now + 3_600,
          auth_time: now,
          sid: 'local-session',
        }),
      ),
    ).resolves.toMatchObject({
      subject: 'local-analyst',
      tenantId: 'local',
      emailVerified: true,
      mfaVerified: true,
    });
  });

  it.each([
    ['an altered signature', alterSignature],
    [
      'an unknown persona',
      () => validToken({ sub: 'local-attacker', email: 'attacker@local.celesnity.test' }),
    ],
    ['the wrong tenant', () => validToken({ tid: 'other-tenant' })],
    ['an expired session', () => validToken({ exp: 1 })],
  ])('rejects %s', async (_label, mutate) => {
    await expect(createVerifier().verify(mutate(validToken()))).rejects.toThrow(
      'invalid or expired',
    );
  });

  it('cannot be constructed in production', () => {
    expect(
      () =>
        new LocalDevelopmentIdentityTokenVerifier(
          new ConfigService({
            NODE_ENV: 'production',
            LOCAL_DEV_AUTH_SIGNING_KEY: key,
          }),
        ),
    ).toThrow('forbidden in production');
  });
});

function createVerifier() {
  return new LocalDevelopmentIdentityTokenVerifier(
    new ConfigService({
      NODE_ENV: 'development',
      LOCAL_DEV_AUTH_SIGNING_KEY: key,
    }),
  );
}

function validToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1_000);
  return sign({
    iss: 'celesnity-local-development',
    aud: 'celesnity-core-local',
    sub: 'local-owner',
    tid: 'local',
    email: 'owner@local.celesnity.test',
    email_verified: true,
    mfa_verified: true,
    iat: now,
    exp: now + 3_600,
    auth_time: now,
    sid: 'local-session',
    ...overrides,
  });
}

function sign(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const input = `${header}.${body}`;
  const signature = createHmac('sha256', key).update(input).digest('base64url');
  return `${input}.${signature}`;
}

function alterSignature(token: string): string {
  const [header, payload, signature] = token.split('.');
  if (header === undefined || payload === undefined || signature === undefined) return token;
  const first = signature.startsWith('A') ? 'B' : 'A';
  return `${header}.${payload}.${first}${signature.slice(1)}`;
}
