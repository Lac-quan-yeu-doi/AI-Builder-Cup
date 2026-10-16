import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { backgroundPrincipal } from './background-principal.fixture';

describe('AuthenticatedContextStore persisted Agent identity', () => {
  it('fails closed without a resolver or explicit grants', async () => {
    const contexts = new AuthenticatedContextStore();
    await expect(contexts.resolveAgentIdentity('org-a', {
      permission: 'workspace:read', feature: 'QUERY',
    })).rejects.toThrow('resolver is required');
    contexts.configureAgentResolver(async (org) => ({
      ...backgroundPrincipal(org), servicePermissions: [], visibleFeatures: [],
    }));
    await expect(contexts.resolveAgentIdentity('org-a', {
      permission: 'workspace:read', feature: 'QUERY',
    })).rejects.toThrow('SERVICE_IDENTITY_DENIED');
  });

  it('keeps Agent and background service actors distinct', async () => {
    const contexts = new AuthenticatedContextStore();
    contexts.configureBackgroundResolver(async (org) => backgroundPrincipal(org));
    contexts.configureAgentResolver(async (org) => ({
      ...backgroundPrincipal(org),
      identityId: '40000000-0000-4000-8000-000000000002',
      subject: `agent:${org}`,
      servicePermissions: ['workspace:read'],
      visibleFeatures: ['QUERY'],
    }));
    const agent = await contexts.resolveAgentIdentity('20000000-0000-4000-8000-000000000009', {
      permission: 'workspace:read', feature: 'QUERY',
    });
    const background = await contexts.runBackground(
      '20000000-0000-4000-8000-000000000009',
      () => contexts.require(),
      'AUTOMATIONS',
    );

    expect(agent.subject).not.toBe(background.subject);
    expect(agent.identityId).not.toBe(background.identityId);
    expect(agent.mfaVerified).toBe(false);
  });

  it('distinguishes an Agent capability ceiling from a human feature denial', async () => {
    const contexts = new AuthenticatedContextStore();
    contexts.configureAgentResolver(async (org) => ({
      ...backgroundPrincipal(org),
      servicePermissions: ['workspace:read'],
      visibleFeatures: ['QUERY'],
    }));
    await expect(contexts.resolveAgentIdentity('org-a', {
      permission: 'workspace:read', feature: 'ANALYTICS',
    })).rejects.toThrow('SERVICE_IDENTITY_DENIED');
  });
});
