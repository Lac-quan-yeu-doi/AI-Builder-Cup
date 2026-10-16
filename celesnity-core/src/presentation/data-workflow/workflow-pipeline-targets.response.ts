import { ApiProperty } from '@nestjs/swagger';

import type { WorkflowPipelineTargetSchema } from '@application/data-workflow/interfaces/i-workflow-target-schema-reader';

export class WorkflowPipelineTargetColumnResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly type!: string;
  @ApiProperty() public readonly nullable!: boolean;
}

export class WorkflowPipelineTargetResponseDto {
  @ApiProperty() public readonly targetNodeId!: string;
  @ApiProperty() public readonly tableName!: string;
  @ApiProperty({ enum: ['KNOWN', 'RUNTIME_DEPENDENT', 'UNAVAILABLE'] })
  public readonly schemaStatus!: WorkflowPipelineTargetSchema['schemaStatus'];
  @ApiProperty({ type: WorkflowPipelineTargetColumnResponseDto, isArray: true })
  public readonly columns!: readonly WorkflowPipelineTargetColumnResponseDto[];

  public static from(target: WorkflowPipelineTargetSchema): WorkflowPipelineTargetResponseDto {
    return Object.assign(new WorkflowPipelineTargetResponseDto(), {
      targetNodeId: target.targetNodeId,
      tableName: target.tableName,
      schemaStatus: target.schemaStatus,
      columns: target.columns.map((column) =>
        Object.assign(new WorkflowPipelineTargetColumnResponseDto(), column),
      ),
    });
  }
}
