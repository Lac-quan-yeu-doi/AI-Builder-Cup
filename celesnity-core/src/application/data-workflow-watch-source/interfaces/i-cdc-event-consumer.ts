import type { CdcMetadataEvent } from '@domain/data-workflow-watch-source/models/cdc-event';

export interface ICdcEventConsumer {
  consume(handler: (event: CdcMetadataEvent) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}
