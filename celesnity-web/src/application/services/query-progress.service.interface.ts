import type { SqlExecutionEvent } from '@/src/entities/models/query';

export interface QueryProgressObserver {
  onEvent(event: SqlExecutionEvent): void;
  onError(error: unknown): void;
}

export interface QueryProgressSubscription {
  close(): void;
}

export interface QueryProgressService {
  subscribe(id: string, observer: QueryProgressObserver): QueryProgressSubscription;
}
