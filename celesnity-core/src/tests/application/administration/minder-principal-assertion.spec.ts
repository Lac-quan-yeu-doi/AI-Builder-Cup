import { generateKeyPairSync, sign } from 'node:crypto';

import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import {
  Ed25519MinderPrincipalAssertionIssuer,
  verifyCompactAssertion,
} from '@application/administration/minder-principal-assertion';

const issuedAt = 1_700_000_000;

describe('Ed25519MinderPrincipalAssertionIssuer', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();

  it('signs only Core-evaluated grants and never broadens absent feature claims', () => {
    const issuer = new Ed25519MinderPrincipalAssertionIssuer(privateKeyPem, 'core-test-2026', 60);
    const denied = verifyCompactAssertion(
      issuer.issue(
        principal({ mfaRequired: true, mfaVerified: false, visibleFeatures: undefined }),
        issuedAt,
      ),
      publicKeyPem,
      issuedAt,
    );
    expect(denied.permissions).toEqual([]);
    expect(denied.visible_features).toEqual([]);
    const viewer = verifyCompactAssertion(
      issuer.issue(principal({ role: 'VIEWER' }), issuedAt),
      publicKeyPem,
      issuedAt,
    );
    expect(viewer.permissions).toContain('workspace:read');
    expect(viewer.permissions).not.toContain('workspace:write');
  });

  it('signs a bounded organization-scoped assertion that verifies with its public key', () => {
    const issuer = new Ed25519MinderPrincipalAssertionIssuer(privateKeyPem, 'core-test-2026', 60);

    const token = issuer.issue(principal(), issuedAt);

    expect(verifyCompactAssertion(token, publicKeyPem, issuedAt + 30)).toEqual({
      iss: 'celesnity-core',
      aud: 'minder-agent',
      sub: 'alice',
      tenant_id: 'tenant-a',
      organization_id: '20000000-0000-4000-8000-000000000001',
      identity_id: '10000000-0000-4000-8000-000000000001',
      membership_id: '30000000-0000-4000-8000-000000000001',
      role: 'ORG_OWNER',
      permissions: [
        'workspace:read',
        'workspace:write',
        'organization:read',
        'organization:manage',
        'audit:read',
      ],
      mfa_verified: true,
      visible_features: ['QUERY'],
      auth_time: issuedAt - 10,
      iat: issuedAt,
      nbf: issuedAt,
      exp: issuedAt + 60,
      jti: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
      ),
    });
  });

  it('keeps the organization claims stable while changing the user claims', () => {
    const issuer = new Ed25519MinderPrincipalAssertionIssuer(privateKeyPem, 'core-test-2026', 60);
    const alice = JSON.parse(
      Buffer.from(issuer.issue(principal(), issuedAt).split('.')[1]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const bob = JSON.parse(
      Buffer.from(
        issuer
          .issue(
            principal({
              identityId: '10000000-0000-4000-8000-000000000002',
              subject: 'bob',
              membershipId: '30000000-0000-4000-8000-000000000002',
            }),
            issuedAt,
          )
          .split('.')[1]!,
        'base64url',
      ).toString('utf8'),
    ) as Record<string, unknown>;

    expect(bob).toMatchObject({
      tenant_id: alice.tenant_id,
      organization_id: alice.organization_id,
    });
    expect(bob.identity_id).not.toBe(alice.identity_id);
    expect(bob.membership_id).not.toBe(alice.membership_id);
  });

  it('rejects an assertion when a signed payload segment has been altered', () => {
    const issuer = new Ed25519MinderPrincipalAssertionIssuer(privateKeyPem, 'core-test-2026', 60);
    const token = issuer.issue(principal(), issuedAt);
    const [header = '', payload = '', signature = ''] = token.split('.');
    const alteredPayload = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
        sub: 'mallory',
      }),
      'utf8',
    ).toString('base64url');

    expect(() =>
      verifyCompactAssertion(
        `${header}.${alteredPayload}.${signature}`,
        publicKeyPem,
        issuedAt + 1,
      ),
    ).toThrow('signature');
  });

  it('rejects a correctly signed assertion that grants an unknown workspace feature', () => {
    const issuer = new Ed25519MinderPrincipalAssertionIssuer(privateKeyPem, 'core-test-2026', 60);
    const [header = '', payload = ''] = issuer.issue(principal(), issuedAt).split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const alteredPayload = Buffer.from(
      JSON.stringify({ ...claims, visible_features: ['UNRECOGNIZED_FEATURE'] }),
      'utf8',
    ).toString('base64url');
    const signature = sign(
      null,
      Buffer.from(`${header}.${alteredPayload}`, 'utf8'),
      privateKey,
    ).toString('base64url');

    expect(() =>
      verifyCompactAssertion(
        `${header}.${alteredPayload}.${signature}`,
        publicKeyPem,
        issuedAt + 1,
      ),
    ).toThrow('visible_features');
  });
});

function principal(overrides: Partial<AuthenticatedContext> = {}): AuthenticatedContext {
  return {
    identityId: '10000000-0000-4000-8000-000000000001',
    subject: 'alice',
    identityTenantId: 'tenant-a',
    organizationId: '20000000-0000-4000-8000-000000000001',
    organizationStatus: 'ACTIVE',
    mfaRequired: true,
    membershipId: '30000000-0000-4000-8000-000000000001',
    role: 'ORG_OWNER',
    authenticationTime: issuedAt - 10,
    mfaVerified: true,
    visibleFeatures: ['QUERY'],
    ...overrides,
  };
}
