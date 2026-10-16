import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import type { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { PlantModelUseCases } from '@application/plant-model/plant-model.use-cases';
import { PlantModelMcpController } from '@presentation/plant-model/plant-model-mcp.controller';

class TestController extends PlantModelMcpController {
  public run(meta: RequestMeta | undefined, call: () => Promise<CallToolResult>) {
    return this.runToolCall(meta, call);
  }
}

describe('PlantModelMcpController delegation', () => {
  const result: CallToolResult = { content: [{ type: 'text', text: 'ok' }] };
  const principal = {
    identityId: 'identity-a',
    subject: 'subject-a',
    identityTenantId: 'tenant-a',
    organizationId: 'organization-a',
    organizationStatus: 'ACTIVE' as const,
    mfaRequired: false,
    membershipId: 'membership-a',
    role: 'VIEWER' as const,
    authenticationTime: 0,
    mfaVerified: true,
  };

  it('executes in the trusted room owner organization', async () => {
    const contexts = new AuthenticatedContextStore();
    const runForFeature = jest.fn(
      async (
        _room: string,
        _subject: string,
        _feature: string,
        call: () => Promise<CallToolResult>,
      ) => contexts.run(principal, call),
    );
    const controller = new TestController(
      {} as PlantModelUseCases,
      { runForFeature } as unknown as AgentRoomDelegationService,
      contexts,
    );
    const call = jest.fn().mockResolvedValue(result);
    await expect(
      controller.run(
        {
          'com.celesnity/room-id': 'room-a',
          'com.celesnity/caller-subject': 'subject-a',
          'com.minder/agent': 'chat-assistant',
          'com.celesnity/authorization-run-id': '40000000-0000-4000-8000-000000000001',
        },
        call,
      ),
    ).resolves.toEqual(result);
    expect(runForFeature).toHaveBeenCalledWith(
      'room-a',
      'subject-a',
      'PLANT_MODEL',
      expect.any(Function),
      'workspace:read',
      'chat-assistant',
      '40000000-0000-4000-8000-000000000001',
      undefined,
      undefined,
    );
  });

  it('fails closed without complete delegation metadata', async () => {
    const delegation = { runForFeature: jest.fn() } as unknown as AgentRoomDelegationService;
    const controller = new TestController(
      {} as PlantModelUseCases,
      delegation,
      new AuthenticatedContextStore(),
    );
    await expect(controller.run(undefined, async () => result)).rejects.toThrow(
      'Trusted MCP room delegation metadata is required.',
    );
    expect(delegation.runForFeature).not.toHaveBeenCalled();
  });

  it('denies a delegated role without workspace read', async () => {
    const contexts = new AuthenticatedContextStore();
    const auditor = { ...principal, role: 'AUDITOR' as const };
    const delegation = {
      runForFeature: async (
        _room: string,
        _subject: string,
        _feature: string,
        call: () => Promise<CallToolResult>,
      ) => contexts.run(auditor, call),
    } as AgentRoomDelegationService;
    const controller = new TestController({} as PlantModelUseCases, delegation, contexts);

    await expect(
      controller.run(
        {
          'com.celesnity/room-id': 'room-a',
          'com.celesnity/caller-subject': 'subject-a',
        },
        async () => result,
      ),
    ).rejects.toThrow('Permission workspace:read is required.');
  });
});
