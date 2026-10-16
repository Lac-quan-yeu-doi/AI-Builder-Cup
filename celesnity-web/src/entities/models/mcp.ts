export type McpServerState = 'connecting' | 'ready' | 'degraded' | 'unavailable' | 'closed';

export interface McpServerStatus {
  readonly agent: string;
  readonly attempts: number;
  readonly kind: 'stdio' | 'remote';
  readonly server: string;
  readonly state: McpServerState;
  readonly toolCount: number;
}

export interface McpToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}
