import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';
import * as express from 'express';
import * as request from 'supertest';

import type { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { McpController } from '@presentation/mcp/mcp-controller.base';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';

class TestMcpController extends McpController {
  protected readonly serverName = 'test-mcp';
  protected readonly instructions = 'test';

  public constructor(private readonly delegation: AgentRoomDelegationService) {
    super();
  }

  protected buildTools(): readonly McpToolHandler[] {
    return [];
  }

  protected override runToolCall(
    meta: RequestMeta | undefined,
    call: () => Promise<CallToolResult>,
  ): Promise<CallToolResult> {
    const roomId = meta?.['com.celesnity/room-id'];
    const callerSubject = meta?.['com.celesnity/caller-subject'];
    if (
      typeof roomId !== 'string' ||
      roomId.trim().length === 0 ||
      typeof callerSubject !== 'string' ||
      callerSubject.trim().length === 0
    ) {
      return Promise.reject(new Error('Trusted MCP room delegation metadata is required.'));
    }
    return this.delegation.run(roomId, callerSubject, call);
  }

  public run(
    meta: RequestMeta | undefined,
    call: () => Promise<CallToolResult>,
  ): Promise<CallToolResult> {
    return this.runToolCall(meta, call);
  }
}

describe('McpController room delegation', () => {
  const result: CallToolResult = { content: [{ type: 'text', text: 'ok' }] };

  it('delegates every tool call through the trusted room principal', async () => {
    const run = jest.fn(
      async (
        _roomId: string,
        _subject: string,
        call: () => Promise<CallToolResult>,
      ): Promise<CallToolResult> => call(),
    );
    const controller = new TestMcpController({ run } as unknown as AgentRoomDelegationService);
    const call = jest.fn().mockResolvedValue(result);

    await expect(
      controller.run(
        {
          'com.celesnity/room-id': 'room-a',
          'com.celesnity/caller-subject': 'subject-a',
        },
        call,
      ),
    ).resolves.toEqual(result);
    expect(run).toHaveBeenCalledWith('room-a', 'subject-a', call);
  });

  it.each([
    undefined,
    {},
    { 'com.celesnity/room-id': 'room-a' },
    { 'com.celesnity/caller-subject': 'subject-a' },
    {
      'com.celesnity/room-id': ' ',
      'com.celesnity/caller-subject': 'subject-a',
    },
  ])('rejects incomplete delegation metadata without invoking the tool', async (meta) => {
    const run = jest.fn();
    const controller = new TestMcpController({ run } as unknown as AgentRoomDelegationService);
    const call = jest.fn().mockResolvedValue(result);

    await expect(controller.run(meta, call)).rejects.toThrow(
      'Trusted MCP room delegation metadata is required.',
    );
    expect(run).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('stateless MCP replica routing', () => {
  it('initializes on one replica and discovers tools on another without a session', async () => {
    const replica = () => {
      const controller = new TestMcpController({} as AgentRoomDelegationService);
      const app = express();
      app.use(express.json());
      app.post('/mcp', (req, res) => {
        void controller.post(req, res);
      });
      app.get('/mcp', (req, res) => {
        void controller.get(req, res);
      });
      return app;
    };
    const first = replica();
    const second = replica();
    const initialized = await request(first)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      })
      .expect(200);
    expect(initialized.headers['mcp-session-id']).toBeUndefined();
    for (const app of [second, first, second]) {
      const listed = await request(app)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
        .expect(200);
      expect(listed.text).toContain('"tools":[]');
    }
    await request(second).get('/mcp').expect(405).expect('Allow', 'POST');
  });
});
