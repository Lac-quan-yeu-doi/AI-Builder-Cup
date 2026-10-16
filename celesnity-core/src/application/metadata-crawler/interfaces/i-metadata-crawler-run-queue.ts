import type { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';
import type { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import type { MetadataCrawlerRunStatusValue } from '@domain/metadata-crawler/value-objects/metadata-crawler-values';

export interface MetadataCrawlerRecoveryResult {
  readonly requeued: readonly MetadataCrawlerRun[];
  readonly failed: number;
}

export interface IMetadataCrawlerRunQueue {
  enqueueManual(crawler: MetadataCrawler, now: Date): Promise<MetadataCrawlerRun>;
  claim(
    limit: number,
    workerId: string,
    leaseUntil: Date,
    now: Date,
  ): Promise<readonly MetadataCrawlerRun[]>;
  claimById(
    runId: string,
    workerId: string,
    leaseUntil: Date,
    now: Date,
  ): Promise<MetadataCrawlerRun | undefined>;
  findStatus(runId: string): Promise<MetadataCrawlerRunStatusValue | undefined>;
  heartbeat(runId: string, workerId: string, leaseUntil: Date, now: Date): Promise<boolean>;
  requeueExpired(maxAttempts: number, now: Date): Promise<MetadataCrawlerRecoveryResult>;
}
