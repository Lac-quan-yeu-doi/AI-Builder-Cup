import {
  DEFAULT_METADATA_CRAWLER_DISCOVERY,
  type AssignMetadataCrawlerInput,
  type MetadataCrawler,
  type MetadataCrawlerAssignableService,
  type MetadataCrawlerDiscoveryConfig,
  type MetadataCrawlerFailure,
  type MetadataCrawlerListPage,
  type MetadataCrawlerLog,
  type MetadataCrawlerRun,
  type MetadataCrawlerSnapshotSummary,
  type MetadataCrawlerSchedule,
  type UpdateMetadataCrawlerInput,
} from '@/src/entities/models/metadata-crawler';

export type MetadataCrawlerResponseDto = Record<string, unknown>;
export interface MetadataCrawlerListResponseDto {
  readonly items: readonly MetadataCrawlerResponseDto[];
  readonly total: number;
}

export function toAssignMetadataCrawlerRequest(
  input: AssignMetadataCrawlerInput,
): Record<string, unknown> {
  return { ...input, ...(input.discovery ? { discovery: input.discovery } : {}) };
}

export function toUpdateMetadataCrawlerRequest(
  input: UpdateMetadataCrawlerInput,
): Record<string, unknown> {
  return { ...input, ...(input.discovery ? { discovery: input.discovery } : {}) };
}

export function fromMetadataCrawlerListResponse(
  dto: MetadataCrawlerListResponseDto,
): MetadataCrawlerListPage {
  return { items: dto.items.map(fromMetadataCrawlerResponse), total: number(dto.total, 'total') };
}

export function fromMetadataCrawlerResponse(dto: MetadataCrawlerResponseDto): MetadataCrawler {
  const service = record(dto.databaseService, 'databaseService');
  return {
    id: string(dto.id, 'id'),
    databaseServiceId: string(dto.databaseServiceId, 'databaseServiceId'),
    name: string(dto.name, 'name'),
    state: asState(dto.state),
    enabled: boolean(dto.enabled, 'enabled'),
    schedule: schedule(dto.schedule),
    nextRunAt: string(dto.nextRunAt, 'nextRunAt'),
    timeoutSeconds: number(dto.timeoutSeconds, 'timeoutSeconds'),
    revision: number(dto.revision, 'revision'),
    databaseService: {
      id: string(service.id, 'databaseService.id'),
      name: string(service.name, 'databaseService.name'),
      connectorType: string(service.connectorType, 'databaseService.connectorType'),
    },
    snapshotSummary: snapshotSummary(dto.snapshotSummary),
    discoveryConfig: discovery(dto.discoveryConfig),
    ...(typeof dto.lastRun === 'object' && dto.lastRun !== null
      ? { lastRun: fromMetadataCrawlerRun(dto.lastRun as MetadataCrawlerResponseDto) }
      : {}),
    ...(typeof dto.archivedAt === 'string' ? { archivedAt: dto.archivedAt } : {}),
    ...(typeof dto.createdAt === 'string' ? { createdAt: dto.createdAt } : {}),
    ...(typeof dto.updatedAt === 'string' ? { updatedAt: dto.updatedAt } : {}),
  };
}

export function fromMetadataCrawlerAssignableService(
  dto: MetadataCrawlerResponseDto,
): MetadataCrawlerAssignableService {
  const capabilities = record(dto.capabilities, 'capabilities');
  return {
    id: string(dto.id, 'id'),
    name: string(dto.name, 'name'),
    connectorType: string(dto.connectorType, 'connectorType'),
    capabilities: {
      descriptions: boolean(capabilities.descriptions, 'capabilities.descriptions'),
      materializedViews: boolean(capabilities.materializedViews, 'capabilities.materializedViews'),
      ddl: boolean(capabilities.ddl, 'capabilities.ddl'),
    },
  };
}

export function fromMetadataCrawlerRun(dto: MetadataCrawlerResponseDto): MetadataCrawlerRun {
  return {
    id: string(dto.id, 'id'),
    crawlerId: string(dto.crawlerId, 'crawlerId'),
    triggerType: string(dto.triggerType, 'triggerType'),
    status: asRunStatus(dto.status),
    queuedAt: string(dto.queuedAt, 'queuedAt'),
    attempt: number(dto.attempt, 'attempt'),
    crawlerRevision: number(dto.crawlerRevision, 'crawlerRevision'),
    connectorTypeSnapshot: string(dto.connectorTypeSnapshot, 'connectorTypeSnapshot'),
    counters: counters(dto.counters),
    ...(typeof dto.scheduledFor === 'string' ? { scheduledFor: dto.scheduledFor } : {}),
    ...(typeof dto.claimedAt === 'string' ? { claimedAt: dto.claimedAt } : {}),
    ...(typeof dto.startedAt === 'string' ? { startedAt: dto.startedAt } : {}),
    ...(typeof dto.finishedAt === 'string' ? { finishedAt: dto.finishedAt } : {}),
    ...(typeof dto.heartbeatAt === 'string' ? { heartbeatAt: dto.heartbeatAt } : {}),
    ...(typeof dto.leaseExpiresAt === 'string' ? { leaseExpiresAt: dto.leaseExpiresAt } : {}),
    ...(typeof dto.workerId === 'string' ? { workerId: dto.workerId } : {}),
    ...(typeof dto.failure === 'object' && dto.failure !== null
      ? { failure: failure(dto.failure) }
      : {}),
  };
}

export function fromMetadataCrawlerLog(dto: MetadataCrawlerResponseDto): MetadataCrawlerLog {
  return {
    runId: string(dto.runId, 'runId'),
    content: string(dto.content, 'content'),
    byteSize: number(dto.byteSize, 'byteSize'),
  };
}

function discovery(value: unknown): MetadataCrawlerDiscoveryConfig {
  const source = record(value, 'discoveryConfig');
  const result = { ...DEFAULT_METADATA_CRAWLER_DISCOVERY };
  for (const key of Object.keys(result) as readonly (keyof MetadataCrawlerDiscoveryConfig)[]) {
    const candidate = source[key];
    if (key.startsWith('include')) {
      if (typeof candidate === 'boolean') (result as Record<string, unknown>)[key] = candidate;
    } else if (Array.isArray(candidate) && candidate.every((item) => typeof item === 'string')) {
      (result as Record<string, unknown>)[key] = candidate;
    }
  }
  return result;
}

function schedule(value: unknown): MetadataCrawlerSchedule {
  const source = record(value, 'schedule');
  const cadence = string(source.cadence, 'schedule.cadence');
  const timezone = string(source.timezone, 'schedule.timezone');
  if (cadence === 'DAILY') {
    const timeOfDay = string(source.timeOfDay, 'schedule.timeOfDay');
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(timeOfDay)) {
      throw new Error('Invalid schedule.timeOfDay.');
    }
    return { cadence, timeOfDay, timezone, editable: true };
  }
  if (cadence === 'CUSTOM') {
    return {
      cadence,
      expression: string(source.expression, 'schedule.expression'),
      timezone,
      editable: false,
    };
  }
  throw new Error('Invalid schedule.cadence.');
}

function snapshotSummary(value: unknown): MetadataCrawlerSnapshotSummary {
  const source = record(value, 'snapshotSummary');
  return {
    hasSnapshot: boolean(source.hasSnapshot, 'snapshotSummary.hasSnapshot'),
    databaseCount: number(source.databaseCount, 'snapshotSummary.databaseCount'),
    schemaCount: number(source.schemaCount, 'snapshotSummary.schemaCount'),
    relationCount: number(source.relationCount, 'snapshotSummary.relationCount'),
    columnCount: number(source.columnCount, 'snapshotSummary.columnCount'),
    constraintCount: number(source.constraintCount, 'snapshotSummary.constraintCount'),
    ...(source.lastCrawledAt === undefined
      ? {}
      : { lastCrawledAt: string(source.lastCrawledAt, 'snapshotSummary.lastCrawledAt') }),
  };
}

function counters(value: unknown): MetadataCrawlerRun['counters'] {
  const source = record(value, 'counters');
  return {
    databaseCount: number(source.databaseCount ?? 0, 'counters.databaseCount'),
    schemaCount: number(source.schemaCount ?? 0, 'counters.schemaCount'),
    relationCount: number(source.relationCount ?? 0, 'counters.relationCount'),
    columnCount: number(source.columnCount ?? 0, 'counters.columnCount'),
    createdCount: number(source.createdCount ?? 0, 'counters.createdCount'),
    updatedCount: number(source.updatedCount ?? 0, 'counters.updatedCount'),
    unchangedCount: number(source.unchangedCount ?? 0, 'counters.unchangedCount'),
    deletedCount: number(source.deletedCount ?? 0, 'counters.deletedCount'),
    warningCount: number(source.warningCount ?? 0, 'counters.warningCount'),
  };
}

function failure(value: unknown): MetadataCrawlerFailure {
  const source = record(value, 'failure');
  return {
    category: string(source.category, 'failure.category'),
    summary: string(source.summary, 'failure.summary'),
  };
}

function asState(value: unknown): MetadataCrawler['state'] {
  if (value === 'ACTIVE' || value === 'PAUSED' || value === 'BLOCKED' || value === 'ARCHIVED')
    return value;
  throw new Error('The Core API returned an invalid metadata crawler state.');
}

function asRunStatus(value: unknown): MetadataCrawlerRun['status'] {
  if (
    value === 'QUEUED' ||
    value === 'RUNNING' ||
    value === 'SUCCEEDED' ||
    value === 'PARTIAL' ||
    value === 'FAILED' ||
    value === 'CANCELLED'
  )
    return value;
  throw new Error('The Core API returned an invalid metadata crawler run status.');
}

function record(value: unknown, field: string): MetadataCrawlerResponseDto {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`The Core API returned an invalid metadata crawler ${field}.`);
  return value as MetadataCrawlerResponseDto;
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`The Core API returned an invalid metadata crawler ${field}.`);
  return value;
}

function number(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`The Core API returned an invalid metadata crawler ${field}.`);
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean')
    throw new Error(`The Core API returned an invalid metadata crawler ${field}.`);
  return value;
}
