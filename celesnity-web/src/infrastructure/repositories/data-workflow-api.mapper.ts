import type {
  DataWorkflow,
  DataWorkflowDetail,
  DataWorkflowSchedule,
  DataWorkflowSchedulePreview,
  DataWorkflowRun,
  DataWorkflowNodeAttempt,
  DataWorkflowTriggerKind,
  DataWorkflowVersion,
} from '@/src/entities/models/data-workflow';
import type { DataWorkflowPipelineTarget } from '@/src/entities/models/data-workflow-graph';
import type {
  DataWorkflowWatchSourceCapabilities,
  DataWorkflowWatchSourceCatalogPage,
  DataWorkflowWatchSourceCatalogRelation,
  DataWorkflowWatchSourceCatalogService,
  DataWorkflowWatchSourceValidationResult,
} from '@/src/entities/models/data-workflow-watch-source';
import {
  fromWorkflowGraphDto,
  type DataWorkflowDraft,
} from '@/src/entities/models/data-workflow-graph';

export interface DataWorkflowResponseDto {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly publishedVersion?: number;
  readonly paused: boolean;
  readonly draft: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly schedule?: DataWorkflowSchedule;
  readonly lastRunStatus?: DataWorkflow['lastRunStatus'];
}

export interface DataWorkflowPageResponseDto {
  readonly data: readonly DataWorkflowResponseDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

export interface DataWorkflowVersionResponseDto {
  readonly id: string;
  readonly versionNumber: number;
  readonly graph: unknown;
  readonly pipelineDisplayNames?: Readonly<Record<string, string>>;
  readonly trigger: unknown;
  readonly publishedAt: string;
}

export interface DataWorkflowSchedulePreviewResponseDto {
  readonly source: 'DRAFT' | 'PUBLISHED';
  readonly kind: 'CALENDAR';
  readonly timeOfDay: string;
  readonly weekdays: readonly string[];
  readonly timezone: string;
  readonly occurrences: readonly string[];
}

export interface DataWorkflowNodeAttemptResponseDto {
  readonly nodeId: string;
  readonly attemptNumber: number;
  readonly state: DataWorkflowNodeAttempt['state'];
  readonly executionId?: string;
}

export interface DataWorkflowRunResponseDto {
  readonly id: string;
  readonly versionId?: string;
  readonly selectedOutcomeRoutes?: readonly {
    readonly nodeId: string;
    readonly portId: 'success' | 'error';
  }[];
  readonly status: DataWorkflowRun['status'];
  readonly recoveredFailure?: boolean;
  readonly nodeDisplayNames?: Readonly<Record<string, string>>;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attempts: readonly DataWorkflowNodeAttemptResponseDto[];
}

export interface DataWorkflowPipelineTargetResponseDto {
  readonly targetNodeId: string;
  readonly tableName: string;
  readonly schemaStatus: 'KNOWN' | 'RUNTIME_DEPENDENT' | 'UNAVAILABLE';
  readonly columns: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly nullable: boolean;
  }[];
}

export type DataWorkflowWatchSourceCapabilitiesResponseDto = DataWorkflowWatchSourceCapabilities;
export type DataWorkflowWatchSourceValidationResponseDto = DataWorkflowWatchSourceValidationResult;
export type DataWorkflowWatchSourceCatalogServiceResponseDto =
  DataWorkflowWatchSourceCatalogService;
export type DataWorkflowWatchSourceCatalogRelationResponseDto =
  DataWorkflowWatchSourceCatalogRelation;
export type DataWorkflowWatchSourceCatalogPageResponseDto<T> = {
  readonly data: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
};

export function fromDataWorkflowResponse(dto: DataWorkflowResponseDto): DataWorkflow {
  return {
    id: dto.id,
    name: dto.name,
    revision: dto.revision,
    ...(dto.publishedVersion === undefined ? {} : { publishedVersion: dto.publishedVersion }),
    paused: dto.paused,
    triggerKind: triggerKindFromDraft(dto.draft),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    ...(dto.schedule === undefined ? {} : { schedule: copySchedule(dto.schedule) }),
    ...(dto.lastRunStatus === undefined ? {} : { lastRunStatus: dto.lastRunStatus }),
  };
}

export function fromDataWorkflowDetailResponse(dto: DataWorkflowResponseDto): DataWorkflowDetail {
  return {
    ...fromDataWorkflowResponse(dto),
    draft: fromDraft(dto.name, dto.draft),
  };
}

export function fromDataWorkflowVersionResponse(
  dto: DataWorkflowVersionResponseDto,
): DataWorkflowVersion {
  return {
    ...dto,
    ...(dto.pipelineDisplayNames ? { pipelineDisplayNames: { ...dto.pipelineDisplayNames } } : {}),
  };
}

export function fromDataWorkflowSchedulePreviewResponse(
  dto: DataWorkflowSchedulePreviewResponseDto,
): DataWorkflowSchedulePreview {
  return { ...dto, occurrences: [...dto.occurrences] };
}

export function fromDataWorkflowRunResponse(dto: DataWorkflowRunResponseDto): DataWorkflowRun {
  return {
    id: dto.id,
    ...(dto.versionId === undefined ? {} : { versionId: dto.versionId }),
    ...(dto.selectedOutcomeRoutes
      ? { selectedOutcomeRoutes: dto.selectedOutcomeRoutes.map((route) => ({ ...route })) }
      : {}),
    status: dto.status,
    ...(dto.recoveredFailure === undefined ? {} : { recoveredFailure: dto.recoveredFailure }),
    ...(dto.nodeDisplayNames ? { nodeDisplayNames: { ...dto.nodeDisplayNames } } : {}),
    revision: dto.revision,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    attempts: dto.attempts.map((attempt) => ({ ...attempt })),
  };
}

export function fromDataWorkflowPipelineTargetResponse(
  dto: DataWorkflowPipelineTargetResponseDto,
): DataWorkflowPipelineTarget {
  if (
    !dto.targetNodeId ||
    !dto.tableName ||
    !['KNOWN', 'RUNTIME_DEPENDENT', 'UNAVAILABLE'].includes(dto.schemaStatus) ||
    !Array.isArray(dto.columns)
  ) {
    throw new Error('Core returned an invalid pipeline target schema.');
  }
  return {
    targetNodeId: dto.targetNodeId,
    tableName: dto.tableName,
    schemaStatus: dto.schemaStatus,
    columns: dto.columns.map((column) => {
      if (
        !column.id ||
        !column.name ||
        !column.type ||
        typeof column.nullable !== 'boolean'
      ) {
        throw new Error('Core returned an invalid pipeline target column.');
      }
      return { ...column };
    }),
  };
}

export function fromDataWorkflowWatchSourceCapabilitiesResponse(
  dto: DataWorkflowWatchSourceCapabilitiesResponseDto,
): DataWorkflowWatchSourceCapabilities {
  return {
    ...dto,
    supportedChangeTypes: [...dto.supportedChangeTypes],
  };
}

export function fromDataWorkflowWatchSourceCatalogServicesResponse(
  dto: DataWorkflowWatchSourceCatalogPageResponseDto<DataWorkflowWatchSourceCatalogServiceResponseDto>,
): DataWorkflowWatchSourceCatalogPage<DataWorkflowWatchSourceCatalogService> {
  return {
    data: dto.data.map((service) => {
      const databaseNames = Array.isArray(service.databaseNames)
        ? [...service.databaseNames]
        : typeof service.databaseName === 'string'
          ? [service.databaseName]
          : [];
      return {
        ...service,
        databaseNames,
        ...(databaseNames[0] === undefined ? {} : { databaseName: databaseNames[0] }),
      };
    }),
    page: dto.page,
    pageSize: dto.pageSize,
    totalItems: dto.totalItems,
  };
}

export function fromDataWorkflowWatchSourceCatalogRelationsResponse(
  dto: DataWorkflowWatchSourceCatalogPageResponseDto<DataWorkflowWatchSourceCatalogRelationResponseDto>,
): DataWorkflowWatchSourceCatalogPage<DataWorkflowWatchSourceCatalogRelation> {
  return {
    data: dto.data.map((relation) => ({
      ...relation,
      columns: relation.columns.map((column) => ({ ...column })),
    })),
    page: dto.page,
    pageSize: dto.pageSize,
    totalItems: dto.totalItems,
  };
}

export function fromDataWorkflowWatchSourceValidationResponse(
  dto: DataWorkflowWatchSourceValidationResponseDto,
): DataWorkflowWatchSourceValidationResult {
  return {
    capabilities: fromDataWorkflowWatchSourceCapabilitiesResponse(dto.capabilities),
    issues: dto.issues.map((issue) => ({
      ...issue,
      ...(issue.relation === undefined ? {} : { relation: { ...issue.relation } }),
    })),
    ...(dto.cdcPreflight === undefined
      ? {}
      : {
          cdcPreflight: {
            ...dto.cdcPreflight,
          },
        }),
  };
}

function copySchedule(schedule: DataWorkflowSchedule): DataWorkflowSchedule {
  return { ...schedule, occurrenceCoverage: { ...schedule.occurrenceCoverage } };
}

function triggerKindFromDraft(draft: unknown): DataWorkflowTriggerKind {
  if (!isRecord(draft) || !Array.isArray(draft.nodes)) return 'MANUAL';
  const trigger = draft.nodes.find((node) => isRecord(node) && node.type === 'TRIGGER');
  if (!isRecord(trigger) || !isRecord(trigger.config)) return 'MANUAL';
  return trigger.config.type === 'CALENDAR' ||
    trigger.config.type === 'INTERVAL' ||
    trigger.config.type === 'WATCH_SOURCE'
    ? trigger.config.type
    : 'MANUAL';
}

function fromDraft(name: unknown, graph: unknown): DataWorkflowDraft {
  if (typeof name !== 'string') {
    throw new Error('Core returned an invalid workflow draft.');
  }
  return { name, graph: fromWorkflowGraphDto(graph) };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
