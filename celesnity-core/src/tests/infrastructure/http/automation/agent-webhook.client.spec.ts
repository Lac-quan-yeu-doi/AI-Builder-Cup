import type { ConfigService } from '@nestjs/config';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { MinderPrincipalAssertionIssuer } from '@application/administration/minder-principal-assertion';
import { AgentWebhookClient } from '@infrastructure/http/automation/agent-webhook.client';

describe('AgentWebhookClient', () => {
  const configServiceFake = {
    getOrThrow: jest.fn((key: string) =>
      key === 'MINDER_AGENT_URL' ? 'http://minder-agent.internal/api/v2' : '',
    ),
  } as unknown as ConfigService;

  afterEach(() => jest.restoreAllMocks());

  it('POSTs to /webhooks/{source}/runs with delivery and caller headers, returns TRIGGERED with the run id on 2xx', async () => {
    const fetchMock = jest.fn(
      async () =>
        ({
          ok: true,
          status: 202,
          json: async () => ({
            run_id: 'run-1',
            session_id: 'session-1',
            events_url: '/runs/run-1/events',
          }),
        }) as unknown as Response,
    );
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    const client = new AgentWebhookClient(configServiceFake);
    const result = await client.trigger({
      source: 'agent-automation',
      deliveryId: 'delivery-1',
      sessionKey: 'automation:auto-1:delivery-1',
      input: 'hello',
      agentId: 'chat-assistant',
    });

    // minder-runtime's admission response carries the real run id
    // (StartedBody.run_id) on a fresh trigger — this is the only place that
    // id is ever available, so dropping it here (only checking response.ok)
    // makes every automation-triggered run untraceable back to its actual
    // agent execution.
    expect(result).toEqual({
      outcome: 'TRIGGERED',
      runId: 'run-1',
      callerId: 'celesnity-core/automation-dispatcher',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://minder-agent.internal/api/v2/webhooks/agent-automation/runs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Delivery-Id': 'delivery-1',
          'X-Caller-Id': 'celesnity-core/automation-dispatcher',
        }),
      }),
    );
    // minder-runtime's TurnBody.input is a plain Rust `String` — sending an
    // object here (the bug this guards against) fails deserialization with
    // a 422 on the real service, invisible to a test that only checks headers.
    // "agent" must be set too, or minder-runtime silently falls back to the
    // bare built-in prompt instead of this automation's own agent manifest.
    const calls = fetchMock.mock.calls as unknown[][];
    const requestInit = calls[0]?.[1] as RequestInit;
    const sentBody = JSON.parse(requestInit.body as string) as {
      session_key: string;
      input: unknown;
      agent: unknown;
    };
    expect(sentBody).toEqual({
      session_key: 'automation:auto-1:delivery-1',
      input: 'hello',
      agent: 'chat-assistant',
    });
    expect(typeof sentBody.input).toBe('string');
  });

  it('includes system_prompt in the body only when systemPrompt is set, as snake_case', async () => {
    const fetchMock = jest.fn(
      async () =>
        ({ ok: true, status: 202, json: async () => ({ run_id: 'run-1' }) }) as unknown as Response,
    );
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    const client = new AgentWebhookClient(configServiceFake);
    await client.trigger({
      source: 'automation-workflow',
      deliveryId: 'delivery-2',
      sessionKey: 'workflow:run-1:step-1',
      input: 'hello',
      agentId: 'chat-assistant',
      systemPrompt: 'You are a terse schema critic.',
    });

    const requestInit = (fetchMock.mock.calls as unknown[][])[0]?.[1] as RequestInit;
    const sentBody = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({
      session_key: 'workflow:run-1:step-1',
      input: 'hello',
      agent: 'chat-assistant',
      system_prompt: 'You are a terse schema critic.',
    });
  });

  it('omits system_prompt from the body when systemPrompt is undefined', async () => {
    const fetchMock = jest.fn(
      async () =>
        ({ ok: true, status: 202, json: async () => ({ run_id: 'run-1' }) }) as unknown as Response,
    );
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    const client = new AgentWebhookClient(configServiceFake);
    await client.trigger({
      source: 'automation-workflow',
      deliveryId: 'delivery-3',
      sessionKey: 'workflow:run-1:step-1',
      input: 'hello',
      agentId: 'chat-assistant',
    });

    const requestInit = (fetchMock.mock.calls as unknown[][])[0]?.[1] as RequestInit;
    const sentBody = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(sentBody).not.toHaveProperty('system_prompt');
  });

  it('sends the registered automation run ID without exposing the downstream failure body', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'Trusted automation context is invalid.',
    } as unknown as Response);

    const client = new AgentWebhookClient(configServiceFake);
    const result = await client.trigger({
      source: 'automation-workflow',
      deliveryId: 'delivery-4',
      sessionKey: 'workflow:run-1:step-1',
      input: 'hello',
      agentId: 'chat-assistant',
      runId: '40000000-0000-4000-8000-000000000001',
      automationContext: {
        workflowId: 'workflow-1',
        workflowRunId: 'workflow-run-1',
        workflowStepId: 'step-1',
        organizationId: 'org-1',
      },
    });

    expect(result).toEqual({
      outcome: 'UNREACHABLE',
      message: 'minder-agent returned 400 Bad Request',
    });
    const requestInit = (globalThis.fetch as unknown as jest.Mock).mock
      .calls[0]?.[1] as RequestInit;
    const sentBody = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(sentBody).toMatchObject({
      run_id: '40000000-0000-4000-8000-000000000001',
      automation_context: {
        kind: 'automation-workflow',
        workflow_id: 'workflow-1',
        workflow_run_id: 'workflow-run-1',
        workflow_step_id: 'step-1',
        organization_id: 'org-1',
      },
    });
  });

  it('returns TRIGGERED without a run id for a duplicate-delivery response (no run_id in that body shape)', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'duplicate_delivery' }),
    } as unknown as Response);
    const client = new AgentWebhookClient(configServiceFake);
    const result = await client.trigger({
      source: 'x',
      deliveryId: 'd',
      sessionKey: 's',
      input: '',
      agentId: 'chat-assistant',
    });
    expect(result).toEqual({
      outcome: 'TRIGGERED',
      callerId: 'celesnity-core/automation-dispatcher',
    });
  });

  it('sends Core-assigned workflow run IDs and rejects admissions that change them', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ run_id: '40000000-0000-4000-8000-000000000002' }),
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    const client = new AgentWebhookClient(configServiceFake);
    const result = await client.trigger({
      source: 'automation-workflow',
      deliveryId: 'delivery-4',
      sessionKey: 'workflow:run-1:step-1',
      input: 'hello',
      agentId: 'chat-assistant',
      runId: '40000000-0000-4000-8000-000000000001',
    });
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({
      run_id: '40000000-0000-4000-8000-000000000001',
    });
    expect(result).toMatchObject({ outcome: 'UNREACHABLE' });
  });

  it('returns UNKNOWN_AGENT on a 404 response', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' } as Response);
    const client = new AgentWebhookClient(configServiceFake);
    const result = await client.trigger({
      source: 'x',
      deliveryId: 'd',
      sessionKey: 's',
      input: '',
      agentId: 'does-not-exist',
    });
    expect(result.outcome).toBe('UNKNOWN_AGENT');
  });

  it('returns UNREACHABLE when fetch throws', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new AgentWebhookClient(configServiceFake);
    const result = await client.trigger({
      source: 'x',
      deliveryId: 'd',
      sessionKey: 's',
      input: '',
      agentId: 'chat-assistant',
    });
    expect(result.outcome).toBe('UNREACHABLE');
  });

  it('listAgents GETs tenant manifests and maps snake_case system_prompt to camelCase', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { name: 'chat-assistant', system_prompt: 'You are Minder...' },
        { name: 'automation-workflow-editor' },
      ],
    } as unknown as Response);

    const client = new AgentWebhookClient(configServiceFake);
    const result = await client.listAgents();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://minder-agent.internal/api/v2/agent-manifests',
      {
      headers: { 'X-Caller-Id': 'celesnity-core/automation-dispatcher' },
      },
    );
    expect(result).toEqual([
      { name: 'chat-assistant', systemPrompt: 'You are Minder...' },
      { name: 'automation-workflow-editor' },
    ]);
  });

  it('listAgents uses the delegated tenant subject when one is active', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as unknown as Response);
    const contexts = {
      current: () => ({ subject: 'user-tenant-1' }),
    } as unknown as AuthenticatedContextStore;

    const client = new AgentWebhookClient(configServiceFake, contexts);
    await client.listAgents();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://minder-agent.internal/api/v2/agent-manifests',
      {
      headers: { 'X-Caller-Id': 'user-tenant-1' },
      },
    );
  });

  it('forwards a signed Core assertion when an authenticated context is available', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as unknown as Response);
    const contexts = new AuthenticatedContextStore();
    const issuer = {
      issue: jest.fn().mockReturnValue('signed-organization-assertion'),
      expiresAt: jest.fn().mockReturnValue(60),
    } as unknown as MinderPrincipalAssertionIssuer;
    const client = new AgentWebhookClient(configServiceFake, contexts, issuer);

    await contexts.run(
      {
        identityId: 'identity-1',
        subject: 'user-1',
        identityTenantId: 'tenant-1',
        organizationId: 'org-1',
        organizationStatus: 'ACTIVE',
        mfaRequired: false,
        membershipId: 'membership-1',
        role: 'ORG_OWNER',
        authenticationTime: 0,
        mfaVerified: true,
      },
      () => client.listAgents(),
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://minder-agent.internal/api/v2/agent-manifests',
      {
      headers: { Authorization: 'Bearer signed-organization-assertion' },
      },
    );
  });

  it('listAgents throws when minder-agent responds with a non-2xx status', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);
    const client = new AgentWebhookClient(configServiceFake);
    await expect(client.listAgents()).rejects.toThrow('500');
  });
});
