export const MESSAGE_BLOCK_TYPES = [
  'text',
  'markdown',
  'image',
  'file',
  'chart',
  'table',
  'document',
] as const;

export interface MessageBlock {
  readonly id: string;
  readonly roomId: string;
  readonly runId: string | null;
  readonly blockType: string;
  readonly version: number;
  readonly payload: Record<string, unknown>;
  readonly fallbackText: string;
  readonly publishedAt: string;
}
