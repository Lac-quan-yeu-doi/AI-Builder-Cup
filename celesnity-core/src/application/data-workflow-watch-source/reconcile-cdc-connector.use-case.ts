import type { ICdcConnectionRuntimeProvider } from '@application/database-service/interfaces/i-cdc-connection-runtime-provider';
import type { ICdcConnectorManager } from '@application/data-workflow-watch-source/interfaces/i-cdc-connector-manager';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type { CdcConnectorStatus } from '@domain/data-workflow-watch-source/models/cdc-connector';
import type { WatchSourceRelation } from '@domain/data-workflow-watch-source/models/watch-source';
import type { WorkflowWatchSourceTrigger } from '@domain/data-workflow/models/workflow-trigger';

export interface ReconcileCdcConnectorCommand {
  readonly organizationId: string;
  readonly databaseServiceId: string;
  readonly trigger: Extract<WorkflowWatchSourceTrigger, { type: 'WATCH_SOURCE'; mode: 'CDC' }>;
}

/** Resolves verified credentials at the application boundary and delegates connector lifecycle to infrastructure. */
export class ReconcileCdcConnectorUseCase {
  public constructor(
    private readonly runtimeProvider: ICdcConnectionRuntimeProvider,
    private readonly manager: ICdcConnectorManager,
    private readonly watchSources?: Pick<IWatchSourceRepository, 'listActiveCdcRelations'>,
  ) {}

  public async execute(command: ReconcileCdcConnectorCommand): Promise<CdcConnectorStatus> {
    const profile = await this.runtimeProvider.requireVerified(command.databaseServiceId);
    const relations = await this.activeRelations(command);
    return this.manager.reconcile({
      organizationId: command.organizationId,
      databaseServiceId: command.databaseServiceId,
      trigger: { ...command.trigger, relations },
      profile,
    });
  }

  public pause(organizationId: string, databaseServiceId: string): Promise<void> {
    return this.manager.pause(organizationId, databaseServiceId);
  }

  private async activeRelations(
    command: ReconcileCdcConnectorCommand,
  ): Promise<readonly WatchSourceRelation[]> {
    const current = uniqueRelations(command.trigger.relations);
    if (this.watchSources?.listActiveCdcRelations === undefined) return current;
    try {
      const active = await this.watchSources.listActiveCdcRelations(
        command.organizationId,
        command.databaseServiceId,
      );
      return uniqueRelations([...current, ...active]);
    } catch {
      // The publication is already durable. Keep reconciliation retryable with
      // the current trigger if the metadata read is temporarily unavailable.
      return current;
    }
  }
}

function uniqueRelations(
  relations: readonly WatchSourceRelation[],
): readonly WatchSourceRelation[] {
  const unique = new Map<string, WatchSourceRelation>();
  for (const relation of relations) {
    const schema = relation.schema.trim();
    const table = relation.table.trim();
    if (schema === '' || table === '') continue;
    unique.set(`${schema}\u0000${table}`, { schema, table });
  }
  return [...unique.values()].sort((left, right) =>
    `${left.schema}\u0000${left.table}`.localeCompare(`${right.schema}\u0000${right.table}`),
  );
}
