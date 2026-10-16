import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';

import type { ChartUseCases } from '@application/chart/chart.use-cases';
import type {
  ChartRealtimeEvent,
  IChartRealtimeHub,
} from '@application/chart/interfaces/i-chart-realtime-hub';
import { ChartResponse } from './chart.response';

const STREAM_RESYNC_INTERVAL_MS = 30_000;
const STREAM_HEARTBEAT_INTERVAL_MS = 15_000;

/** SSE stream builder for the chart controller. */
export function createChartStream(
  useCases: ChartUseCases,
  realtime: IChartRealtimeHub,
  lastEventId: string | undefined,
): Observable<MessageEvent> {
  const sinceSequence = parseSequence(lastEventId);
  return new Observable<MessageEvent>((subscriber) => {
    let closed = false;
    let snapshotInFlight = false;

    const emitSnapshot = async (): Promise<void> => {
      if (closed || snapshotInFlight) return;
      snapshotInFlight = true;
      try {
        const charts = await useCases.list(undefined, 200);
        const sequence = realtime.currentSequence();
        for (const chart of charts) {
          if (!closed) {
            subscriber.next({
              id: `chart-seq-${sequence}`,
              type: 'chart_update',
              data: ChartResponse.from(chart),
            });
          }
        }
      } catch (error: unknown) {
        if (!closed && sinceSequence === 0) subscriber.error(error);
      } finally {
        snapshotInFlight = false;
      }
    };

    const unsubscribe = realtime.subscribe((event) => {
      if (closed || event.sequence <= sinceSequence) return;
      subscriber.next(toMessageEvent(event));
    }, sinceSequence);
    void emitSnapshot();
    const resyncTimer = setInterval(() => void emitSnapshot(), STREAM_RESYNC_INTERVAL_MS);
    const heartbeatTimer = setInterval(() => {
      if (!closed) {
        subscriber.next({
          id: `chart-seq-${realtime.currentSequence()}`,
          type: 'heartbeat',
          data: {},
        });
      }
    }, STREAM_HEARTBEAT_INTERVAL_MS);

    return () => {
      closed = true;
      clearInterval(resyncTimer);
      clearInterval(heartbeatTimer);
      unsubscribe();
    };
  });
}

function parseSequence(lastEventId: string | undefined): number {
  const match = lastEventId?.match(/^chart-seq-(\d+)$/u);
  return match ? Number(match[1]) : 0;
}

function toMessageEvent(event: ChartRealtimeEvent): MessageEvent {
  if (event.kind === 'delete') {
    return {
      id: `chart-seq-${event.sequence}`,
      type: 'chart_deleted',
      data: { id: event.chartId },
    };
  }
  return {
    id: `chart-seq-${event.sequence}`,
    type: 'chart_update',
    data: ChartResponse.from(event.chart),
  };
}
