import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ExecutionLogView } from '@application/execution-orchestration/execution-orchestration.use-cases';
import type {
  ExecutionResourceProfileView,
  ExecutionView,
} from '@application/execution-orchestration/read-models/execution.view';
import { ExecutionStatusValue } from '@domain/execution-orchestration/value-objects/execution-value-objects';

export class ExecutionResourceProfileResponseDto {
  @ApiProperty({ example: '1g' })
  public readonly driverMemory!: string;

  @ApiProperty({ example: '1g' })
  public readonly executorMemory!: string;

  @ApiProperty({ minimum: 1, example: 1 })
  public readonly executorCores!: number;

  @ApiProperty({ minimum: 1, example: 2 })
  public readonly maxCores!: number;

  public static from(view: ExecutionResourceProfileView): ExecutionResourceProfileResponseDto {
    return Object.assign(new ExecutionResourceProfileResponseDto(), {
      driverMemory: view.driverMemory,
      executorMemory: view.executorMemory,
      executorCores: view.executorCores,
      maxCores: view.maxCores,
    });
  }
}

export class ExecutionResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ enum: ['SCRIPT', 'PIPELINE'] })
  public readonly workloadKind!: string;

  @ApiPropertyOptional({ enum: ['BACKGROUND', 'REQUESTER'] })
  public readonly executionPrincipal?: 'BACKGROUND' | 'REQUESTER';

  @ApiProperty({ minimum: 1 })
  public readonly versionNumber!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  public readonly scriptId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  public readonly scriptVersionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  public readonly pipelineId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  public readonly pipelineVersionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  public readonly connectionId?: string;

  @ApiProperty({ enum: ExecutionStatusValue })
  public readonly status!: string;

  @ApiPropertyOptional()
  public readonly sparkApplicationId?: string;

  @ApiPropertyOptional({ type: ExecutionResourceProfileResponseDto })
  public readonly resourceProfile?: ExecutionResourceProfileResponseDto;

  @ApiPropertyOptional()
  public readonly exitCode?: number;

  @ApiPropertyOptional()
  public readonly errorSummary?: string;

  @ApiProperty({ format: 'date-time' })
  public readonly queuedAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  public readonly startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  public readonly finishedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  public readonly cancelledAt?: string;

  @ApiProperty({ format: 'date-time' })
  public readonly updatedAt!: string;

  public static from(view: ExecutionView): ExecutionResponseDto {
    return Object.assign(new ExecutionResponseDto(), {
      id: view.id,
      workloadKind: view.workloadKind,
      executionPrincipal: view.executionPrincipal,
      versionNumber: view.versionNumber,
      scriptId: view.scriptId,
      scriptVersionId: view.scriptVersionId,
      pipelineId: view.pipelineId,
      pipelineVersionId: view.pipelineVersionId,
      connectionId: view.connectionId,
      status: view.status,
      sparkApplicationId: view.sparkApplicationId,
      resourceProfile:
        view.resourceProfile === undefined
          ? undefined
          : ExecutionResourceProfileResponseDto.from(view.resourceProfile),
      exitCode: view.exitCode,
      errorSummary: view.errorSummary,
      queuedAt: view.queuedAt,
      startedAt: view.startedAt,
      finishedAt: view.finishedAt,
      cancelledAt: view.cancelledAt,
      updatedAt: view.updatedAt,
    });
  }
}

export class ExecutionAcceptedResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly executionId!: string;

  @ApiProperty({ enum: ExecutionStatusValue, example: 'QUEUED' })
  public readonly status!: string;

  public static from(result: {
    executionId: string;
    status: string;
  }): ExecutionAcceptedResponseDto {
    return Object.assign(new ExecutionAcceptedResponseDto(), {
      executionId: result.executionId,
      status: result.status,
    });
  }
}

export class ExecutionLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly executionId!: string;

  @ApiProperty({ enum: ExecutionStatusValue })
  public readonly status!: string;

  @ApiProperty()
  public readonly bucket!: string;

  @ApiProperty()
  public readonly objectKey!: string;

  @ApiProperty({ description: 'Secret-redacted execution log content.' })
  public readonly content!: string;

  @ApiProperty({ minimum: 0 })
  public readonly byteSize!: number;

  public static from(view: ExecutionLogView): ExecutionLogResponseDto {
    return Object.assign(new ExecutionLogResponseDto(), {
      executionId: view.executionId,
      status: view.status,
      bucket: view.bucket,
      objectKey: view.objectKey,
      content: view.content,
      byteSize: view.byteSize,
    });
  }
}

export class ExecutionEventDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ enum: ExecutionStatusValue })
  public readonly status!: string;

  @ApiPropertyOptional()
  public readonly sparkApplicationId?: string;

  @ApiPropertyOptional()
  public readonly exitCode?: number;

  @ApiProperty({ format: 'date-time' })
  public readonly updatedAt!: string;

  public static from(view: ExecutionView): ExecutionEventDto {
    return Object.assign(new ExecutionEventDto(), {
      id: view.id,
      status: view.status,
      sparkApplicationId: view.sparkApplicationId,
      exitCode: view.exitCode,
      updatedAt: view.updatedAt,
    });
  }
}
