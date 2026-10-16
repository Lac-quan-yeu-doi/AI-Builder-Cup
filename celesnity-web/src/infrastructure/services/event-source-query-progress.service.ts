import type {
  QueryProgressObserver,
  QueryProgressService,
  QueryProgressSubscription,
} from '@/src/application/services/query-progress.service.interface';
import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import type { SqlExecutionEvent, SqlExecutionStatus } from '@/src/entities/models/query';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { publicEnvironment } from '@/src/infrastructure/configuration/public-environment';

type QueryEventDto = components['schemas']['SqlExecutionEventResponseDto'];
type QueryStatusDto = QueryEventDto['status'];

const STATUS_FROM_DTO: Readonly<Record<QueryStatusDto, SqlExecutionStatus>> = {
  QUEUED: 'queued',
  SUBMITTED: 'submitted',
  RUNNING: 'running',
  CANCELLING: 'cancelling',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed_out',
};

const NOOP_SUBSCRIPTION: QueryProgressSubscription = { close: () => undefined };

export interface QueryEventSourceClient {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export type QueryEventSourceFactory = (url: string) => QueryEventSourceClient;

export class EventSourceQueryProgressService implements QueryProgressService {
  public constructor(
    private readonly baseUrl: string = publicEnvironment.coreApiUrl,
    private readonly createEventSource: QueryEventSourceFactory = createBrowserEventSource,
  ) {}

  public subscribe(id: string, observer: QueryProgressObserver): QueryProgressSubscription {
    let source: QueryEventSourceClient;
    try {
      source = this.createEventSource(
        `${this.baseUrl}/sql-executions/${encodeURIComponent(id)}/events`,
      );
    } catch (error) {
      observer.onError(translateStreamError(error));
      return NOOP_SUBSCRIPTION;
    }

    let closed = false;
    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      source.onmessage = null;
      source.onerror = null;
      source.close();
    };

    source.onmessage = (message) => {
      if (closed) {
        return;
      }
      const event = parseEvent(message.data);
      if (event) {
        observer.onEvent(event);
      }
    };

    source.onerror = (error) => {
      if (closed) {
        return;
      }
      close();
      observer.onError(translateStreamError(error));
    };

    return { close };
  }
}

function createBrowserEventSource(url: string): QueryEventSourceClient {
  if (typeof EventSource === 'undefined') {
    throw new Error('Server-sent events are not supported in this environment.');
  }
  return new EventSource(url);
}

function parseEvent(raw: string): SqlExecutionEvent | undefined {
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isEventDto(parsed)) {
    return undefined;
  }

  return {
    id: parsed.id,
    status: STATUS_FROM_DTO[parsed.status],
    finished: parsed.finished,
    updatedAt: parsed.updatedAt,
    ...(parsed.progressPercentage !== undefined
      ? { progressPercentage: parsed.progressPercentage }
      : {}),
    ...(parsed.state !== undefined ? { state: parsed.state } : {}),
    ...(parsed.rowCount !== undefined ? { rowCount: parsed.rowCount } : {}),
    ...(parsed.errorCode !== undefined ? { errorCode: parsed.errorCode } : {}),
  };
}

function isEventDto(value: unknown): value is QueryEventDto {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.status === 'string' &&
    Object.hasOwn(STATUS_FROM_DTO, candidate.status) &&
    typeof candidate.finished === 'boolean' &&
    typeof candidate.updatedAt === 'string' &&
    (candidate.progressPercentage === undefined ||
      typeof candidate.progressPercentage === 'number') &&
    (candidate.state === undefined || typeof candidate.state === 'string') &&
    (candidate.rowCount === undefined || typeof candidate.rowCount === 'number') &&
    (candidate.errorCode === undefined || typeof candidate.errorCode === 'string')
  );
}

function translateStreamError(error: unknown): RemoteServiceError {
  return new RemoteServiceError(
    error instanceof Error ? error.message : 'The query progress stream failed.',
    { cause: error },
  );
}
