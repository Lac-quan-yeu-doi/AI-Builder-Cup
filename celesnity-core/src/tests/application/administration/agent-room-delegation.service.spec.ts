import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import type { AgentRoomDelegationRepository } from '@application/administration/agent-room-delegation.repository';
import {
  AuthenticatedContextStore,
  type AuthenticatedContext,
} from '@application/administration/authenticated-context';

const principal: AuthenticatedContext = {
  identityId: '10000000-0000-4000-8000-000000000001',
  subject: 'subject-a',
  identityTenantId: 'tenant-a',
  organizationId: '20000000-0000-4000-8000-000000000001',
  organizationStatus: 'ACTIVE',
  mfaRequired: false,
  membershipId: '30000000-0000-4000-8000-000000000001',
  role: 'ORG_OWNER',
  authenticationTime: 0,
  mfaVerified: true,
  agentName: 'chat-assistant',
  visibleFeatures: ['QUERY'],
};
const runId = '40000000-0000-4000-8000-000000000001';
const audit = { write: jest.fn().mockResolvedValue(undefined) };
const runMethods = {
  registerRun: jest.fn().mockResolvedValue(undefined),
  resolveRun: jest.fn().mockResolvedValue(null),
  closeRun: jest.fn().mockResolvedValue(undefined),
};
function agentContexts(): AuthenticatedContextStore {
  const contexts = new AuthenticatedContextStore();
  contexts.configureAgentResolver(async (organizationId) => ({
    ...principal,
    organizationId,
    identityId: '40000000-0000-4000-8000-000000000002',
    role: 'SERVICE_ACCOUNT',
    mfaRequired: false,
    mfaVerified: false,
    servicePermissions: ['workspace:read', 'workspace:write'],
    visibleFeatures: ['QUERY', 'DOCUMENTS'],
  }));
  return contexts;
}

describe('AgentRoomDelegationService', () => {
  it('binds a selected schema to the server catalog, while null retains explicit All databases', async () => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn(),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
      registerRun: jest.fn().mockResolvedValue(undefined),
    };
    const contexts = agentContexts();
    const service = new AgentRoomDelegationService(repository, contexts, audit, 'iceberg');
    await contexts.run(principal, () =>
      service.registerRun('room-a', runId, 'chat-assistant', { schema: 'orders' }),
    );
    expect(repository.registerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { catalog: 'iceberg', schema: 'orders' },
      }),
    );
    await contexts.run(principal, () =>
      service.registerRun('room-a', '40000000-0000-4000-8000-000000000003', 'chat-assistant', null),
    );
    expect(repository.registerRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: null }),
    );
  });
  it('rejects a tool call claiming a different organization agent than the room binding', async () => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn().mockResolvedValue({ ...principal, agentName: 'chat-assistant' }),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
    };
    const service = new AgentRoomDelegationService(
      repository,
      new AuthenticatedContextStore(),
      audit,
      'iceberg',
    );
    const work = jest.fn();
    await expect(
      service.runForFeature(
        'room-a',
        'subject-a',
        'QUERY',
        work,
        'workspace:read',
        'automation-workflow-editor',
      ),
    ).rejects.toThrow('does not match');
    await expect(service.runForFeature('room-a', 'subject-a', 'QUERY', work)).rejects.toThrow(
      'does not match',
    );
    expect(work).not.toHaveBeenCalled();
  });

  it.each([
    { role: 'VIEWER', visibleFeatures: ['DOCUMENTS'] },
    { mfaRequired: true, mfaVerified: false, visibleFeatures: ['DOCUMENTS'] },
    { organizationStatus: 'SUSPENDED', visibleFeatures: ['DOCUMENTS'] },
  ])('does not execute a delegated write denied by the shared policy: %j', async (overrides) => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn().mockResolvedValue({ ...principal, ...overrides }),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
    };
    const service = new AgentRoomDelegationService(
      repository,
      new AuthenticatedContextStore(),
      audit,
      'iceberg',
    );
    const work = jest.fn();
    await expect(
      service.runForFeature(
        'room-a',
        'subject-a',
        'DOCUMENTS',
        work,
        'workspace:write',
        'chat-assistant',
        runId,
      ),
    ).rejects.toThrow();
    expect(work).not.toHaveBeenCalled();
  });
  it('runs the tool in the room-bound human tenant context', async () => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn().mockResolvedValue(principal),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
    };
    const contexts = agentContexts();
    const service = new AgentRoomDelegationService(repository, contexts, audit, 'iceberg');

    await expect(
      service.run(
        'room-a',
        'subject-a',
        async () => contexts.require(),
        { permission: 'workspace:read', anyFeature: ['QUERY'] },
        'chat-assistant',
        runId,
      ),
    ).resolves.toMatchObject({ ...principal, agentRunId: runId, agentRunScope: null });
    expect(repository.resolve).toHaveBeenCalledWith('room-a', 'subject-a');
  });

  it('correlates an allowed decision to the MCP request and refuses work when audit persistence fails', async () => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn().mockResolvedValue(principal),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
    };
    const contexts = agentContexts();
    const writer = {
      write: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('audit unavailable')),
    };
    const service = new AgentRoomDelegationService(repository, contexts, writer, 'iceberg');
    const work = jest.fn(async () => 'ok');
    await expect(
      service.runForFeature(
        'room-a',
        'subject-a',
        'QUERY',
        work,
        'workspace:read',
        'chat-assistant',
        runId,
        'request-1',
      ),
    ).resolves.toBe('ok');
    expect(writer.write).toHaveBeenCalledWith(
      expect.objectContaining({
        actorIdentityId: principal.identityId,
        requestId: 'request-1',
        eventType: 'AUTHORIZATION_DECISION',
        metadata: expect.objectContaining({ roomId: 'room-a', runId, reason: 'EXPLICIT_ALLOW' }),
      }),
    );
    await expect(
      service.runForFeature(
        'room-a',
        'subject-a',
        'QUERY',
        work,
        'workspace:read',
        'chat-assistant',
        runId,
        'request-2',
      ),
    ).rejects.toThrow('audit unavailable');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('audits a missing registered run as a denial before any tool executes', async () => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn().mockResolvedValue(principal),
      resolveRun: jest.fn().mockResolvedValue(undefined),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
    };
    const writer = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new AgentRoomDelegationService(repository, agentContexts(), writer, 'iceberg');
    const work = jest.fn();
    await expect(
      service.runForFeature(
        'room-a',
        'subject-a',
        'QUERY',
        work,
        'workspace:read',
        'chat-assistant',
        runId,
        'request-denied',
      ),
    ).rejects.toThrow('RUN_REGISTRATION_INVALID');
    expect(work).not.toHaveBeenCalled();
    expect(writer.write).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'FAILED',
        requestId: 'request-denied',
        metadata: expect.objectContaining({ reason: 'RUN_REGISTRATION_INVALID' }),
      }),
    );
  });

  it('does not accept an old Agent call without a Core-registered run', async () => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn().mockResolvedValue(principal),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
    };
    const writer = { write: jest.fn().mockResolvedValue(undefined) };
    const work = jest.fn();
    const service = new AgentRoomDelegationService(repository, agentContexts(), writer, 'iceberg');
    await expect(
      service.runForFeature(
        'room-a',
        'subject-a',
        'QUERY',
        work,
        'workspace:read',
        'chat-assistant',
        undefined,
        'old-run',
      ),
    ).rejects.toThrow('RUN_REGISTRATION_REQUIRED');
    expect(repository.resolveRun).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
    expect(writer.write).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'old-run',
        metadata: expect.objectContaining({ reason: 'RUN_REGISTRATION_REQUIRED' }),
      }),
    );
  });

  it('refuses an unbound or inactive delegation without running the tool', async () => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn().mockResolvedValue(undefined),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
    };
    const contexts = agentContexts();
    const service = new AgentRoomDelegationService(repository, contexts, audit, 'iceberg');
    const tool = jest.fn();

    await expect(
      service.runForFeature(
        'room-a',
        'subject-b',
        'QUERY',
        tool,
        'workspace:read',
        'chat-assistant',
        runId,
      ),
    ).rejects.toThrow('MCP room delegation is invalid or no longer active.');
    expect(tool).not.toHaveBeenCalled();
  });

  it('denies a delegated tool when its workspace feature is not visible', async () => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn().mockResolvedValue({ ...principal, visibleFeatures: ['DOCUMENTS'] }),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
    };
    const service = new AgentRoomDelegationService(
      repository,
      new AuthenticatedContextStore(),
      audit,
      'iceberg',
    );
    const tool = jest.fn();

    await expect(
      service.runForFeature(
        'room-a',
        'subject-a',
        'QUERY',
        tool,
        'workspace:read',
        'chat-assistant',
        runId,
      ),
    ).rejects.toThrow('FEATURE_ACCESS_DENIED');
    expect(tool).not.toHaveBeenCalled();
  });

  it('attributes a chart-preview denial to the Agent ceiling when the human may use Analytics', async () => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn().mockResolvedValue({ ...principal, visibleFeatures: null }),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
    };
    const contexts = agentContexts();
    const writer = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new AgentRoomDelegationService(repository, contexts, writer, 'iceberg');
    const work = jest.fn();

    await expect(service.runForFeature(
      'room-a', 'subject-a', 'ANALYTICS', work, 'workspace:read',
      'chat-assistant', runId, 'chart-request',
    )).rejects.toThrow('SERVICE_IDENTITY_DENIED');
    expect(work).not.toHaveBeenCalled();
    expect(writer.write).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'FAILED',
      requestId: 'chart-request',
      metadata: expect.objectContaining({ reason: 'SERVICE_IDENTITY_DENIED' }),
    }));
  });

  it('runs a delegated tool when its workspace feature is visible', async () => {
    const repository: AgentRoomDelegationRepository = {
      ...runMethods,
      resolve: jest.fn().mockResolvedValue({ ...principal, visibleFeatures: ['QUERY'] }),
      automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
    };
    const contexts = agentContexts();
    const service = new AgentRoomDelegationService(repository, contexts, audit, 'iceberg');

    await expect(
      service.runForFeature(
        'room-a',
        'subject-a',
        'QUERY',
        async () => contexts.require(),
        'workspace:read',
        'chat-assistant',
        runId,
      ),
    ).resolves.toMatchObject({ identityId: principal.identityId });
  });

  it('runs an automation tool in the validated organization service context', async () => {
    const automationRunBelongsToOrganization = jest.fn().mockResolvedValue(true);
    const service = new AgentRoomDelegationService(
      { ...runMethods, resolve: jest.fn(), automationRunBelongsToOrganization },
      agentContexts(),
      audit,
      'iceberg',
    );

    await expect(
      service.runForAutomation(
        'agent-run-1',
        'org-1',
        'QUERY',
        async () => 'ok',
        'workspace:read',
        'chat-assistant',
      ),
    ).resolves.toBe('ok');
    expect(automationRunBelongsToOrganization).toHaveBeenCalledWith(
      'agent-run-1',
      'org-1',
      'chat-assistant',
    );
  });

  it('audits automation allow and deny decisions with the MCP request ID before executing', async () => {
    const automationRunBelongsToOrganization = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const writer = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new AgentRoomDelegationService(
      { ...runMethods, resolve: jest.fn(), automationRunBelongsToOrganization },
      agentContexts(),
      writer,
      'iceberg',
    );
    const work = jest.fn(async () => 'ok');
    await expect(
      service.runForAutomation(
        'agent-run-1',
        'org-1',
        'QUERY',
        work,
        'workspace:read',
        'chat-assistant',
        'request-denied',
        'agent@example.test',
      ),
    ).rejects.toThrow('AUTOMATION_RUN_INVALID');
    expect(work).not.toHaveBeenCalled();
    expect(writer.write).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-denied',
        outcome: 'FAILED',
        metadata: expect.objectContaining({
          reason: 'AUTOMATION_RUN_INVALID',
          workloadEmail: 'agent@example.test',
        }),
      }),
    );
    await expect(
      service.runForAutomation(
        'agent-run-1',
        'org-1',
        'QUERY',
        work,
        'workspace:read',
        'chat-assistant',
        'request-allowed',
      ),
    ).resolves.toBe('ok');
    expect(writer.write).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-allowed',
        outcome: 'SUCCEEDED',
        metadata: expect.objectContaining({ reason: 'EXPLICIT_ALLOW', runId: 'agent-run-1' }),
      }),
    );
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('rejects an automation run outside the claimed organization', async () => {
    const service = new AgentRoomDelegationService(
      {
        ...runMethods,
        resolve: jest.fn(),
        automationRunBelongsToOrganization: jest.fn().mockResolvedValue(false),
      },
      new AuthenticatedContextStore(),
      audit,
      'iceberg',
    );
    const work = jest.fn();

    await expect(
      service.runForAutomation(
        'agent-run-1',
        'org-2',
        'QUERY',
        work,
        'workspace:read',
        'chat-assistant',
      ),
    ).rejects.toThrow('Automation MCP delegation is invalid.');
    expect(work).not.toHaveBeenCalled();
  });
});
