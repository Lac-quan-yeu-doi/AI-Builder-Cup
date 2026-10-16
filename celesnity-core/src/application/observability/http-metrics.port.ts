export interface HttpRequestMetricLabels {
  readonly method: string;
  readonly route: string;
  readonly statusCode: string;
}

export interface HttpRequestMetrics {
  requestStarted(): void;
  requestCompleted(labels: HttpRequestMetricLabels, durationSeconds: number): void;
}

export interface MetricsRegistry {
  readonly contentType: string;
  metrics(): Promise<string>;
}

export const METRICS_REGISTRY = Symbol('METRICS_REGISTRY');
