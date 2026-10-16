import type { ExecutionRepository } from '@/src/application/repositories/execution.repository.interface';
import type {
  ExecutionDetail,
  ExecutionLog,
  ExecutionResourceProfile,
  ExecutionStatus,
  ExecutionSummary,
  RerunOutcome,
} from '@/src/entities/models/execution';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

type ExecutionResponseDto = components['schemas']['ExecutionResponseDto'];
type ExecutionStatusDto = ExecutionResponseDto['status'];
type ExecutionAcceptedResponseDto = components['schemas']['ExecutionAcceptedResponseDto'];
type ExecutionLogResponseDto = components['schemas']['ExecutionLogResponseDto'];
type ExecutionResourceProfileResponseDto =
  components['schemas']['ExecutionResourceProfileResponseDto'];
type ScriptVersionResponseDto = components['schemas']['ScriptVersionResponseDto'];

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

export class CoreApiExecutionRepository implements ExecutionRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(): Promise<readonly ExecutionSummary[]> {
    const response = await this.request<ExecutionResponseDto[]>('/executions', { method: 'GET' });
    return response.map(mapExecution);
  }

  public async get(id: string): Promise<ExecutionDetail> {
    const response = await this.request<ExecutionResponseDto>(executionPath(id), {
      method: 'GET',
    });
    return mapExecution(response);
  }

  public async cancel(id: string): Promise<ExecutionDetail> {
    const response = await this.request<ExecutionResponseDto>(`${executionPath(id)}/cancel`, {
      method: 'POST',
    });
    return mapExecution(response);
  }

  public async fetchLogs(id: string): Promise<ExecutionLog | undefined> {
    try {
      const response = await this.transport.request<ExecutionLogResponseDto>(
        `${executionPath(id)}/logs`,
        { method: 'GET' },
      );
      return mapLog(response);
    } catch (error) {
      if (error instanceof CoreApiError && [404, 409, 425].includes(error.status)) {
        return undefined;
      }
      throw translateCoreApiError(error);
    }
  }

  public async rerun(scriptId: string, scriptVersionId: string): Promise<RerunOutcome> {
    let versions: ScriptVersionResponseDto[];
    try {
      versions = await this.transport.request<ScriptVersionResponseDto[]>(
        `${scriptPath(scriptId)}/versions`,
        { method: 'GET' },
      );
    } catch (error) {
      if (error instanceof CoreApiError && error.status === 404) {
        return { kind: 'version-missing' };
      }
      throw translateCoreApiError(error);
    }

    const versionNumber = versions.find((version) => version.id === scriptVersionId)?.versionNumber;
    if (versionNumber === undefined) {
      return { kind: 'version-missing' };
    }

    try {
      const response = await this.transport.request<ExecutionAcceptedResponseDto>(
        `${scriptPath(scriptId)}/versions/${encodeURIComponent(String(versionNumber))}/executions`,
        { method: 'POST' },
      );
      return {
        kind: 'started',
        executionId: response.executionId,
        status: mapStatus(response.status),
      };
    } catch (error) {
      if (error instanceof CoreApiError && error.status === 404) {
        return { kind: 'version-missing' };
      }
      if (error instanceof CoreApiError && error.status === 409) {
        return { kind: 'conflict', message: error.message };
      }
      throw translateCoreApiError(error);
    }
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function executionPath(id: string): string {
  return `/executions/${encodeURIComponent(id)}`;
}

function scriptPath(id: string): string {
  return `/scripts/${encodeURIComponent(id)}`;
}

function mapStatus(status: ExecutionStatusDto): ExecutionStatus {
  return STATUS_FROM_DTO[status];
}

function mapExecution(dto: ExecutionResponseDto): ExecutionDetail {
  return {
    id: dto.id,
    workloadKind: dto.workloadKind,
    executionPrincipal: dto.executionPrincipal,
    versionNumber: dto.versionNumber,
    ...(dto.scriptId ? { scriptId: dto.scriptId } : {}),
    ...(dto.scriptVersionId ? { scriptVersionId: dto.scriptVersionId } : {}),
    ...(dto.pipelineId ? { pipelineId: dto.pipelineId } : {}),
    ...(dto.pipelineVersionId ? { pipelineVersionId: dto.pipelineVersionId } : {}),
    connectionId: dto.connectionId,
    status: mapStatus(dto.status),
    queuedAt: dto.queuedAt,
    updatedAt: dto.updatedAt,
    ...(dto.sparkApplicationId ? { sparkApplicationId: dto.sparkApplicationId } : {}),
    ...(dto.exitCode !== undefined ? { exitCode: dto.exitCode } : {}),
    ...(dto.errorSummary ? { errorSummary: dto.errorSummary } : {}),
    ...(dto.startedAt ? { startedAt: dto.startedAt } : {}),
    ...(dto.finishedAt ? { finishedAt: dto.finishedAt } : {}),
    ...(dto.cancelledAt ? { cancelledAt: dto.cancelledAt } : {}),
    ...(dto.resourceProfile ? { resourceProfile: mapResourceProfile(dto.resourceProfile) } : {}),
  };
}

function mapResourceProfile(dto: ExecutionResourceProfileResponseDto): ExecutionResourceProfile {
  return {
    driverMemory: dto.driverMemory,
    executorMemory: dto.executorMemory,
    executorCores: dto.executorCores,
    maxCores: dto.maxCores,
  };
}

function mapLog(dto: ExecutionLogResponseDto): ExecutionLog {
  return {
    executionId: dto.executionId,
    status: mapStatus(dto.status),
    bucket: dto.bucket,
    objectKey: dto.objectKey,
    content: dto.content,
    byteSize: dto.byteSize,
  };
}
