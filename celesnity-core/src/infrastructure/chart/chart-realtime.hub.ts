import { Injectable, type OnApplicationShutdown } from '@nestjs/common';

import type {
  ChartRealtimeEvent,
  IChartRealtimeHub,
} from '@application/chart/interfaces/i-chart-realtime-hub';
import type { Chart } from '@domain/chart/models/chart';

const MAX_EVENTS = 1_024;

/**
 * Low-cost fan-out for charts on one API instance.
 *
 * The bounded replay buffer makes reconnects cheap and prevents a slow client
 * from forcing every other client to query Postgres. The controller still
 * performs an infrequent snapshot resync for multi-instance deployments.
 */
@Injectable()
export class ChartRealtimeHub implements IChartRealtimeHub, OnApplicationShutdown {
  private sequence = 0;
  private readonly events: ChartRealtimeEvent[] = [];
  private readonly listeners = new Set<(event: ChartRealtimeEvent) => void>();
  private readonly versions = new Map<string, number>();

  public currentSequence(): number {
    return this.sequence;
  }

  public publishUpsert(chart: Chart): void {
    const previousVersion = this.versions.get(chart.id);
    if (previousVersion !== undefined && previousVersion >= chart.version) return;
    this.versions.set(chart.id, chart.version);
    this.publish({
      kind: 'upsert',
      sequence: ++this.sequence,
      chart,
    });
  }

  public publishDelete(chartId: string): void {
    this.versions.delete(chartId);
    this.publish({
      kind: 'delete',
      sequence: ++this.sequence,
      chartId,
    });
  }

  public subscribe(listener: (event: ChartRealtimeEvent) => void, sinceSequence = 0): () => void {
    this.listeners.add(listener);
    for (const event of this.events) {
      if (event.sequence > sinceSequence) listener(event);
    }
    return () => this.listeners.delete(listener);
  }

  public onApplicationShutdown(): void {
    this.events.length = 0;
    this.listeners.clear();
    this.versions.clear();
  }

  private publish(event: ChartRealtimeEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    for (const listener of this.listeners) listener(event);
  }
}
