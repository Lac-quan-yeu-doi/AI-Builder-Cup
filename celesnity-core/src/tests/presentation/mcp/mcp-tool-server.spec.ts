import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import { buildMcpToolServer, type McpToolCallRunner } from '@presentation/mcp/mcp-tool-server';

describe('buildMcpToolServer', () => {
  it('validates tool arguments before calling the handler', async () => {
    const call = jest.fn(async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));
    const server = buildMcpToolServer('test-server', 'test', [
      {
        tool: {
          name: 'echo',
          description: 'echo',
          inputSchema: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
            additionalProperties: false,
          },
        },
        call,
      },
    ]);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({ name: 'echo', arguments: {} });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('message must have required property');
    expect(call).not.toHaveBeenCalled();
    await Promise.all([client.close(), server.close()]);
  });

  it('passes protocol request metadata to the trusted call runner', async () => {
    const runToolCall: jest.MockedFunction<McpToolCallRunner> = jest.fn(
      (_meta: RequestMeta | undefined, call: () => Promise<CallToolResult>, _toolName: string) =>
        call(),
    );
    const server = buildMcpToolServer(
      'test-server',
      'test',
      [
        {
          tool: {
            name: 'echo',
            description: 'echo',
            inputSchema: { type: 'object', properties: {} },
          },
          call: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
        },
      ],
      runToolCall,
    );
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    await client.callTool({
      name: 'echo',
      arguments: {},
      _meta: {
        'com.celesnity/room-id': 'room-a',
        'com.celesnity/caller-subject': 'subject-a',
      },
    });

    expect(runToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        'com.celesnity/room-id': 'room-a',
        'com.celesnity/caller-subject': 'subject-a',
      }),
      expect.any(Function),
      'echo',
    );
    await Promise.all([client.close(), server.close()]);
  });
});
