import type { ExecutionWorkload } from '@domain/execution-orchestration/models/execution-workload';

export interface ExecutableWorkload {
  readonly workload: ExecutionWorkload;
  readonly connectionId?: string;
  readonly source: Uint8Array;
}

export interface IExecutableWorkloadProvider {
  resolveScript(scriptId: string, versionNumber: number): Promise<ExecutableWorkload>;
  resolvePipeline(
    pipelineId: string,
    versionNumber: number,
    options?: { readonly includeOutputFacts?: boolean },
  ): Promise<ExecutableWorkload>;
  resolve(
    workload: ExecutionWorkload,
    options?: { readonly includeOutputFacts?: boolean },
  ): Promise<ExecutableWorkload>;
}
