import type { McpServerStatus, McpToolDescriptor } from '@/src/entities/models/mcp';

export interface McpRepository {
  listServers(): Promise<readonly McpServerStatus[]>;
  listTools(agent: string, server: string): Promise<readonly McpToolDescriptor[]>;
  reconnect(agent: string, server: string): Promise<McpServerStatus>;
}
