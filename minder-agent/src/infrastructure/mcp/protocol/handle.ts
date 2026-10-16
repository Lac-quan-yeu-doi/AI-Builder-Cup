export interface McpServerHandle {
  readonly name: string;
  close(): Promise<void>;
}
