import type { ExecutionView } from '@application/execution-orchestration/read-models/execution.view';

export interface IExecutionReader {
  listRecent(limit: number): Promise<readonly ExecutionView[]>;
  findById(id: string): Promise<ExecutionView | undefined>;
}
