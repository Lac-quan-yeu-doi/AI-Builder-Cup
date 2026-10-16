import type {
  IWatchSourceRepository,
  SealCdcWindowsResult,
} from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type { IClock } from '@application/shared/interfaces/i-clock';

export interface SealCdcWindowsConfig {
  readonly batchSize: number;
}

/** Closes fixed CDC windows. A later event never moves an already-fixed deadline. */
export class SealCdcWindowsService {
  public constructor(
    private readonly repository: IWatchSourceRepository,
    private readonly clock: IClock,
    private readonly config: SealCdcWindowsConfig,
  ) {}

  public sealDueWindows(): Promise<SealCdcWindowsResult> {
    return this.repository.sealDueCdcWindows(this.clock.now(), this.config.batchSize);
  }
}
