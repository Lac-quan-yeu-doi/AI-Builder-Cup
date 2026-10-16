export interface RunMetrics {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd?: number;
}
