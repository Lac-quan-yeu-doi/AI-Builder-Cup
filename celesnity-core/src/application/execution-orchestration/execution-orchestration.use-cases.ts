import type { IExecutableWorkloadProvider } from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import { ExecutionError } from '@domain/execution-orchestration/errors/execution.errors';
import {
  ExecutionId,
  LogLocation,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { toExecutionOutboxMessage } from '@application/execution-orchestration/execution-outbox.mapper';
import { toExecutionView } from '@application/execution-orchestration/read-models/execution.projection';
import type { PreparedExecutionRequestService } from '@application/execution-orchestration/prepared-execution-request.service';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { IExecutionLogStore } from '@application/execution-orchestration/interfaces/i-execution-log-store';
import type { IExecutionReader } from '@application/execution-orchestration/interfaces/i-execution-reader';
import type { IExecutionRepository } from '@application/execution-orchestration/interfaces/i-execution-repository';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { ExecutionView } from '@application/execution-orchestration/read-models/execution.view';

const DEFAULT_RECENT_LIMIT = 100;

export interface RequestExecutionCommand {
  readonly scriptId: string;
  readonly versionNumber: number;
}

export interface RequestPipelineExecutionCommand {
  readonly pipelineId: string;
  readonly versionNumber: number;
}

export interface RequestExecutionResult {
  readonly executionId: string;
  readonly status: 'QUEUED';
}

export interface ExecutionLogView {
  readonly executionId: string;
  readonly status: ExecutionView['status'];
  readonly bucket: string;
  readonly objectKey: string;
  readonly content: string;
  readonly byteSize: number;
}

export class ExecutionOrchestrationUseCases {
  public constructor(
    private readonly repository: IExecutionRepository,
    private readonly reader: IExecutionReader,
    private readonly logStore: IExecutionLogStore,
    private readonly workloads: IExecutableWorkloadProvider,
    private readonly requests: PreparedExecutionRequestService,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly artifactsBucket: string,
  ) {}

  public async request(command: RequestExecutionCommand): Promise<RequestExecutionResult> {
    const executable = await this.workloads.resolveScript(command.scriptId, command.versionNumber);
    return this.requestExecutable(executable);
  }

  public async requestPipeline(
    command: RequestPipelineExecutionCommand,
  ): Promise<RequestExecutionResult> {
    const executable = await this.workloads.resolvePipeline(
      command.pipelineId,
      command.versionNumber,
    );
    return this.requestExecutable(executable);
  }

  private async requestExecutable(
    executable: Awaited<ReturnType<IExecutableWorkloadProvider['resolve']>>,
  ): Promise<RequestExecutionResult> {
    return this.requests.enqueue(await this.requests.prepare(executable));
  }

  public list(): Promise<readonly ExecutionView[]> {
    return this.reader.listRecent(DEFAULT_RECENT_LIMIT);
  }

  public async get(idValue: string): Promise<ExecutionView> {
    const id = ExecutionId.from(idValue);
    return this.requireView(id.value);
  }

  public async cancel(idValue: string): Promise<ExecutionView> {
    const id = ExecutionId.from(idValue);
    const execution = await this.repository.findById(id);
    if (execution === undefined) {
      throw ExecutionError.notFound();
    }
    if (!execution.isCancellable) {
      throw ExecutionError.notCancellable();
    }

    const fromStatus = execution.status;
    execution.requestCancellation(this.clock.now(), this.idGenerator.next());

    await this.unitOfWork.commit(async (events) => {
      if (!(await this.repository.update(execution, fromStatus))) {
        throw ExecutionError.concurrency();
      }
      events.record(...execution.pullDomainEvents().map(toExecutionOutboxMessage));
    });

    return toExecutionView(execution, this.artifactsBucket);
  }

  public async getLogs(idValue: string): Promise<ExecutionLogView> {
    const id = ExecutionId.from(idValue);
    const view = await this.requireView(id.value);
    const location = LogLocation.forExecution(this.artifactsBucket, id);
    const content = await this.logStore.read(location);
    return {
      executionId: view.id,
      status: view.status,
      bucket: location.bucket,
      objectKey: location.objectKey,
      content: content?.text ?? '',
      byteSize: content?.byteSize ?? 0,
    };
  }

  private async requireView(id: string): Promise<ExecutionView> {
    const view = await this.reader.findById(id);
    if (view === undefined) {
      throw ExecutionError.notFound();
    }
    return view;
  }
}
