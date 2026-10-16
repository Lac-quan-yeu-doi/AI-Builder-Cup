import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type { WatchSourceRelation } from '@domain/data-workflow-watch-source/models/watch-source';
import type { DataWorkflowWatchSourceCheckpoint } from '@domain/data-workflow-watch-source/models/watch-source-persistence';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

export interface EstablishWatchSourceBaselineInput {
  readonly organizationId: string;
  readonly watchSourceId: string;
  readonly relation: WatchSourceRelation;
  readonly checkpoint: string;
}

/** Establishing a baseline is intentionally silent: existing rows never become a new event. */
export class EstablishWatchSourceBaselineUseCase {
  public constructor(
    private readonly repository: IWatchSourceRepository,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
  ) {}

  public execute(
    input: EstablishWatchSourceBaselineInput,
  ): Promise<DataWorkflowWatchSourceCheckpoint> {
    return this.repository.establishBaseline({
      id: this.ids.next(),
      organizationId: input.organizationId,
      watchSourceId: input.watchSourceId,
      relation: input.relation,
      checkpoint: input.checkpoint,
      establishedAt: this.clock.now(),
    });
  }
}
