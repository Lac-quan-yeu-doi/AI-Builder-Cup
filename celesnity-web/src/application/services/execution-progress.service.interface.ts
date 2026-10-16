import type { ExecutionProgress } from '@/src/entities/models/execution';

export interface ExecutionProgressObserver {
  onProgress(progress: ExecutionProgress): void;
  onError(error: unknown): void;
}

export interface ExecutionProgressSubscription {
  close(): void;
}

export interface ExecutionProgressService {
  subscribe(id: string, observer: ExecutionProgressObserver): ExecutionProgressSubscription;
}
