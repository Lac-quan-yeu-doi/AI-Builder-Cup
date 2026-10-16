import type {
  MetadataCrawlerConcurrencyPolicyValue,
  MetadataCrawlerDiscoveryConfig,
  MetadataCrawlerRunCounters,
  MetadataCrawlerRunFailure,
  MetadataCrawlerRunStatusValue,
  MetadataCrawlerServiceFamilyValue,
  MetadataCrawlerTriggerTypeValue,
} from '@domain/metadata-crawler/value-objects/metadata-crawler-values';
import type { MetadataCrawlerScheduleView } from '@application/metadata-crawler/interfaces/i-metadata-crawler-schedule';
import type { SourceMetadataSnapshotSummary } from '@application/metadata-crawler/read-models/source-metadata.view';

export interface MetadataCrawlerView {
  readonly id: string;
  readonly databaseServiceId: string;
  readonly name: string;
  readonly serviceFamily: MetadataCrawlerServiceFamilyValue;
  readonly enabled: boolean;
  readonly scheduleCron: string;
  readonly scheduleTimezone: string;
  readonly nextRunAt: string;
  readonly concurrencyPolicy: MetadataCrawlerConcurrencyPolicyValue;
  readonly timeoutSeconds: number;
  readonly revision: number;
  readonly discoveryConfig: MetadataCrawlerDiscoveryConfig;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MetadataCrawlerRunView {
  readonly id: string;
  readonly crawlerId: string;
  readonly triggerType: MetadataCrawlerTriggerTypeValue;
  readonly status: MetadataCrawlerRunStatusValue;
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
  readonly safeConfigSnapshot: MetadataCrawlerDiscoveryConfig;
  readonly counters: MetadataCrawlerRunCounters;
  readonly failure?: MetadataCrawlerRunFailure;
  readonly logObjectKey?: string;
}

export type MetadataCrawlerOperationalState = 'ACTIVE' | 'PAUSED' | 'BLOCKED' | 'ARCHIVED';

export interface MetadataCrawlerDatabaseServiceView {
  readonly id: string;
  readonly name: string;
  readonly connectorType: string;
}

export interface MetadataCrawlerDetailsView extends MetadataCrawlerView {
  readonly schedule: MetadataCrawlerScheduleView;
  readonly snapshotSummary: SourceMetadataSnapshotSummary;
  readonly state: MetadataCrawlerOperationalState;
  readonly databaseService: MetadataCrawlerDatabaseServiceView;
  readonly lastRun?: MetadataCrawlerRunView;
}

export interface MetadataCrawlerAssignableDatabaseServiceView extends MetadataCrawlerDatabaseServiceView {
  readonly capabilities: {
    readonly descriptions: boolean;
    readonly materializedViews: boolean;
    readonly ddl: boolean;
  };
}

export interface MetadataCrawlerListPage {
  readonly items: readonly MetadataCrawlerDetailsView[];
  readonly total: number;
}
