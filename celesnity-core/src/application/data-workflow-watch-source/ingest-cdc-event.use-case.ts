import type { IClock } from '@application/shared/interfaces/i-clock';
import type {
  IWatchSourceRepository,
  IngestCdcEventResult,
} from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type { CdcMetadataEvent } from '@domain/data-workflow-watch-source/models/cdc-event';

/** Persists one metadata-only CDC signal and lets the repository enforce replay idempotency. */
export class IngestCdcEventUseCase {
  public constructor(
    private readonly repository: IWatchSourceRepository,
    private readonly clock: IClock,
  ) {}

  public execute(event: CdcMetadataEvent): Promise<IngestCdcEventResult> {
    return this.repository.ingestCdcEvent(event, this.clock.now());
  }
}
