import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AutomationWorkflow } from '@domain/automation-workflow/models/automation-workflow';
import { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';
import { AutomationWorkflowRun } from '@domain/automation-workflow/models/automation-workflow-run';
import { AutomationWorkflowStepRun } from '@domain/automation-workflow/models/automation-workflow-step-run';
import type { Document } from '@domain/document/models/document';
import { DocumentResponse } from '@presentation/document/document.response';

const TRIGGER_FIELD_TYPES = ['text', 'number', 'date', 'datetime', 'boolean'] as const;

/** One declared, typed trigger input on a workflow — matches `$.trigger.<name>` references in step templates. */
export class AutomationWorkflowTriggerFieldDto {
  @ApiProperty({ example: 'run_date' })
  @IsString()
  @MaxLength(255)
  public name!: string;

  @ApiProperty({ enum: TRIGGER_FIELD_TYPES, example: 'date' })
  @IsIn(TRIGGER_FIELD_TYPES)
  public type!: 'text' | 'number' | 'date' | 'datetime' | 'boolean';

  @ApiPropertyOptional({ example: 'Run date' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public label?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  public required?: boolean;
}

export class CreateAutomationWorkflowRequestDto {
  @ApiProperty({ example: 'Ingest to Slack' })
  @IsString()
  @MaxLength(255)
  public name!: string;

  @ApiProperty({ enum: ['EVENT', 'SCHEDULE'], example: 'EVENT' })
  @IsIn(['EVENT', 'SCHEDULE'])
  public triggerType!: 'EVENT' | 'SCHEDULE';

  @ApiProperty({ example: 'celesnity.ingest.file.created.v1', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public eventTopic?: string;

  @ApiProperty({ example: '0 9 * * *', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public scheduleCron?: string;

  @ApiProperty({ example: 'UTC', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  public scheduleTimezone?: string;

  @ApiPropertyOptional({ type: AutomationWorkflowTriggerFieldDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationWorkflowTriggerFieldDto)
  public triggerFields?: AutomationWorkflowTriggerFieldDto[];
}

export class UpdateAutomationWorkflowRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;

  @ApiProperty({ enum: ['EVENT', 'SCHEDULE'], required: false })
  @IsOptional()
  @IsIn(['EVENT', 'SCHEDULE'])
  public triggerType?: 'EVENT' | 'SCHEDULE';

  @ApiProperty({ example: 'celesnity.ingest.file.created.v1', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public eventTopic?: string;

  @ApiProperty({ example: '0 9 * * *', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public scheduleCron?: string;

  @ApiProperty({ example: 'UTC', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  public scheduleTimezone?: string;

  @ApiPropertyOptional({ type: AutomationWorkflowTriggerFieldDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationWorkflowTriggerFieldDto)
  public triggerFields?: AutomationWorkflowTriggerFieldDto[];
}

export class AddWorkflowStepRequestDto {
  @ApiProperty({ example: 'schema-extractor' })
  @IsString()
  @MaxLength(255)
  public agentId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { message: '$.trigger.bucket' },
  })
  @IsObject()
  public inputTemplate!: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'Optional per-step system-prompt/persona override — replaces the agent’s default system prompt for just this step.',
  })
  @IsOptional()
  @IsString()
  public systemPrompt?: string;
}

export class UpdateWorkflowStepRequestDto {
  @ApiProperty({ example: 'summarizer', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public agentId?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { message: '$.step1.output' },
  })
  @IsOptional()
  @IsObject()
  public inputTemplate?: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'Optional per-step system-prompt/persona override — replaces the agent’s default system prompt for just this step.',
  })
  @IsOptional()
  @IsString()
  public systemPrompt?: string;
}

export class TestFireWorkflowRequestDto {
  @ApiProperty({ type: 'object', additionalProperties: true, example: { bucket: 'ingest-bucket' } })
  @IsObject()
  public payload!: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Debug only: make this 1-based step fail without dispatching it.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  public forceFailAtStep?: number;
}

export class RetryWorkflowRunRequestDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  public resumeFromStep!: number;
}

export class AutomationWorkflowStepResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public order!: number;
  @ApiProperty() public agentId!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  public inputTemplate!: Record<string, string>;
  @ApiPropertyOptional({ description: 'Per-step system-prompt/persona override, when set.' })
  public systemPrompt?: string;

  public static from(model: AutomationWorkflowStep): AutomationWorkflowStepResponseDto {
    return Object.assign(new AutomationWorkflowStepResponseDto(), {
      id: model.id,
      order: model.order,
      agentId: model.agentId,
      inputTemplate: model.inputTemplate,
      systemPrompt: model.systemPrompt,
    });
  }
}

export class AutomationWorkflowResponseDto {
  @ApiProperty() public id!: string;
  @ApiProperty() public name!: string;
  @ApiProperty({ enum: ['draft', 'enabled'] }) public status!: 'draft' | 'enabled';
  @ApiProperty({ enum: ['EVENT', 'SCHEDULE'] }) public triggerType!: 'EVENT' | 'SCHEDULE';
  @ApiProperty({ required: false }) public eventTopic?: string;
  @ApiProperty({ required: false }) public scheduleCron?: string;
  @ApiProperty({ required: false }) public scheduleTimezone?: string;
  @ApiProperty({ type: AutomationWorkflowTriggerFieldDto, isArray: true })
  public triggerFields!: AutomationWorkflowTriggerFieldDto[];
  @ApiProperty() public createdAt!: string;
  @ApiProperty({ type: AutomationWorkflowStepResponseDto, isArray: true })
  public steps!: AutomationWorkflowStepResponseDto[];

  public static from(
    model: AutomationWorkflow,
    steps: readonly AutomationWorkflowStep[],
  ): AutomationWorkflowResponseDto {
    return Object.assign(new AutomationWorkflowResponseDto(), {
      id: model.id,
      name: model.name,
      status: model.status,
      triggerType: model.triggerType,
      eventTopic: model.eventTopic,
      scheduleCron: model.scheduleCron,
      scheduleTimezone: model.scheduleTimezone,
      triggerFields: model.triggerFields.map((field) => ({ ...field })),
      createdAt: model.createdAt.toISOString(),
      steps: steps.map((step) => AutomationWorkflowStepResponseDto.from(step)),
    });
  }
}

export class AutomationWorkflowStepRunResponseDto {
  @ApiProperty() public stepId!: string;
  @ApiProperty({ enum: ['queued', 'running', 'success', 'failed'] }) public status!: string;
  @ApiProperty({ required: false }) public output?: string;
  /** The underlying minder-agent run this step dispatched to — for cross-referencing that agent's own run history when debugging. */
  @ApiProperty({ required: false }) public agentRunId?: string;
  @ApiProperty({ required: false, format: 'date-time' }) public startedAt?: string;
  @ApiProperty({ required: false, format: 'date-time' }) public finishedAt?: string;

  public static from(model: AutomationWorkflowStepRun): AutomationWorkflowStepRunResponseDto {
    return Object.assign(new AutomationWorkflowStepRunResponseDto(), {
      stepId: model.stepId,
      status: model.status,
      output: model.output,
      agentRunId: model.agentRunId,
      startedAt: model.startedAt?.toISOString(),
      finishedAt: model.finishedAt?.toISOString(),
    });
  }
}

export class AutomationWorkflowRunResponseDto {
  @ApiProperty() public runId!: string;
  @ApiProperty({ enum: ['running', 'success', 'failed'] }) public status!: string;
  @ApiProperty({ enum: ['schedule', 'event', 'test'] }) public triggeredBy!: string;
  @ApiProperty({ format: 'date-time' }) public startedAt!: string;
  @ApiProperty({ required: false, format: 'date-time' }) public finishedAt?: string;
  @ApiProperty({ type: AutomationWorkflowStepRunResponseDto, isArray: true })
  public steps!: AutomationWorkflowStepRunResponseDto[];
  @ApiProperty({ type: DocumentResponse, isArray: true })
  public documents!: DocumentResponse[];

  public static from(
    run: AutomationWorkflowRun,
    stepRuns: readonly AutomationWorkflowStepRun[],
    documents: readonly Document[] = [],
  ): AutomationWorkflowRunResponseDto {
    return Object.assign(new AutomationWorkflowRunResponseDto(), {
      runId: run.id,
      status: run.status,
      triggeredBy: run.triggeredBy,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
      steps: stepRuns.map((stepRun) => AutomationWorkflowStepRunResponseDto.from(stepRun)),
      documents: documents.map((document) => DocumentResponse.from(document)),
    });
  }
}

/** Lightweight row for a workflow's run history list — no step detail, unlike AutomationWorkflowRunResponseDto. */
export class AutomationWorkflowRunSummaryResponseDto {
  @ApiProperty() public runId!: string;
  @ApiProperty({ enum: ['running', 'success', 'failed'] }) public status!: string;
  @ApiProperty({ enum: ['schedule', 'event', 'test'] }) public triggeredBy!: string;
  @ApiProperty({ format: 'date-time' }) public startedAt!: string;
  @ApiProperty({ required: false, format: 'date-time' }) public finishedAt?: string;

  public static from(run: AutomationWorkflowRun): AutomationWorkflowRunSummaryResponseDto {
    return Object.assign(new AutomationWorkflowRunSummaryResponseDto(), {
      runId: run.id,
      status: run.status,
      triggeredBy: run.triggeredBy,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
    });
  }

  public static fromList(
    runs: readonly AutomationWorkflowRun[],
  ): AutomationWorkflowRunSummaryResponseDto[] {
    return runs.map((run) => AutomationWorkflowRunSummaryResponseDto.from(run));
  }
}
