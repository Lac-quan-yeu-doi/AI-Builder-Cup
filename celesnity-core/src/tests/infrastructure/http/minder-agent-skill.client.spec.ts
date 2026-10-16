import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { MinderAgentSkillClient } from '@infrastructure/http/skill/minder-agent-skill.client';

describe('MinderAgentSkillClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the delegated caller subject for tenant-scoped skill requests', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const contexts = new AuthenticatedContextStore();
    const client = new MinderAgentSkillClient(
      { getOrThrow: () => 'http://minder-agent:8080/api/v2' } as never,
      contexts,
    );

    await contexts.run(
      {
        identityId: 'identity-1',
        subject: 'local-owner',
        identityTenantId: 'tenant-1',
        organizationId: 'org-1',
        organizationStatus: 'ACTIVE',
        mfaRequired: false,
        membershipId: 'membership-1',
        role: 'ORG_OWNER',
        authenticationTime: 0,
        mfaVerified: true,
      },
      () => client.list(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://minder-agent:8080/api/v2/skills',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Caller-Id': 'local-owner' }),
      }),
    );
  });
});
