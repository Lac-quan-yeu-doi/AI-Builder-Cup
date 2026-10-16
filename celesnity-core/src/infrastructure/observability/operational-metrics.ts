import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';

import type {
  IOperationalMetrics,
  HttpRequestMetricLabels,
} from '@application/observability/interfaces/i-operational-metrics';

export class OperationalMetrics implements IOperationalMetrics {
  readonly registry = new Registry();

  private readonly activeRequests: Gauge;
  private readonly requestCount: Counter<'method' | 'route' | 'status_code'>;
  private readonly requestDuration: Histogram<'method' | 'route' | 'status_code'>;

  private readonly streams: Gauge;
  private readonly streamReads: Gauge;
  private readonly streamCloses: Counter<'reason'>;
  private readonly streamRejections: Counter<'scope'>;

  constructor() {
    this.registry.setDefaultLabels({ service: 'celesnity-core' });
    collectDefaultMetrics({ prefix: 'celesnity_core_', register: this.registry });

    this.streamReads = new Gauge({
      name: 'message_block_pending_reads',
      help: 'Pending message-block projection reads, including reads settling after disconnect.',
      registers: [this.registry],
    });
    this.streams = new Gauge({
      name: 'message_block_active_streams',
      help: 'Active message-block subscriptions.',
      registers: [this.registry],
    });
    this.streamCloses = new Counter({
      name: 'message_block_stream_closes_total',
      help: 'Message-block close reasons.',
      labelNames: ['reason'],
      registers: [this.registry],
    });
    this.streamRejections = new Counter({
      name: 'message_block_stream_rejections_total',
      help: 'Message-block admission rejections.',
      labelNames: ['scope'],
      registers: [this.registry],
    });
    this.activeRequests = new Gauge({
      name: 'http_server_active_requests',
      help: 'HTTP requests currently being processed.',
      registers: [this.registry],
    });
    this.requestCount = new Counter({
      name: 'http_server_requests_total',
      help: 'Completed HTTP requests.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.requestDuration = new Histogram({
      name: 'http_server_request_duration_seconds',
      help: 'HTTP request duration in seconds.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
  }

  messageBlockReadCount(count: number): void {
    this.streamReads.set(count);
  }
  messageBlockOpened(): void {
    this.streams.inc();
  }
  messageBlockClosed(
    reason:
      | 'rotation'
      | 'disconnect'
      | 'slow_consumer'
      | 'oversized'
      | 'error'
      | 'shutdown'
      | 'cursor_reset',
  ): void {
    this.streams.dec();
    this.streamCloses.inc({ reason });
  }
  messageBlockRejected(scope: 'pod' | 'organization' | 'identity'): void {
    this.streamRejections.inc({ scope });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  requestStarted(): void {
    this.activeRequests.inc();
  }

  requestCompleted(labels: HttpRequestMetricLabels, durationSeconds: number): void {
    const metricLabels = {
      method: labels.method,
      route: labels.route,
      status_code: labels.statusCode,
    };
    this.activeRequests.dec();
    this.requestCount.inc(metricLabels);
    this.requestDuration.observe(metricLabels, durationSeconds);
  }
}

export const operationalMetrics = new OperationalMetrics();
