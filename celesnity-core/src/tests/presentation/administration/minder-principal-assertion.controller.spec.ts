import { generateKeyPairSync } from 'node:crypto';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import {
  Ed25519MinderPrincipalAssertionIssuer,
  verifyCompactAssertion,
} from '@application/administration/minder-principal-assertion';
import { MinderPrincipalAssertionController } from '@presentation/administration/minder-principal-assertion.controller';
import { REQUIRED_WORKSPACE_FEATURES } from '@presentation/http/required-workspace-feature.decorator';

describe('MinderPrincipalAssertionController', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();

  it('is available to normal agent users with the HOME workspace feature', () => {
    expect(
      Reflect.getMetadata(REQUIRED_WORKSPACE_FEATURES, MinderPrincipalAssertionController),
    ).toEqual(['HOME']);
  });

  it('issues a Core assertion for the authenticated organization context only', () => {
    const contexts = new AuthenticatedContextStore();
    const controller = new MinderPrincipalAssertionController(
      contexts,
      new Ed25519MinderPrincipalAssertionIssuer(privateKeyPem, 'core-test-2026', 60),
      { now: () => new Date('2023-11-14T22:13:20.000Z') },
    );
    const now = 1_700_000_000;

    const response = contexts.run(principal(), () => controller.issue());

    expect(response.expires_at).toBe('2023-11-14T22:14:20.000Z');
    expect(verifyCompactAssertion(response.token, publicKeyPem, now + 30)).toMatchObject({
      sub: 'alice',
      tenant_id: 'tenant-a',
      organization_id: '20000000-0000-4000-8000-000000000001',
      membership_id: '30000000-0000-4000-8000-000000000001',
    });
  });

  it('does not mint an assertion without the global authentication context', () => {
    const controller = new MinderPrincipalAssertionController(
      new AuthenticatedContextStore(),
      new Ed25519MinderPrincipalAssertionIssuer(privateKeyPem, 'core-test-2026', 60),
      { now: () => new Date('2023-11-14T22:13:20.000Z') },
    );

    expect(() => controller.issue()).toThrow('Authenticated organization context is required');
  });
});

function principal() {
  return {
    identityId: '10000000-0000-4000-8000-000000000001',
    subject: 'alice',
    identityTenantId: 'tenant-a',
    organizationId: '20000000-0000-4000-8000-000000000001',
    organizationStatus: 'ACTIVE' as const,
    mfaRequired: true,
    membershipId: '30000000-0000-4000-8000-000000000001',
    role: 'ORG_OWNER' as const,
    authenticationTime: 1_699_999_990,
    mfaVerified: true,
    visibleFeatures: ['HOME'] as const,
  };
}
