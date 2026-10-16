export type MetadataCrawlerState = 'ACTIVE' | 'PAUSED' | 'BLOCKED' | 'ARCHIVED';
export type MetadataCrawlerRunStatus =
  'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';

export interface MetadataCrawlerDiscoveryConfig {
  readonly includeViews: boolean;
  readonly includeMaterializedViews: boolean;
  readonly includeDdl: boolean;
  readonly databaseIncludes: readonly string[];
  readonly databaseExcludes: readonly string[];
  readonly schemaIncludes: readonly string[];
  readonly schemaExcludes: readonly string[];
  readonly relationIncludes: readonly string[];
  readonly relationExcludes: readonly string[];
}

export const DEFAULT_METADATA_CRAWLER_DISCOVERY: MetadataCrawlerDiscoveryConfig = {
  includeViews: true,
  includeMaterializedViews: true,
  includeDdl: false,
  databaseIncludes: [],
  databaseExcludes: [],
  schemaIncludes: [],
  schemaExcludes: [],
  relationIncludes: [],
  relationExcludes: [],
};

export interface MetadataCrawlerServiceSummary {
  readonly id: string;
  readonly name: string;
  readonly connectorType: string;
}

export interface MetadataCrawlerSnapshotSummary {
  readonly hasSnapshot: boolean;
  readonly databaseCount: number;
  readonly schemaCount: number;
  readonly relationCount: number;
  readonly columnCount: number;
  readonly constraintCount: number;
  readonly lastCrawledAt?: string;
}

export type MetadataCrawlerSchedule =
  | {
      readonly cadence: 'DAILY';
      readonly timeOfDay: string;
      readonly timezone: string;
      readonly editable: true;
    }
  | {
      readonly cadence: 'CUSTOM';
      readonly expression: string;
      readonly timezone: string;
      readonly editable: false;
    };

export interface MetadataCrawlerCounters {
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

export interface MetadataCrawlerFailure {
  readonly category: string;
  readonly summary: string;
}

export interface MetadataCrawlerRun {
  readonly id: string;
  readonly crawlerId: string;
  readonly triggerType: 'SCHEDULED' | 'MANUAL' | string;
  readonly status: MetadataCrawlerRunStatus;
  readonly scheduledFor?: string;
  readonly queuedAt: string;
  readonly claimedAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly heartbeatAt?: string;
  readonly leaseExpiresAt?: string;
  readonly workerId?: string;
  readonly attempt: number;
  readonly crawlerRevision: number;
  readonly connectorTypeSnapshot: string;
  readonly counters: MetadataCrawlerCounters;
  readonly failure?: MetadataCrawlerFailure;
}

export interface MetadataCrawler {
  readonly id: string;
  readonly databaseServiceId: string;
  readonly name: string;
  readonly state: MetadataCrawlerState;
  readonly enabled: boolean;
  readonly schedule: MetadataCrawlerSchedule;
  readonly nextRunAt: string;
  readonly timeoutSeconds: number;
  readonly revision: number;
  readonly databaseService: MetadataCrawlerServiceSummary;
  readonly snapshotSummary: MetadataCrawlerSnapshotSummary;
  readonly lastRun?: MetadataCrawlerRun;
  readonly discoveryConfig: MetadataCrawlerDiscoveryConfig;
  readonly archivedAt?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface MetadataCrawlerListPage {
  readonly items: readonly MetadataCrawler[];
  readonly total: number;
}

export interface MetadataCrawlerAssignableService extends MetadataCrawlerServiceSummary {
  readonly capabilities: {
    readonly descriptions: boolean;
    readonly materializedViews: boolean;
    readonly ddl: boolean;
  };
}

export interface AssignMetadataCrawlerInput {
  readonly databaseServiceId: string;
  readonly name?: string;
  readonly schedule: {
    readonly cadence: 'DAILY';
    readonly timeOfDay: string;
    readonly timezone: string;
  };
  readonly discovery?: Partial<MetadataCrawlerDiscoveryConfig>;
  readonly timeoutSeconds?: number;
}

export interface UpdateMetadataCrawlerInput {
  readonly name?: string;
  readonly enabled?: boolean;
  readonly schedule?: {
    readonly cadence: 'DAILY';
    readonly timeOfDay: string;
    readonly timezone: string;
  };
  readonly discovery?: Partial<MetadataCrawlerDiscoveryConfig>;
  readonly timeoutSeconds?: number;
}

export interface MetadataCrawlerLog {
  readonly runId: string;
  readonly content: string;
  readonly byteSize: number;
}
