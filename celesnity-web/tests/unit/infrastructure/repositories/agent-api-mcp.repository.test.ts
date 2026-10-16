import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { AgentApiMcpRepository } from '@/src/infrastructure/repositories/agent-api-mcp.repository';

class FakeTransport implements GeneratedApiTransport {
  public readonly paths: string[] = [];
  public constructor(private readonly responses: unknown[]) {}

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.paths.push(`${init?.method ?? 'GET'} ${path}`);
    return this.responses.shift() as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used');
  }
}

describe('AgentApiMcpRepository', () => {
  it('maps owner-scoped MCP status and tools while hiding backend details', async () => {
    const transport = new FakeTransport([
      [
        {
          agent: 'analyst',
          attempts: 2,
          kind: 'remote',
          server: 'warehouse',
          state: 'ready',
          tool_count: 1,
        },
      ],
      [
        {
          name: 'mcp__warehouse__query',
          description: 'Query data',
          input_schema: { type: 'object' },
        },
      ],
    ]);
    const repository = new AgentApiMcpRepository(transport);

    await expect(repository.listServers()).resolves.toEqual([
      {
        agent: 'analyst',
        attempts: 2,
        kind: 'remote',
        server: 'warehouse',
        state: 'ready',
        toolCount: 1,
      },
    ]);
    await expect(repository.listTools('analyst', 'warehouse')).resolves.toEqual([
      {
        name: 'mcp__warehouse__query',
        description: 'Query data',
        inputSchema: { type: 'object' },
      },
    ]);
    expect(transport.paths).toEqual([
      'GET /mcp/servers',
      'GET /mcp/servers/warehouse/tools?agent=analyst',
    ]);
  });

  it('posts a reconnect request for the selected agent and server', async () => {
    const transport = new FakeTransport([
      {
        agent: 'analyst',
        attempts: 3,
        kind: 'stdio',
        server: 'warehouse',
        state: 'ready',
        tool_count: 2,
      },
    ]);
    const repository = new AgentApiMcpRepository(transport);

    await expect(repository.reconnect('analyst', 'warehouse')).resolves.toMatchObject({
      attempts: 3,
      state: 'ready',
    });
    expect(transport.paths).toEqual(['POST /mcp/servers/warehouse/reconnect?agent=analyst']);
  });
});
