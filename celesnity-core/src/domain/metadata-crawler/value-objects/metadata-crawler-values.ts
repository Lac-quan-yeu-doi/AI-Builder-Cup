import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import { MetadataCrawlerMessage } from '@domain/metadata-crawler/errors/metadata-crawler.messages';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const MetadataCrawlerServiceFamily = {
  DATABASE: 'DATABASE',
} as const;
export type MetadataCrawlerServiceFamilyValue =
  (typeof MetadataCrawlerServiceFamily)[keyof typeof MetadataCrawlerServiceFamily];

export const MetadataCrawlerConcurrencyPolicy = {
  SKIP: 'SKIP',
} as const;
export type MetadataCrawlerConcurrencyPolicyValue =
  (typeof MetadataCrawlerConcurrencyPolicy)[keyof typeof MetadataCrawlerConcurrencyPolicy];

export const MetadataCrawlerTriggerType = {
  SCHEDULED: 'SCHEDULED',
  MANUAL: 'MANUAL',
} as const;
export type MetadataCrawlerTriggerTypeValue =
  (typeof MetadataCrawlerTriggerType)[keyof typeof MetadataCrawlerTriggerType];

export const MetadataCrawlerRunStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type MetadataCrawlerRunStatusValue =
  (typeof MetadataCrawlerRunStatus)[keyof typeof MetadataCrawlerRunStatus];

export const ACTIVE_METADATA_CRAWLER_RUN_STATUSES = [
  MetadataCrawlerRunStatus.QUEUED,
  MetadataCrawlerRunStatus.RUNNING,
] as const;
export const TERMINAL_METADATA_CRAWLER_RUN_STATUSES = [
  MetadataCrawlerRunStatus.SUCCEEDED,
  MetadataCrawlerRunStatus.PARTIAL,
  MetadataCrawlerRunStatus.FAILED,
  MetadataCrawlerRunStatus.CANCELLED,
] as const;

export type MetadataCrawlerDiscoveryConfig = Readonly<Record<string, unknown>>;

export interface MetadataCrawlerRunCounters {
  readonly databaseCount: number;
  readonly schemaCount: number;
  readonly relationCount: number;
  readonly columnCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly deletedCount: number;
  readonly warningCount: number;
}

export interface MetadataCrawlerRunFailure {
  readonly category: string;
  readonly summary: string;
}

export function uuid(label: string, value: string, invalidMessage?: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw MetadataCrawlerError.validation(invalidMessage ?? `${label} must be a valid UUID.`);
  }
  return normalized;
}

export function validDate(label: string, value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw MetadataCrawlerError.validation(MetadataCrawlerMessage.dateInvalid(label));
  }
  return new Date(value.getTime());
}

export function nonEmpty(label: string, value: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw MetadataCrawlerError.validation(`${label} is required.`);
  }
  if (normalized.length > maximum) {
    throw MetadataCrawlerError.validation(`${label} must not exceed ${maximum} characters.`);
  }
  return normalized;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortJson(record[key])]),
    );
  }
  return value;
}

export function copyJson<T extends MetadataCrawlerDiscoveryConfig>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function copyCounters(value: MetadataCrawlerRunCounters): MetadataCrawlerRunCounters {
  const fields = Object.entries(value);
  for (const [, candidate] of fields) {
    if (!Number.isInteger(candidate) || (candidate as number) < 0) {
      throw MetadataCrawlerError.validation(MetadataCrawlerMessage.countersInvalid);
    }
  }
  return {
    databaseCount: value.databaseCount,
    schemaCount: value.schemaCount,
    relationCount: value.relationCount,
    columnCount: value.columnCount,
    createdCount: value.createdCount,
    updatedCount: value.updatedCount,
    unchangedCount: value.unchangedCount,
    deletedCount: value.deletedCount,
    warningCount: value.warningCount,
  };
}

export function isActiveRunStatus(status: MetadataCrawlerRunStatusValue): boolean {
  return (ACTIVE_METADATA_CRAWLER_RUN_STATUSES as readonly string[]).includes(status);
}

export function isTerminalRunStatus(status: MetadataCrawlerRunStatusValue): boolean {
  return (TERMINAL_METADATA_CRAWLER_RUN_STATUSES as readonly string[]).includes(status);
}
