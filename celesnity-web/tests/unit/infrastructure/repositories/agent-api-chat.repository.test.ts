import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ConflictError,
  NotFoundError,
  RemoteServiceError,
} from '@/src/entities/errors/application-errors';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { AgentApiChatRepository } from '@/src/infrastructure/repositories/agent-api-chat.repository';

// publicEnvironment.chatAgentName throws if unset (see public-environment.ts)
// — these tests exercise room creation/message send, which reads it, but
// don't care about its actual value, so stub a real one for the file.
const ORIGINAL_CHAT_AGENT_NAME = process.env.NEXT_PUBLIC_CHAT_AGENT_NAME;
beforeAll(() => {
  process.env.NEXT_PUBLIC_CHAT_AGENT_NAME = 'test-chat-agent';
});
afterAll(() => {
  process.env.NEXT_PUBLIC_CHAT_AGENT_NAME = ORIGINAL_CHAT_AGENT_NAME;
});

interface RecordedRequest {
  readonly path: string;
  readonly init?: RequestInit;
}

class FakeGeneratedApiTransport implements GeneratedApiTransport {
  public readonly requests: RecordedRequest[] = [];
  public readonly streamRequests: RecordedRequest[] = [];
  private readonly responses: unknown[];
  private readonly streamResponse: Response | Error | undefined;

  public constructor(responses: unknown[] = [], streamResponse?: Response | Error) {
    this.responses = [...responses];
    this.streamResponse = streamResponse;
  }

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    const response = this.responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    // Agent admission echoes the pre-registered UUID. A canned fixture run
    // ID would model the old (unsafe) behavior where Agent chose another ID.
    if (
      path.endsWith('/runs') &&
      init?.method === 'POST' &&
      response !== null &&
      typeof response === 'object' &&
      'run_id' in response
    )
      return {
        ...response,
        run_id: (bodyOf({ path, init }) as { run_id: string }).run_id,
      } as TResponse;
    return response as TResponse;
  }

  public async stream(path: string, init?: RequestInit): Promise<Response> {
    this.streamRequests.push({ path, ...(init ? { init } : {}) });
    if (this.streamResponse instanceof Error) {
      throw this.streamResponse;
    }
    if (!this.streamResponse) {
      throw new Error('no stream response configured');
    }
    return this.streamResponse;
  }
}

const bodyOf = (request: RecordedRequest | undefined): unknown =>
  JSON.parse(String(request?.init?.body));

const headerOf = (request: RecordedRequest | undefined, name: string): string | null =>
  new Headers(request?.init?.headers).get(name);

describe('AgentApiChatRepository', () => {
  it('loads durable room run events for conversation history', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        room_id: 'room-1',
        truncated: false,
        runs: [
          {
            run_id: 'run-1',
            session_id: 'session-1',
            input: 'List sales',
            status: 'completed',
            created_at: '2026-09-16T09:00:00.000Z',
            finished_at: '2026-09-16T09:00:01.000Z',
            response_text: 'Done',
            events: [{ seq: 1, payload: { type: 'tool_started', data: { id: 'tool-1' } } }],
          },
        ],
      },
    ]);
    const repository = new AgentApiChatRepository(transport);

    await expect(repository.getRoomHistory('u1', 'room-1')).resolves.toEqual([
      expect.objectContaining({
        runId: 'run-1',
        responseText: 'Done',
        events: [{ seq: 1, payload: { type: 'tool_started', data: { id: 'tool-1' } } }],
      }),
    ]);
    expect(transport.requests[0]?.path).toBe('/rooms/room-1/history');
    expect(headerOf(transport.requests[0], 'X-Caller-Id')).toBe('u1');
  });

  it('maps the TypeScript reliability read models and follows trace pagination', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        run_id: 'run-1',
        manifest: {
          owner: 'tenant-1',
          systemPrompt: 'You are a data assistant.',
          skills: ['warehouse'],
          model: { name: 'gpt-test' },
          tools: { mode: 'allowlist', names: ['query'] },
          execution: { mode: 'interactive' },
        },
        manifest_name: 'chat-assistant',
        content_hash: 'sha256:test',
        source_path: '/agents/chat-assistant.yaml',
        yaml: 'name: chat-assistant',
        created_at: '2026-09-16T09:00:00.000Z',
      },
      {
        run_id: 'run-1',
        events: [
          {
            seq: 1,
            event: { type: 'tool_started', data: { tool: 'query' } },
            created_at: '2026-09-16T09:00:01.000Z',
          },
        ],
        next_cursor: '1',
      },
      {
        run_id: 'run-1',
        events: [
          {
            seq: 2,
            event: { type: 'run_completed', data: { output: 'done' } },
            created_at: '2026-09-16T09:00:02.000Z',
          },
        ],
      },
      {
        run_id: 'run-1',
        validations: [
          {
            name: 'run_status',
            passed: true,
            details: { status: 'completed' },
            created_at: '2026-09-16T09:00:02.000Z',
          },
        ],
      },
    ]);
    const repository = new AgentApiChatRepository(transport);

    await expect(repository.getRunManifest('u1', 'run-1')).resolves.toMatchObject({
      manifestId: 'chat-assistant',
      runId: 'run-1',
      agent: { owner: 'tenant-1' },
      instructions: { systemPrompt: 'You are a data assistant.' },
      skills: [{ name: 'warehouse' }],
      model: { name: 'gpt-test' },
      tools: { mode: 'allowlist', names: ['query'] },
      runtime: { execution: { mode: 'interactive' } },
    });

    await expect(repository.getRunTrace('u1', 'run-1')).resolves.toEqual([
      expect.objectContaining({
        spanId: 'run-1:1',
        name: 'tool_started',
        kind: 'tool_started',
        attributes: { type: 'tool_started', data: { tool: 'query' }, seq: 1 },
      }),
      expect.objectContaining({
        spanId: 'run-1:2',
        name: 'run_completed',
        status: 'succeeded',
      }),
    ]);
    expect(transport.requests.map((request) => request.path)).toContain(
      '/runs/run-1/trace?cursor=1&limit=500',
    );

    await expect(repository.getRunValidation('u1', 'run-1')).resolves.toMatchObject({
      status: 'valid',
      contractId: 'run_validations',
      attempts: 1,
      errors: [],
      validatedAt: '2026-09-16T09:00:02.000Z',
    });
  });

  it('lists agent approval requests for a run', async () => {
    const transport = new FakeGeneratedApiTransport([
      [
        {
          id: 'approval-1',
          tool_call_id: 'tool-1',
          action: 'document.create',
          arguments_hash: 'hash-1',
          preview: 'Create report.md',
          status: 'pending',
          created_at: '2026-09-16T09:00:00.000Z',
          expires_at: '2026-09-16T10:00:00.000Z',
        },
      ],
    ]);
    const repository = new AgentApiChatRepository(transport);

    await expect(repository.listRunApprovals('u1', 'run-1')).resolves.toEqual([
      {
        id: 'approval-1',
        toolCallId: 'tool-1',
        action: 'document.create',
        argumentsHash: 'hash-1',
        preview: 'Create report.md',
        status: 'pending',
        createdAt: '2026-09-16T09:00:00.000Z',
        expiresAt: '2026-09-16T10:00:00.000Z',
        decidedAt: null,
      },
    ]);
    expect(transport.requests[0]?.path).toBe('/runs/run-1/approvals');
    expect(headerOf(transport.requests[0], 'X-Caller-Id')).toBe('u1');
  });

  it('decides an agent approval request and sends the caller identity', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        id: 'approval-1',
        tool_call_id: 'tool-1',
        action: 'document.create',
        arguments_hash: 'hash-1',
        preview: 'Create report.md',
        status: 'approved',
        created_at: '2026-09-16T09:00:00.000Z',
        expires_at: '2026-09-16T10:00:00.000Z',
        decided_at: '2026-09-16T09:01:00.000Z',
      },
    ]);
    const repository = new AgentApiChatRepository(transport);

    await expect(
      repository.decideRunApproval('u1', 'run-1', 'approval-1', 'approved'),
    ).resolves.toMatchObject({ status: 'approved' });
    expect(transport.requests[0]?.path).toBe('/runs/run-1/approvals/approval-1/decision');
    expect(bodyOf(transport.requests[0])).toEqual({ decision: 'approved' });
    expect(headerOf(transport.requests[0], 'X-Caller-Id')).toBe('u1');
  });

  it('creates a room keyed on the session, not the (shared) userId, when no roomId is given', async () => {
    const transport = new FakeGeneratedApiTransport([
      { id: 'room-1' },
      {
        run_id: 'run-1',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 0,
      },
    ]);
    const coreTransport = new FakeGeneratedApiTransport([undefined]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    const result = await repository.sendMessage({
      userId: 'u1',
      roomId: null,
      message: 'hi',
      sessionKey: 'session-abc',
    });

    expect(transport.requests[0]?.path).toBe('/rooms');
    // The key must vary per session — reusing userId as the key means every
    // session after the first collides on the same (owner, key) pair and the
    // server rejects room creation with 409 "<key> is already taken".
    expect(bodyOf(transport.requests[0])).toMatchObject({ key: 'session-abc' });
    expect(headerOf(transport.requests[0], 'X-Caller-Id')).toBe('u1');
    expect(coreTransport.requests[0]?.path).toBe('/rooms/room-1/message-blocks/bind');

    expect(transport.requests[1]?.path).toBe('/rooms/room-1/runs');
    expect(bodyOf(transport.requests[1])).toMatchObject({ input: 'hi' });
    expect(headerOf(transport.requests[1], 'X-Caller-Id')).toBe('u1');

    expect(result).toEqual({
      runId: expect.any(String),
      roomId: 'room-1',
      roomEventsUrl: '/rooms/room-1/events',
      queuePosition: 0,
    });
  });

  it('renews Core room authorization before every run in an existing room', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        run_id: 'run-2',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 0,
      },
    ]);
    const coreTransport = new FakeGeneratedApiTransport([undefined]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    await repository.sendMessage({
      userId: 'u1',
      roomId: 'room-1',
      message: 'Explore my data catalog',
      sessionKey: 'session-abc',
    });

    expect(coreTransport.requests).toEqual([
      expect.objectContaining({
        path: '/rooms/room-1/message-blocks/bind',
        init: expect.objectContaining({ method: 'POST' }),
      }),
      expect.objectContaining({
        path: '/rooms/room-1/agent-runs',
        init: expect.objectContaining({ method: 'POST' }),
      }),
    ]);
    expect(bodyOf(coreTransport.requests[0])).toEqual({ agentName: 'test-chat-agent' });
    const registration = bodyOf(coreTransport.requests[1]) as { runId: string; scope: unknown };
    expect(registration.scope).toBeNull();
    expect(bodyOf(transport.requests[0])).toMatchObject({ run_id: registration.runId });
    expect(transport.requests[0]?.path).toBe('/rooms/room-1/runs');
  });

  it('does not launch an existing-room run when Core rejects the binding renewal', async () => {
    const transport = new FakeGeneratedApiTransport([]);
    const coreTransport = new FakeGeneratedApiTransport([new CoreApiError(403, 'MFA required')]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    await expect(
      repository.sendMessage({
        userId: 'u1',
        roomId: 'room-1',
        message: 'Explore my data catalog',
        sessionKey: 'session-abc',
      }),
    ).rejects.toThrow();
    expect(transport.requests).toHaveLength(0);
  });

  it('does not launch Agent when Core refuses run-scope registration', async () => {
    const transport = new FakeGeneratedApiTransport([]);
    const coreTransport = new FakeGeneratedApiTransport([
      undefined,
      new CoreApiError(403, 'Run scope denied'),
    ]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    await expect(
      repository.sendMessage({
        userId: 'u1',
        roomId: 'room-1',
        message: 'Query data',
        sessionKey: 'session-abc',
        dataScope: { schema: 'demo' },
      }),
    ).rejects.toThrow();
    expect(transport.requests).toHaveLength(0);
    expect(coreTransport.requests.map(({ path }) => path)).toEqual([
      '/rooms/room-1/message-blocks/bind',
      '/rooms/room-1/agent-runs',
    ]);
  });

  it('closes Core registration when Agent admission fails', async () => {
    const transport = new FakeGeneratedApiTransport([new Error('Agent unavailable')]);
    const coreTransport = new FakeGeneratedApiTransport([undefined, undefined, undefined]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    await expect(
      repository.sendMessage({
        userId: 'u1',
        roomId: 'room-1',
        message: 'Query data',
        sessionKey: 'session-abc',
      }),
    ).rejects.toThrow();
    const registration = bodyOf(coreTransport.requests[1]) as { runId: string };
    expect(coreTransport.requests[2]?.path).toBe(`/rooms/room-1/agent-runs/${registration.runId}`);
    expect(coreTransport.requests[2]?.init?.method).toBe('DELETE');
  });

  it('names a new room after the conversation title, so listSessions can show it later', async () => {
    const transport = new FakeGeneratedApiTransport([
      { id: 'room-1' },
      {
        run_id: 'run-1',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 0,
      },
    ]);
    const coreTransport = new FakeGeneratedApiTransport([undefined]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    await repository.sendMessage({
      userId: 'u1',
      roomId: null,
      message: 'how many orders last month',
      sessionKey: 'session-abc',
      title: 'how many orders last month',
    });

    expect(bodyOf(transport.requests[0])).toMatchObject({ name: 'how many orders last month' });
  });

  it('falls back to a generic room name when no title is given', async () => {
    const transport = new FakeGeneratedApiTransport([
      { id: 'room-1' },
      {
        run_id: 'run-1',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 0,
      },
    ]);
    const coreTransport = new FakeGeneratedApiTransport([undefined]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    await repository.sendMessage({
      userId: 'u1',
      roomId: null,
      message: 'hi',
      sessionKey: 'session-abc',
    });

    expect(bodyOf(transport.requests[0])).toMatchObject({ name: 'chat-u1' });
  });

  it('creates a room with the overriding agent as its sole member when input.agent is set', async () => {
    const transport = new FakeGeneratedApiTransport([
      { id: 'room-1' },
      {
        run_id: 'run-1',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 0,
      },
    ]);
    const coreTransport = new FakeGeneratedApiTransport([undefined]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    await repository.sendMessage({
      userId: 'u1',
      roomId: null,
      message: 'add a step',
      sessionKey: 'workflow-wf-1',
      agent: 'automation-workflow-editor',
    });

    expect(bodyOf(transport.requests[0])).toMatchObject({
      members: ['automation-workflow-editor'],
    });
    expect(bodyOf(transport.requests[1])).toMatchObject({ agent: 'automation-workflow-editor' });
  });

  it('falls back to publicEnvironment.chatAgentName when input.agent is omitted', async () => {
    const transport = new FakeGeneratedApiTransport([
      { id: 'room-1' },
      {
        run_id: 'run-1',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 0,
      },
    ]);
    const coreTransport = new FakeGeneratedApiTransport([undefined]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    await repository.sendMessage({
      userId: 'u1',
      roomId: null,
      message: 'hi',
      sessionKey: 'session-abc',
    });

    expect(bodyOf(transport.requests[0])).toMatchObject({ members: ['test-chat-agent'] });
    expect(bodyOf(transport.requests[1])).toMatchObject({ agent: 'test-chat-agent' });
  });

  it("lists sessions from the caller's rooms, skipping any without a key", async () => {
    const transport = new FakeGeneratedApiTransport([
      [
        { id: 'room-1', key: 'session-abc', name: 'chat-u1', members: ['writer'] },
        { id: 'room-2', key: null, name: 'chat-u1' },
        { id: 'room-3', key: 'session-def' },
      ],
    ]);
    const repository = new AgentApiChatRepository(transport);

    await expect(repository.listSessions('u1')).resolves.toEqual([
      { id: 'session-abc', roomId: 'room-1', title: 'chat-u1', agentName: 'writer' },
      { id: 'session-def', roomId: 'room-3', title: 'session-def' },
    ]);
    expect(transport.requests.map((request) => request.path)).toEqual(['/rooms']);
    expect(headerOf(transport.requests[0], 'X-Caller-Id')).toBe('u1');
  });

  it('reuses an existing roomId without creating a new room', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        run_id: 'run-2',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 1,
      },
    ]);
    const coreTransport = new FakeGeneratedApiTransport([undefined]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    await repository.sendMessage({
      userId: 'u1',
      roomId: 'room-1',
      message: 'again',
      sessionKey: 'session-abc',
    });

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.path).toBe('/rooms/room-1/runs');
    expect(coreTransport.requests[0]?.path).toBe('/rooms/room-1/message-blocks/bind');
  });

  it("carries the conversation's database scope onto the run", async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        run_id: 'run-3',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 0,
      },
    ]);
    const repository = new AgentApiChatRepository(
      transport,
      new FakeGeneratedApiTransport([undefined]),
    );

    await repository.sendMessage({
      userId: 'u1',
      roomId: 'room-1',
      message: 'how many orders last month',
      sessionKey: 'session-abc',
      dataScope: { schema: 'demo' },
    });

    // The agent enforces this in front of its data tools, so it has to reach
    // the run itself rather than being described in the prompt.
    const body = JSON.parse(String(transport.requests[0]?.init?.body)) as Record<string, unknown>;
    expect(body.data_scope).toEqual({ schema: 'demo' });
  });

  it('carries structured chat context without changing the user input', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        run_id: 'run-context',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 0,
      },
    ]);
    const repository = new AgentApiChatRepository(
      transport,
      new FakeGeneratedApiTransport([undefined]),
    );

    await repository.sendMessage({
      userId: 'u1',
      roomId: 'room-1',
      message: 'add a step',
      sessionKey: 'workflow-wf-1',
      context: {
        kind: 'automation-workflow',
        workflowId: 'wf-1',
        workflowName: 'Ingest to Slack',
      },
    });

    const body = JSON.parse(String(transport.requests[0]?.init?.body)) as Record<string, unknown>;
    expect(body.input).toBe('add a step');
    expect(body.context).toEqual({
      kind: 'automation-workflow',
      workflow_id: 'wf-1',
      workflow_name: 'Ingest to Slack',
    });
  });

  it('sends no scope at all for an unscoped conversation', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        run_id: 'run-4',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 0,
      },
    ]);
    const repository = new AgentApiChatRepository(
      transport,
      new FakeGeneratedApiTransport([undefined]),
    );

    await repository.sendMessage({
      userId: 'u1',
      roomId: 'room-1',
      message: 'hello',
      sessionKey: 'session-abc',
    });

    // Absent, not empty: the agent reads a missing scope as "no restriction",
    // and an empty object would be a scope that matches no database at all.
    const body = JSON.parse(String(transport.requests[0]?.init?.body)) as Record<string, unknown>;
    expect('data_scope' in body).toBe(false);
  });

  it('carries structured application context separately from the visible input', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        run_id: 'run-context',
        room_id: 'room-1',
        room_events_url: '/rooms/room-1/events',
        queue_position: 0,
      },
    ]);
    const repository = new AgentApiChatRepository(
      transport,
      new FakeGeneratedApiTransport([undefined]),
    );

    await repository.sendMessage({
      userId: 'u1',
      roomId: 'room-1',
      message: 'Why is this node stopped?',
      sessionKey: 'session-abc',
      plantModelScope: {
        plantSiteId: 'site-1',
        selectedNodeId: 'node-1',
      },
    });

    const body = JSON.parse(String(transport.requests[0]?.init?.body)) as Record<string, unknown>;
    expect(body.input).toBe('Why is this node stopped?');
    expect(body.plant_model_scope).toEqual({
      plantSiteId: 'site-1',
      selectedNodeId: 'node-1',
    });
  });

  it('recovers an existing caller-owned room when a repeated session key conflicts', async () => {
    const conflict = new CoreApiError(409, 'session-abc is already taken');
    const transport = new FakeGeneratedApiTransport([
      conflict,
      [
        { id: 'room-other', key: 'session-other' },
        { id: 'room-recovered', key: 'session-abc' },
      ],
      undefined,
      {
        run_id: 'run-recovered',
        room_id: 'room-recovered',
        room_events_url: '/rooms/room-recovered/events',
        queue_position: 0,
      },
    ]);
    const coreTransport = new FakeGeneratedApiTransport([undefined]);
    const repository = new AgentApiChatRepository(transport, coreTransport);

    await expect(
      repository.sendMessage({
        userId: 'u1',
        roomId: null,
        message: 'resume safely',
        sessionKey: 'session-abc',
      }),
    ).resolves.toMatchObject({ roomId: 'room-recovered', runId: expect.any(String) });

    expect(transport.requests.map(({ path }) => path)).toEqual([
      '/rooms',
      '/rooms',
      '/rooms/room-recovered/members',
      '/rooms/room-recovered/runs',
    ]);
    expect(transport.requests[1]?.init?.method).toBe('GET');
    expect(headerOf(transport.requests[1], 'X-Caller-Id')).toBe('u1');
    expect(coreTransport.requests[0]?.path).toBe('/rooms/room-recovered/message-blocks/bind');
    expect(bodyOf(transport.requests[2])).toEqual({ agent: 'test-chat-agent' });
  });

  it('preserves a room conflict when no room has the requested session key', async () => {
    const conflict = new CoreApiError(409, 'session-missing is already taken');
    const transport = new FakeGeneratedApiTransport([
      conflict,
      [{ id: 'room-other', key: 'session-other' }],
    ]);
    const repository = new AgentApiChatRepository(transport);

    await expect(
      repository.sendMessage({
        userId: 'u1',
        roomId: null,
        message: 'do not use another room',
        sessionKey: 'session-missing',
      }),
    ).rejects.toMatchObject({
      constructor: ConflictError,
      cause: conflict,
    });
  });

  it('streams room events with the v2 cursor and caller id', async () => {
    const body = new ReadableStream<Uint8Array>();
    const response = new Response(body);
    const transport = new FakeGeneratedApiTransport([], response);
    const repository = new AgentApiChatRepository(transport);

    const result = await repository.streamEvents('u1', 'room-1', '5');

    const streamed = transport.streamRequests[0];
    expect(streamed?.path).toBe('/rooms/room-1/events?cursor=5');
    expect(headerOf(streamed, 'X-Caller-Id')).toBe('u1');
    expect(result).toBe(body);
  });

  it('loads and maps a session transcript by the session-bound run key, not the room key', async () => {
    // The room's own key (chosen client-side at creation) is not what
    // minder-agent uses for the session a room run creates — that is derived
    // server-side as `room:<room.id>:agent:<agent name>` (see rooms-http.ts),
    // so the manifest name is already the complete key part.
    const transport = new FakeGeneratedApiTransport([
      { id: 'agent-session-1' },
      {
        session_id: 'agent-session-1',
        history: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: [{ type: 'text', text: 'recovered answer' }] },
          { role: 'tool', content: 'internal result' },
        ],
      },
    ]);
    const repository = new AgentApiChatRepository(transport);

    await expect(repository.getSessionTranscript('u1', 'room-1')).resolves.toEqual([
      { role: 'user', content: 'hello', reasoning: null },
      { role: 'assistant', content: 'recovered answer', reasoning: null },
    ]);
    expect(transport.requests.map((request) => request.path)).toEqual([
      '/sessions/room%3Aroom-1%3Aagent%3Atest-chat-agent',
      '/sessions/agent-session-1/transcript',
    ]);
    expect(headerOf(transport.requests[0], 'X-Caller-Id')).toBe('u1');
    expect(headerOf(transport.requests[1], 'X-Caller-Id')).toBe('u1');
  });

  it('recovers the owner-scoped pending question with the room transcript', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        id: 'agent-session-1',
        pending_question: {
          version: 1,
          kind: 'choice',
          question: 'Which report format?',
          options: [{ label: 'Markdown', description: 'A Markdown report' }],
          allow_other: false,
        },
      },
      { session_id: 'agent-session-1', history: [{ role: 'user', content: 'Create a report' }] },
    ]);
    const repository = new AgentApiChatRepository(transport);

    await expect(repository.getSessionState('u1', 'room-1')).resolves.toEqual({
      transcript: [{ role: 'user', content: 'Create a report', reasoning: null }],
      pendingQuestion: {
        question: 'Which report format?',
        options: [{ label: 'Markdown', description: 'A Markdown report' }],
        allowOther: false,
      },
    });
  });

  it('reuses the selected manifest name across transcript fetches', async () => {
    const transport = new FakeGeneratedApiTransport([
      { id: 'session-a' },
      { session_id: 'session-a', history: [] },
      { id: 'session-b' },
      { session_id: 'session-b', history: [] },
    ]);
    const repository = new AgentApiChatRepository(transport);

    await repository.getSessionTranscript('u1', 'room-1');
    await repository.getSessionTranscript('u1', 'room-2');

    expect(transport.requests.map((request) => request.path)).toContain(
      '/sessions/room%3Aroom-2%3Aagent%3Atest-chat-agent',
    );
  });

  it('loads the transcript for an explicitly selected agent', async () => {
    const transport = new FakeGeneratedApiTransport([
      { id: 'plant-session' },
      { session_id: 'plant-session', history: [] },
    ]);
    const repository = new AgentApiChatRepository(transport);

    await repository.getSessionTranscript('u1', 'room-1', 'plant-model-assistant');

    expect(transport.requests[0]?.path).toBe(
      '/sessions/room%3Aroom-1%3Aagent%3Aplant-model-assistant',
    );
  });

  it('resets an encoded room and agent session without sending a run', async () => {
    const transport = new FakeGeneratedApiTransport([undefined]);
    const repository = new AgentApiChatRepository(transport);

    await repository.resetConversation('u1', 'room/1', 'plant model');

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.path).toBe('/rooms/room%2F1/members/plant%20model/session/reset');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    expect(headerOf(transport.requests[0], 'X-Caller-Id')).toBe('u1');
  });

  it('translates a bodyless stream response into an application error', async () => {
    const transport = new FakeGeneratedApiTransport([], new Response(null));
    const repository = new AgentApiChatRepository(transport);

    await expect(repository.streamEvents('u1', 'room-1')).rejects.toMatchObject({
      constructor: RemoteServiceError,
    });
  });

  it.each([
    [new CoreApiError(404, 'Room not found.'), NotFoundError],
    [new CoreApiError(503, 'Agent API unavailable.'), RemoteServiceError],
    [new TypeError('fetch failed'), RemoteServiceError],
  ])('translates external failures at the repository boundary', async (cause, ErrorType) => {
    const repository = new AgentApiChatRepository(new FakeGeneratedApiTransport([cause]));

    await expect(
      repository.sendMessage({
        userId: 'u1',
        roomId: null,
        message: 'hi',
        sessionKey: 'session-x',
      }),
    ).rejects.toMatchObject({
      constructor: ErrorType,
      cause,
    });
  });

  it('checks health against /healthz on the agent transport', async () => {
    const transport = new FakeGeneratedApiTransport([{ status: 'ok' }]);
    const repository = new AgentApiChatRepository(transport);

    await expect(repository.checkHealth()).resolves.toBe(true);
    expect(transport.requests[0]?.path).toBe('/healthz');
  });

  it('reports unhealthy when the healthz request fails', async () => {
    const repository = new AgentApiChatRepository(
      new FakeGeneratedApiTransport([new TypeError('fetch failed')]),
    );

    await expect(repository.checkHealth()).resolves.toBe(false);
  });

  it('fetches a run manifest mapped from snake_case', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        manifest_version: 1,
        manifest_id: 'manifest-1',
        run_id: 'run-1',
        session_id: null,
        parent_run_id: null,
        root_run_id: 'run-1',
        agent: { name: 'analyst' },
        model: { name: 'sonnet' },
        instructions: {},
        skills: [],
        tools: {},
        runtime: {},
        environment: {},
        input: { message: 'hi' },
      },
    ]);
    const repository = new AgentApiChatRepository(transport);

    const manifest = await repository.getRunManifest('u1', 'run-1');

    expect(transport.requests[0]?.path).toBe('/runs/run-1/manifest');
    expect(headerOf(transport.requests[0], 'X-Caller-Id')).toBe('u1');
    expect(manifest).toEqual({
      manifestVersion: 1,
      manifestId: 'manifest-1',
      runId: 'run-1',
      sessionId: null,
      parentRunId: null,
      rootRunId: 'run-1',
      agent: { name: 'analyst' },
      model: { name: 'sonnet' },
      instructions: {},
      skills: [],
      tools: {},
      runtime: {},
      environment: {},
      input: { message: 'hi' },
    });
  });

  it('fetches a run trace and unwraps the run_id/trace envelope', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        run_id: 'run-1',
        trace: [
          {
            trace_id: 't1',
            span_id: 's1',
            parent_span_id: null,
            run_id: 'run-1',
            root_run_id: 'run-1',
            name: 'model_generation',
            kind: 'llm',
            status: 'ok',
            started_at: '2026-08-17T00:00:00.000Z',
            ended_at: '2026-08-17T00:00:01.000Z',
            attributes: {},
            error: null,
          },
        ],
      },
    ]);
    const repository = new AgentApiChatRepository(transport);

    const trace = await repository.getRunTrace('u1', 'run-1');

    expect(transport.requests[0]?.path).toBe('/runs/run-1/trace');
    expect(trace).toEqual([
      {
        traceId: 't1',
        spanId: 's1',
        parentSpanId: null,
        runId: 'run-1',
        rootRunId: 'run-1',
        name: 'model_generation',
        kind: 'llm',
        status: 'ok',
        startedAt: '2026-08-17T00:00:00.000Z',
        endedAt: '2026-08-17T00:00:01.000Z',
        attributes: {},
        error: null,
      },
    ]);
  });

  it('fetches a run report', async () => {
    const transport = new FakeGeneratedApiTransport([
      { run_id: 'run-1', markdown: '# Report\n\nBody.' },
    ]);
    const repository = new AgentApiChatRepository(transport);

    const report = await repository.getRunReport('u1', 'run-1');

    expect(transport.requests[0]?.path).toBe('/runs/run-1/report');
    expect(report).toEqual({ runId: 'run-1', markdown: '# Report\n\nBody.' });
  });

  it('translates a 404 on run report into a NotFoundError', async () => {
    const repository = new AgentApiChatRepository(
      new FakeGeneratedApiTransport([new CoreApiError(404, 'no report for run run-1')]),
    );

    await expect(repository.getRunReport('u1', 'run-missing')).rejects.toMatchObject({
      constructor: NotFoundError,
    });
  });

  it('fetches a run validation result', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        status: 'valid',
        contract_id: 'contract-1',
        contract_version: '1.0.0',
        attempts: 1,
        errors: [],
        output_hash: 'sha256:abc',
        validated_at: '2026-08-17T00:00:02.000Z',
      },
    ]);
    const repository = new AgentApiChatRepository(transport);

    const validation = await repository.getRunValidation('u1', 'run-1');

    expect(transport.requests[0]?.path).toBe('/runs/run-1/validation');
    expect(validation).toEqual({
      status: 'valid',
      contractId: 'contract-1',
      contractVersion: '1.0.0',
      attempts: 1,
      errors: [],
      outputHash: 'sha256:abc',
      validatedAt: '2026-08-17T00:00:02.000Z',
    });
  });

  it('fetches room metrics from the already-camelCase RunMetricsSummary response', async () => {
    const transport = new FakeGeneratedApiTransport([
      {
        total: 10,
        succeeded: 8,
        failed: 1,
        cancelled: 0,
        skipped: 1,
        running: 0,
        p50DurationMs: 820,
        p95DurationMs: 2300,
      },
    ]);
    const repository = new AgentApiChatRepository(transport);

    const metrics = await repository.getRoomMetrics('u1', 'room-1');

    expect(transport.requests[0]?.path).toBe('/rooms/room-1/metrics');
    expect(headerOf(transport.requests[0], 'X-Caller-Id')).toBe('u1');
    expect(metrics).toEqual({
      total: 10,
      succeeded: 8,
      failed: 1,
      cancelled: 0,
      skipped: 1,
      running: 0,
      p50DurationMs: 820,
      p95DurationMs: 2300,
    });
  });

  it('translates a 404 on run manifest into a NotFoundError', async () => {
    const repository = new AgentApiChatRepository(
      new FakeGeneratedApiTransport([new CoreApiError(404, 'Run manifest not found.')]),
    );

    await expect(repository.getRunManifest('u1', 'run-missing')).rejects.toMatchObject({
      constructor: NotFoundError,
    });
  });

  it('translates a stream failure at the repository boundary', async () => {
    const repository = new AgentApiChatRepository(
      new FakeGeneratedApiTransport([], new CoreApiError(500, 'Agent API stream failed with 500')),
    );

    await expect(repository.streamEvents('u1', 'room-1')).rejects.toMatchObject({
      constructor: RemoteServiceError,
    });
  });

  it('listRunFiles fetches from the CORE transport and maps entries', async () => {
    const agentTransport = new FakeGeneratedApiTransport([]);
    const coreTransport = new FakeGeneratedApiTransport([
      {
        files: [
          {
            path: 'a.txt',
            accessType: 'created',
            toolName: 'Write',
            accessedAt: '2026-09-08T00:00:00Z',
            available: true,
            sizeBytes: 5,
            mimeType: 'text/plain',
          },
        ],
      },
    ]);
    const repository = new AgentApiChatRepository(agentTransport, coreTransport);

    const files = await repository.listRunFiles('user-1', 'run-1');

    expect(coreTransport.requests[0]?.path).toBe('/runs/run-1/files');
    expect(headerOf(coreTransport.requests[0], 'X-Caller-Id')).toBe('user-1');
    expect(agentTransport.requests).toHaveLength(0); // must NOT use the agent transport
    expect(files).toEqual([
      {
        path: 'a.txt',
        accessType: 'created',
        toolName: 'Write',
        accessedAt: '2026-09-08T00:00:00Z',
        available: true,
        sizeBytes: 5,
        mimeType: 'text/plain',
      },
    ]);
  });

  it('getRunFileContent streams from the CORE transport and returns a blob', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const streamResponse = new Response(blob, {
      status: 200,
      headers: {
        'content-type': 'text/plain',
        'content-disposition': 'attachment; filename="a.txt"',
      },
    });
    const agentTransport = new FakeGeneratedApiTransport([]);
    const coreTransport = new FakeGeneratedApiTransport([], streamResponse);
    const repository = new AgentApiChatRepository(agentTransport, coreTransport);

    const content = await repository.getRunFileContent('user-1', 'run-1', 'a.txt');

    expect(coreTransport.streamRequests[0]?.path).toBe('/runs/run-1/files/content?path=a.txt');
    expect(headerOf(coreTransport.streamRequests[0], 'X-Caller-Id')).toBe('user-1');
    expect(agentTransport.streamRequests).toHaveLength(0); // must NOT use the agent transport
    expect(content.mimeType).toBe('text/plain');
    expect(content.fileName).toBe('a.txt');
    expect(content.sizeBytes).toBe(blob.size);
    expect(await content.blob.text()).toBe('hello');
  });

  it('translates a listRunFiles failure at the core boundary', async () => {
    const agentTransport = new FakeGeneratedApiTransport([]);
    const coreTransport = new FakeGeneratedApiTransport([new CoreApiError(404, 'run not found')]);
    const repository = new AgentApiChatRepository(agentTransport, coreTransport);

    await expect(repository.listRunFiles('user-1', 'run-missing')).rejects.toMatchObject({
      constructor: NotFoundError,
    });
  });

  it('throws when the core transport is unavailable for run-file operations', async () => {
    const repository = new AgentApiChatRepository(new FakeGeneratedApiTransport([]));

    await expect(repository.listRunFiles('user-1', 'run-1')).rejects.toThrow();
  });
});
