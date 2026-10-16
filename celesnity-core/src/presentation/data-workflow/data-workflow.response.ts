import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  DataWorkflow,
  DataWorkflowNodeAttempt,
  DataWorkflowRun,
  DataWorkflowVersion,
} from '@domain/data-workflow/models/workflow-persistence';
import type { WorkflowRunSnapshot } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import type { WorkflowScheduleView } from '@application/data-workflow/read-workflow-schedule.use-case';
import type { WorkflowCalendarTrigger } from '@domain/data-workflow/models/workflow-trigger';

export class DataWorkflowOccurrenceCoverageResponseDto {
  @ApiProperty() public readonly coalescedCount!: number;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly coalescedFromAt?: string;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly coalescedThroughAt?: string;
}

export class DataWorkflowScheduleStateResponseDto {
  @ApiProperty({ enum: ['MANUAL', 'CALENDAR', 'INTERVAL'] })
  public readonly kind!: 'MANUAL' | 'CALENDAR' | 'INTERVAL';
  @ApiProperty({ enum: ['MANUAL', 'ENABLED', 'PAUSED'] })
  public readonly lifecycle!: 'MANUAL' | 'ENABLED' | 'PAUSED';
  @ApiProperty() public readonly enabled!: boolean;
  @ApiProperty() public readonly paused!: boolean;
  @ApiPropertyOptional({ format: 'date-time' }) public readonly nextDueAt?: string;
  @ApiProperty({ type: DataWorkflowOccurrenceCoverageResponseDto })
  public readonly occurrenceCoverage!: DataWorkflowOccurrenceCoverageResponseDto;

  public static from(view: WorkflowScheduleView): DataWorkflowScheduleStateResponseDto {
    const { workflow, schedule } = view;
    if (schedule === undefined) {
      return Object.assign(new DataWorkflowScheduleStateResponseDto(), {
        kind: 'MANUAL',
        lifecycle: 'MANUAL',
        enabled: false,
        paused: workflow.paused,
        occurrenceCoverage: { coalescedCount: 0 },
      });
    }
    return Object.assign(new DataWorkflowScheduleStateResponseDto(), {
      kind: schedule.triggerKind,
      lifecycle: workflow.paused ? 'PAUSED' : 'ENABLED',
      enabled: schedule.enabled && !workflow.paused,
      paused: workflow.paused,
      nextDueAt: schedule.nextDueAt.toISOString(),
      occurrenceCoverage: {
        coalescedCount: schedule.coalescedCount,
        ...(schedule.coalescedFromAt === undefined
          ? {}
          : { coalescedFromAt: schedule.coalescedFromAt.toISOString() }),
        ...(schedule.coalescedThroughAt === undefined
          ? {}
          : { coalescedThroughAt: schedule.coalescedThroughAt.toISOString() }),
      },
    });
  }
}

export class DataWorkflowCalendarPreviewResponseDto {
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED'] }) public readonly source!: 'DRAFT' | 'PUBLISHED';
  @ApiProperty({ enum: ['CALENDAR'] }) public readonly kind = 'CALENDAR' as const;
  @ApiProperty() public readonly timeOfDay!: string;
  @ApiProperty({ enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], isArray: true })
  public readonly weekdays!: readonly string[];
  @ApiProperty() public readonly timezone!: string;
  @ApiProperty({ type: String, isArray: true, format: 'date-time' })
  public readonly occurrences!: readonly string[];

  public static from(input: {
    readonly source: 'DRAFT' | 'PUBLISHED';
    readonly trigger: WorkflowCalendarTrigger;
    readonly occurrences: readonly Date[];
  }): DataWorkflowCalendarPreviewResponseDto {
    return Object.assign(new DataWorkflowCalendarPreviewResponseDto(), {
      source: input.source,
      timeOfDay: input.trigger.timeOfDay,
      weekdays: [...input.trigger.weekdays],
      timezone: input.trigger.timezone,
      occurrences: input.occurrences.map((occurrence) => occurrence.toISOString()),
    });
  }
}

export class DataWorkflowResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiProperty() public readonly revision!: number;
  @ApiPropertyOptional() public readonly publishedVersion?: number;
  @ApiProperty() public readonly paused!: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true }) public readonly draft!: unknown;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
  @ApiPropertyOptional({ type: DataWorkflowScheduleStateResponseDto })
  public readonly schedule?: DataWorkflowScheduleStateResponseDto;

  public static from(
    workflow: DataWorkflow,
    schedule?: DataWorkflowScheduleStateResponseDto,
  ): DataWorkflowResponseDto {
    return Object.assign(new DataWorkflowResponseDto(), {
      id: workflow.id,
      name: workflow.name,
      revision: workflow.revision,
      ...(workflow.publishedVersion === undefined
        ? {}
        : { publishedVersion: workflow.publishedVersion }),
      paused: workflow.paused,
      draft: structuredClone(workflow.draft),
      ...(schedule === undefined ? {} : { schedule }),
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    });
  }
}

export class DataWorkflowVersionResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly versionNumber!: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) public readonly graph!: unknown;
  @ApiProperty({ type: 'object', additionalProperties: true }) public readonly trigger!: unknown;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  public readonly pipelineDisplayNames!: Readonly<Record<string, string>>;
  @ApiProperty({ format: 'date-time' }) public readonly publishedAt!: string;

  public static from(version: DataWorkflowVersion): DataWorkflowVersionResponseDto {
    return Object.assign(new DataWorkflowVersionResponseDto(), {
      id: version.id,
      versionNumber: version.versionNumber,
      graph: structuredClone(version.graph),
      trigger: structuredClone(version.trigger),
      pipelineDisplayNames: { ...version.pipelineDisplayNames },
      publishedAt: version.publishedAt.toISOString(),
    });
  }
}

export class DataWorkflowNodeAttemptResponseDto {
  @ApiProperty() public readonly nodeId!: string;
  @ApiProperty() public readonly attemptNumber!: number;
  @ApiProperty() public readonly state!: DataWorkflowNodeAttempt['state'];
  @ApiPropertyOptional() public readonly executionId?: string;

  public static from(attempt: DataWorkflowNodeAttempt): DataWorkflowNodeAttemptResponseDto {
    return Object.assign(new DataWorkflowNodeAttemptResponseDto(), {
      nodeId: attempt.nodeId,
      attemptNumber: attempt.attemptNumber,
      state: attempt.state,
      ...(attempt.executionId === undefined ? {} : { executionId: attempt.executionId }),
    });
  }
}

export class DataWorkflowRunResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly versionId!: string;
  @ApiProperty({ enum: ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] })
  public readonly status!: DataWorkflowRun['status'];
  @ApiProperty() public readonly revision!: number;
  @ApiProperty({ format: 'date-time' }) public readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) public readonly updatedAt!: string;
  @ApiProperty({ type: DataWorkflowNodeAttemptResponseDto, isArray: true })
  public readonly attempts!: readonly DataWorkflowNodeAttemptResponseDto[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  public readonly nodeDisplayNames!: Readonly<Record<string, string>>;
  @ApiProperty() public readonly recoveredFailure!: boolean;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  public readonly selectedOutcomeRoutes!: readonly {
    readonly nodeId: string;
    readonly portId: 'success' | 'error';
  }[];

  public static from(snapshot: WorkflowRunSnapshot): DataWorkflowRunResponseDto {
    const { run } = snapshot;
    return Object.assign(new DataWorkflowRunResponseDto(), {
      id: run.id,
      versionId: run.versionId,
      status: run.status,
      revision: run.revision,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      attempts: snapshot.nodeAttempts.map((attempt) =>
        DataWorkflowNodeAttemptResponseDto.from(attempt),
      ),
      nodeDisplayNames: { ...snapshot.version?.pipelineDisplayNames },
      recoveredFailure: recoveredFailure(snapshot),
      selectedOutcomeRoutes: selectedOutcomeRoutes(snapshot),
    });
  }
}

function recoveredFailure(snapshot: WorkflowRunSnapshot): boolean {
  if (snapshot.run.status !== 'SUCCEEDED' || snapshot.version === undefined) return false;
  const latestAttempts = new Map<string, DataWorkflowNodeAttempt>();
  for (const attempt of snapshot.nodeAttempts) {
    const previous = latestAttempts.get(attempt.nodeId);
    if (previous === undefined || attempt.attemptNumber > previous.attemptNumber) {
      latestAttempts.set(attempt.nodeId, attempt);
    }
  }
  const failed = new Set(
    [...latestAttempts.values()]
      .filter((attempt) => attempt.state === 'FAILED')
      .map((attempt) => attempt.nodeId),
  );
  if (failed.size === 0) return false;
  const nodes = new Map(snapshot.version.graph.nodes.map((node) => [node.id, node]));
  const selected = new Set(
    snapshot.edgeStates.filter((edge) => edge.state === 'SUCCEEDED').map((edge) => edge.edgeId),
  );
  return snapshot.version.graph.edges.some(
    (edge) =>
      edge.sourcePortId === 'error' &&
      nodes.get(edge.sourceNodeId)?.type === 'PIPELINE_OUTCOME' &&
      selected.has(edge.id) &&
      snapshot.version?.graph.edges.some(
        (inbound) => inbound.targetNodeId === edge.sourceNodeId && failed.has(inbound.sourceNodeId),
      ),
  );
}

function selectedOutcomeRoutes(snapshot: WorkflowRunSnapshot): readonly {
  readonly nodeId: string;
  readonly portId: 'success' | 'error';
}[] {
  if (snapshot.version === undefined) return [];
  const nodes = new Map(snapshot.version.graph.nodes.map((node) => [node.id, node]));
  const selected = new Set(
    snapshot.edgeStates.filter((edge) => edge.state === 'SUCCEEDED').map((edge) => edge.edgeId),
  );
  const routes = new Map<string, 'success' | 'error'>();
  for (const edge of snapshot.version.graph.edges) {
    if (nodes.get(edge.sourceNodeId)?.type !== 'PIPELINE_OUTCOME' || !selected.has(edge.id))
      continue;
    if (edge.sourcePortId !== 'success' && edge.sourcePortId !== 'error') continue;
    routes.set(edge.sourceNodeId, edge.sourcePortId);
  }
  return [...routes].map(([nodeId, portId]) => ({ nodeId, portId }));
}

export class StartedDataWorkflowRunResponseDto {
  @ApiProperty() public readonly runId!: string;
  @ApiProperty({ enum: ['QUEUED'] }) public readonly status!: 'QUEUED';
}

export class DataWorkflowPageResponseDto {
  @ApiProperty({ type: DataWorkflowResponseDto, isArray: true })
  public readonly data!: readonly DataWorkflowResponseDto[];
  @ApiProperty() public readonly page!: number;
  @ApiProperty() public readonly pageSize!: number;
  @ApiProperty() public readonly totalItems!: number;
}
