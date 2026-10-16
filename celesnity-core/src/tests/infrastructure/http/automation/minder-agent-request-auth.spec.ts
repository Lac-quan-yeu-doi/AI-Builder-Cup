import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { MinderPrincipalAssertionIssuer } from '@application/administration/minder-principal-assertion';
import { createMinderAgentAuth } from '@infrastructure/http/automation/minder-agent-request-auth';
import { backgroundPrincipal } from '../../../application/administration/background-principal.fixture';

describe('createMinderAgentAuth', () => {
  it('creates a Bearer assertion from the active organization context', () => {
    const contexts = new AuthenticatedContextStore();
    const issuer = {
      issue: jest.fn().mockReturnValue('signed-assertion'),
      expiresAt: jest.fn().mockReturnValue(60),
    } as unknown as MinderPrincipalAssertionIssuer;

    const headers = contexts.run(principal(), () =>
      createMinderAgentAuth(contexts, issuer, () => 1_700_000_000),
    );

    expect(headers).toEqual({ Authorization: 'Bearer signed-assertion' });
    expect(issuer.issue).toHaveBeenCalledWith(principal(), 1_700_000_000);
  });

  it('does not fall back to a global caller when no organization context exists', () => {
    const issuer: MinderPrincipalAssertionIssuer = {
      issue: jest.fn().mockReturnValue('unused'),
      expiresAt: jest.fn().mockReturnValue(60),
    };
    expect(() =>
      createMinderAgentAuth(new AuthenticatedContextStore(), issuer, () => 1_700_000_000),
    ).toThrow('Authenticated organization context is required');
  });

  it('signs background requests with the organization that owns the event', async () => {
    const contexts = new AuthenticatedContextStore();
    contexts.configureBackgroundResolver(async (org) => backgroundPrincipal(org));
    const issuer = {
      issue: jest.fn((context: { organizationId: string }) => context.organizationId),
      expiresAt: jest.fn().mockReturnValue(60),
    } as unknown as MinderPrincipalAssertionIssuer;

    const first = await contexts.runBackground(
      'org-a',
      () => createMinderAgentAuth(contexts, issuer, () => 1_700_000_000),
      'AUTOMATIONS',
    );
    const second = await contexts.runBackground(
      'org-b',
      () => createMinderAgentAuth(contexts, issuer, () => 1_700_000_000),
      'AUTOMATIONS',
    );

    expect(first).toEqual({ Authorization: 'Bearer org-a' });
    expect(second).toEqual({ Authorization: 'Bearer org-b' });
    expect(first).not.toEqual(second);
  });
});

function principal() {
  return {
    identityId: '10000000-0000-4000-8000-000000000001',
    subject: 'alice',
    identityTenantId: 'tenant-a',
    organizationId: '20000000-0000-4000-8000-000000000001',
    organizationStatus: 'ACTIVE' as const,
    mfaRequired: false,
    membershipId: '30000000-0000-4000-8000-000000000001',
    role: 'ORG_OWNER' as const,
    authenticationTime: 1_699_999_990,
    mfaVerified: true,
  };
}
