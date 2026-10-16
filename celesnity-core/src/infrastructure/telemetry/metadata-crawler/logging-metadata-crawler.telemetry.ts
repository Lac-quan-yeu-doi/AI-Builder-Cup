import { Logger } from '@nestjs/common';
import type { IMetadataCrawlerTelemetry } from '@application/metadata-crawler/interfaces/i-metadata-crawler-telemetry';
import type { SanitizedCrawlerFailure } from '@application/metadata-crawler/interfaces/i-metadata-catalog-writer';
import type { MetadataCrawlerRunStatusValue } from '@domain/metadata-crawler/value-objects/metadata-crawler-values';

export class LoggingMetadataCrawlerTelemetry implements IMetadataCrawlerTelemetry {
  private readonly logger = new Logger(LoggingMetadataCrawlerTelemetry.name);

  public runFinished(input: {
    connectorType: string;
    status: MetadataCrawlerRunStatusValue;
    durationMs: number;
    relationCount: number;
  }): void {
    this.logger.log(JSON.stringify({ metric: 'metadata_crawler_run_finished', ...input }));
  }
  public activeRunsObserved(count: number): void {
    this.logger.log(JSON.stringify({ metric: 'metadata_crawler_active_runs', count }));
  }
  public scopeFailed(errorCategory: SanitizedCrawlerFailure['category']): void {
    this.logger.warn(JSON.stringify({ metric: 'metadata_crawler_scope_failed', errorCategory }));
  }
  public leaseRecovered(outcome: 'REQUEUED' | 'FAILED'): void {
    this.logger.log(JSON.stringify({ metric: 'metadata_crawler_lease_recovered', outcome }));
  }
}
