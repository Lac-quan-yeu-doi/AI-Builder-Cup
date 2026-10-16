import type {
  ChartProgressObserver,
  ChartProgressService,
  ChartProgressSubscription,
} from '@/src/application/services/chart-progress.service.interface';
import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import type { Chart, ChartStatus } from '@/src/entities/models/chart';
import { publicEnvironment } from '@/src/infrastructure/configuration/public-environment';

interface ChartDto {
  id: string;
  run_id: string | null;
  title: string;
  chart_type: string;
  vl_spec: Record<string, unknown> | null;
  sql: string | null;
  status: string;
  error_message: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  encodings: Record<string, unknown>;
  data: readonly Record<string, unknown>[];
  config: Record<string, unknown>;
}

// Reconnect tuning mirrors the chat room stream's resilient-stream config
// (see app/(workspace)/chat/_components/use-resilient-stream.ts) so both
// realtime channels back off the same way under a shared outage.
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const JITTER_FACTOR = 0.3;

export class EventSourceChartProgressService implements ChartProgressService {
  public constructor(private readonly baseUrl: string = publicEnvironment.coreApiUrl) {}

  public subscribe(observer: ChartProgressObserver): ChartProgressSubscription {
    let source: EventSource | null = null;
    let closed = false;
    let retryCount = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let visible = typeof document === 'undefined' || document.visibilityState === 'visible';

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed || !visible || reconnectTimer !== null) {
        return;
      }
      retryCount += 1;
      const exponential = Math.min(BASE_DELAY_MS * 2 ** (retryCount - 1), MAX_DELAY_MS);
      const jitter = exponential * JITTER_FACTOR * (Math.random() * 2 - 1);
      const delay = Math.max(0, exponential + jitter);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        openSource();
      }, delay);
    };

    const openSource = () => {
      if (closed || !visible) {
        return;
      }
      try {
        source = new EventSource(`${this.baseUrl}/charts/stream`);
      } catch (error) {
        observer.onError(translateStreamError(error));
        scheduleReconnect();
        return;
      }

      source.addEventListener('chart_update', (event: MessageEvent<string>) => {
        if (closed) {
          return;
        }
        const chart = parseChart(event.data);
        if (chart) {
          observer.onChart(chart);
        }
      });

      source.addEventListener('chart_deleted', (event: MessageEvent<string>) => {
        if (closed) return;
        try {
          const parsed = JSON.parse(event.data) as { id?: unknown };
          if (typeof parsed.id === 'string') observer.onDeleted?.(parsed.id);
        } catch {
          // Ignore malformed deletion events; the next list refresh repairs state.
        }
      });

      source.onopen = () => {
        retryCount = 0;
        observer.onOpen?.();
      };

      source.onerror = (error) => {
        if (closed) {
          return;
        }
        observer.onError(translateStreamError(error));
        // Take reconnection over from the browser's fixed ~3s native retry so
        // repeated failures back off with jitter instead of every open tab
        // hammering the endpoint on the same cadence.
        source?.close();
        source = null;
        scheduleReconnect();
      };
    };

    const handleVisibilityChange = () => {
      const nowVisible = document.visibilityState === 'visible';
      if (nowVisible === visible) {
        return;
      }
      visible = nowVisible;
      if (visible) {
        retryCount = 0;
        openSource();
      } else {
        // Drop the connection while the tab is hidden instead of leaving an
        // idle stream open in the background.
        clearReconnectTimer();
        source?.close();
        source = null;
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    openSource();

    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      clearReconnectTimer();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      source?.close();
      source = null;
    };

    return { close };
  }
}

function parseChart(raw: string): Chart | undefined {
  if (!raw) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isChartDto(parsed)) {
    return undefined;
  }
  return {
    id: parsed.id,
    runId: parsed.run_id,
    title: parsed.title,
    chartType: isChartType(parsed.chart_type) ? parsed.chart_type : 'bar',
    encodings: parsed.encodings,
    data: parsed.data,
    config: parsed.config,
    vlSpec: parsed.vl_spec,
    sql: parsed.sql,
    status: parsed.status as ChartStatus,
    errorMessage: parsed.error_message,
    version: parsed.version,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  };
}

function isChartType(value: string): value is Chart['chartType'] {
  return ['bar', 'line', 'area', 'point', 'pie', 'arc', 'scatter'].includes(value);
}

function isChartDto(value: unknown): value is ChartDto {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['title'] === 'string' &&
    typeof candidate['chart_type'] === 'string' &&
    typeof candidate['status'] === 'string' &&
    typeof candidate['version'] === 'number' &&
    typeof candidate['created_at'] === 'string' &&
    typeof candidate['updated_at'] === 'string'
  );
}

function translateStreamError(error: unknown): RemoteServiceError {
  return new RemoteServiceError(
    error instanceof Error ? error.message : 'The chart stream failed.',
    { cause: error },
  );
}
