import type {
  ExecutionProgressObserver,
  ExecutionProgressService,
  ExecutionProgressSubscription,
} from '@/src/application/services/execution-progress.service.interface';
import { RemoteServiceError } from '@/src/entities/errors/application-errors';
import type { ExecutionProgress, ExecutionStatus } from '@/src/entities/models/execution';
import { publicEnvironment } from '@/src/infrastructure/configuration/public-environment';
import type { components } from '@/src/infrastructure/api/generated/schema';

type ExecutionEventDto = components['schemas']['ExecutionEventDto'];
type ExecutionStatusDto = ExecutionEventDto['status'];

const STATUS_FROM_DTO: Readonly<Record<ExecutionStatusDto, ExecutionStatus>> = {
  QUEUED: 'queued',
  PREPARING: 'preparing',
  SUBMITTED: 'submitted',
  RUNNING: 'running',
  CANCELLING: 'cancelling',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed_out',
};

const NOOP_SUBSCRIPTION: ExecutionProgressSubscription = { close: () => undefined };

export interface EventSourceClient {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceClient;

export class EventSourceExecutionProgressService implements ExecutionProgressService {
  public constructor(
    private readonly baseUrl: string = publicEnvironment.coreApiUrl,
    private readonly createEventSource: EventSourceFactory = createBrowserEventSource,
  ) {}

  public subscribe(id: string, observer: ExecutionProgressObserver): ExecutionProgressSubscription {
    let source: EventSourceClient;
    try {
      source = this.createEventSource(`${this.baseUrl}${executionPath(id)}/events`);
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

    source.onmessage = (event) => {
      if (closed) {
        return;
      }
      const progress = parseProgress(event.data);
      if (progress) {
        observer.onProgress(progress);
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

function createBrowserEventSource(url: string): EventSourceClient {
  if (typeof EventSource === 'undefined') {
    throw new Error('Server-sent events are not supported in this environment.');
  }
  return new EventSource(url);
}

function executionPath(id: string): string {
  return `/executions/${encodeURIComponent(id)}`;
}

function parseProgress(raw: string): ExecutionProgress | undefined {
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
    updatedAt: parsed.updatedAt,
    ...(parsed.sparkApplicationId ? { sparkApplicationId: parsed.sparkApplicationId } : {}),
    ...(typeof parsed.exitCode === 'number' ? { exitCode: parsed.exitCode } : {}),
  };
}

function isEventDto(value: unknown): value is ExecutionEventDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.status === 'string' &&
    Object.hasOwn(STATUS_FROM_DTO, candidate.status) &&
    typeof candidate.updatedAt === 'string' &&
    (candidate.sparkApplicationId === undefined ||
      typeof candidate.sparkApplicationId === 'string') &&
    (candidate.exitCode === undefined || typeof candidate.exitCode === 'number')
  );
}

function translateStreamError(error: unknown): RemoteServiceError {
  return new RemoteServiceError(
    error instanceof Error ? error.message : 'The execution progress stream failed.',
    { cause: error },
  );
}
