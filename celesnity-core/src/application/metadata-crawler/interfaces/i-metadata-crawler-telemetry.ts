import type { MetadataCrawlerRunStatusValue } from '@domain/metadata-crawler/value-objects/metadata-crawler-values';
import type { SanitizedCrawlerFailure } from '@application/metadata-crawler/interfaces/i-metadata-catalog-writer';

export interface IMetadataCrawlerTelemetry {
  runFinished(input: {
    readonly connectorType: string;
    readonly status: MetadataCrawlerRunStatusValue;
    readonly durationMs: number;
    readonly relationCount: number;
  }): void;
  activeRunsObserved(count: number): void;
  scopeFailed(errorCategory: SanitizedCrawlerFailure['category']): void;
  leaseRecovered(outcome: 'REQUEUED' | 'FAILED'): void;
}
