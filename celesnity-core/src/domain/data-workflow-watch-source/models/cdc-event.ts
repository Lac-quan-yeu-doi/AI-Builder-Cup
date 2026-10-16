import type {
  WatchSourceChangeType,
  WatchSourceRelation,
} from '@domain/data-workflow-watch-source/models/watch-source';

/**
 * The only source payload accepted by the CDC control plane. Debezium must
 * reduce a change to this metadata before it reaches Core; row images, keys,
 * SQL, credentials, and raw connector positions are deliberately absent.
 */
export interface CdcMetadataEvent {
  readonly connectorId: string;
  /** Connector identity is tenant-scoped so background ingestion never falls back to a default tenant. */
  readonly organizationId: string;
  readonly databaseServiceId: string;
  readonly relation: WatchSourceRelation;
  readonly operation: WatchSourceChangeType;
  readonly positionFingerprint: string;
  readonly committedAt: Date;
  readonly topic: string;
  readonly partition: number;
  /** Used only to acknowledge Kafka; it is never persisted or logged. */
  readonly offset: string;
}

export interface CdcWindowRelationSummary {
  readonly relation: WatchSourceRelation;
  readonly changeTypes: readonly WatchSourceChangeType[];
  readonly eventCount: number;
  readonly firstEventAt: Date;
  readonly lastEventAt: Date;
}

export type CdcWindowStatus = 'OPEN' | 'READY' | 'DISPATCHED';

export interface CdcWindow {
  readonly id: string;
  readonly organizationId: string;
  readonly watchSourceId: string;
  readonly openedAt: Date;
  readonly closesAt: Date;
  readonly status: CdcWindowStatus;
  readonly eventCount: number;
  readonly relations: readonly CdcWindowRelationSummary[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
