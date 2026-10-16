import type { McpRepository } from '@/src/application/repositories/mcp.repository.interface';
import type { McpServerStatus, McpToolDescriptor } from '@/src/entities/models/mcp';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface McpServerStatusDto {
  readonly agent: string;
  readonly attempts: number;
  readonly kind: McpServerStatus['kind'];
  readonly server: string;
  readonly state: McpServerStatus['state'];
  readonly tool_count: number;
}

interface McpToolDto {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
}

export class AgentApiMcpRepository implements McpRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listServers(): Promise<readonly McpServerStatus[]> {
    const values = await this.request<readonly McpServerStatusDto[]>('/mcp/servers', {
      method: 'GET',
    });
    return values.map(mapStatus);
  }

  public async listTools(agent: string, server: string): Promise<readonly McpToolDescriptor[]> {
    const path = `/mcp/servers/${encodeURIComponent(server)}/tools?agent=${encodeURIComponent(agent)}`;
    const values = await this.request<readonly McpToolDto[]>(path, { method: 'GET' });
    return values.map((value) => ({
      name: value.name,
      description: value.description,
      inputSchema: value.input_schema,
    }));
  }

  public async reconnect(agent: string, server: string): Promise<McpServerStatus> {
    const path = `/mcp/servers/${encodeURIComponent(server)}/reconnect?agent=${encodeURIComponent(agent)}`;
    return mapStatus(await this.request<McpServerStatusDto>(path, { method: 'POST' }));
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapStatus(value: McpServerStatusDto): McpServerStatus {
  return {
    agent: value.agent,
    attempts: value.attempts,
    kind: value.kind,
    server: value.server,
    state: value.state,
    toolCount: value.tool_count,
  };
}
