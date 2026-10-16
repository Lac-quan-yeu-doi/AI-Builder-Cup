import type {
  ExecutableWorkload,
  IExecutableWorkloadProvider,
} from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import type { ICompiledPipelineProvider } from '@application/pipeline-compilation/interfaces/i-compiled-pipeline-provider';
import type { IPublishedScriptProvider } from '@application/script-authoring/interfaces/i-published-script-provider';
import type { ExecutionWorkload } from '@domain/execution-orchestration/models/execution-workload';
import { ExecutionError } from '@domain/execution-orchestration/errors/execution.errors';

export class ExecutableWorkloadProvider implements IExecutableWorkloadProvider {
  public constructor(
    private readonly scripts: IPublishedScriptProvider,
    private readonly pipelines: ICompiledPipelineProvider,
  ) {}

  public async resolveScript(scriptId: string, versionNumber: number): Promise<ExecutableWorkload> {
    const resolved = await this.scripts.resolvePublishedVersion(scriptId, versionNumber);
    return {
      workload: {
        kind: 'SCRIPT',
        scriptId: resolved.scriptId,
        scriptVersionId: resolved.scriptVersionId,
        versionNumber: resolved.versionNumber,
      },
      connectionId: resolved.connectionId,
      source: resolved.source,
    };
  }

  public async resolvePipeline(
    pipelineId: string,
    versionNumber: number,
    options?: { readonly includeOutputFacts?: boolean },
  ): Promise<ExecutableWorkload> {
    const resolved = await this.pipelines.resolveCompiledVersion(pipelineId, versionNumber, options);
    return {
      workload: {
        kind: 'PIPELINE',
        pipelineId: resolved.pipelineId,
        pipelineVersionId: resolved.pipelineVersionId,
        versionNumber: resolved.versionNumber,
      },
      connectionId: resolved.connectionId,
      source: resolved.source,
    };
  }

  public async resolve(
    workload: ExecutionWorkload,
    options?: { readonly includeOutputFacts?: boolean },
  ): Promise<ExecutableWorkload> {
    if (workload.kind === 'SCRIPT') {
      if (options?.includeOutputFacts === true) {
        throw ExecutionError.validation('Output facts are supported for pipeline executions only.');
      }
      const resolved = await this.resolveScript(workload.scriptId, workload.versionNumber);
      if (
        resolved.workload.kind !== 'SCRIPT' ||
        resolved.workload.scriptVersionId !== workload.scriptVersionId
      ) {
        throw ExecutionError.concurrency();
      }
      return resolved;
    }
    const resolved = await this.resolvePipeline(workload.pipelineId, workload.versionNumber, options);
    if (
      resolved.workload.kind !== 'PIPELINE' ||
      resolved.workload.pipelineVersionId !== workload.pipelineVersionId
    ) {
      throw ExecutionError.concurrency();
    }
    return resolved;
  }
}
