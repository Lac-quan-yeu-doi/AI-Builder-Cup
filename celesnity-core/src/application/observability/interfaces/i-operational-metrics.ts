export interface HttpRequestMetricLabels {
  readonly method: string;
  readonly route: string;
  readonly statusCode: string;
}

export interface HttpRequestMetrics {
  requestStarted(): void;
  requestCompleted(labels: HttpRequestMetricLabels, durationSeconds: number): void;
}

export interface IOperationalMetrics extends HttpRequestMetrics {
  messageBlockReadCount?(count: number): void;
  messageBlockOpened?(): void;
  messageBlockClosed?(
    reason:
      | 'rotation'
      | 'disconnect'
      | 'slow_consumer'
      | 'oversized'
      | 'error'
      | 'shutdown'
      | 'cursor_reset',
  ): void;
  messageBlockRejected?(scope: 'pod' | 'organization' | 'identity'): void;
  readonly contentType: string;
  metrics(): Promise<string>;
}
