import type { WorkflowActor } from '@application/data-workflow/interfaces/i-workflow-access';
import type {
  IWatchSourceAccess,
  WatchSourceMetadata,
  WatchSourceMetadataRelation,
} from '@application/data-workflow-watch-source/interfaces/i-watch-source-access';
import type { IWatchSourceCapabilityRegistry } from '@application/data-workflow-watch-source/interfaces/i-watch-source-capability-registry';
import type { ICdcConnectorManager } from '@application/data-workflow-watch-source/interfaces/i-cdc-connector-manager';
import {
  CdcConnectionRuntimeError,
  type ICdcConnectionRuntimeProvider,
} from '@application/database-service/interfaces/i-cdc-connection-runtime-provider';
import type {
  WatchSourceCapabilities,
  WatchSourceValidationResult,
  WorkflowWatchSourceTrigger,
} from '@domain/data-workflow-watch-source/models/watch-source';

export class ValidateWatchSourceTriggerUseCase {
  public constructor(
    private readonly access: IWatchSourceAccess,
    private readonly registry: IWatchSourceCapabilityRegistry,
    private readonly runtimeProvider?: ICdcConnectionRuntimeProvider,
    private readonly cdcManager?: Pick<ICdcConnectorManager, 'preflight'>,
  ) {}

  public async capabilities(
    actor: WorkflowActor,
    databaseServiceId: string,
  ): Promise<WatchSourceCapabilities> {
    const metadata = await this.access.readVerifiedMetadata(actor, databaseServiceId);
    return this.registry.capabilities(metadata);
  }

  public async validate(
    actor: WorkflowActor,
    trigger: WorkflowWatchSourceTrigger,
  ): Promise<WatchSourceValidationResult> {
    const metadata = await this.access.readVerifiedMetadata(actor, trigger.databaseServiceId);
    const validated = this.registry.validate(metadata, trigger);
    const issues = [...validated.issues, ...metadataIssues(metadata, trigger)];
    if (
      trigger.mode !== 'CDC' ||
      this.runtimeProvider === undefined ||
      this.cdcManager === undefined ||
      issues.length > 0
    ) {
      return { ...validated, issues };
    }
    let profile;
    try {
      profile = await this.runtimeProvider.requireVerified(trigger.databaseServiceId);
    } catch (error: unknown) {
      if (error instanceof CdcConnectionRuntimeError) {
        return {
          ...validated,
          issues,
          cdcPreflight: {
            available: false,
            code: error.code,
            message:
              error.code === 'CDC_CONNECTION_REQUIRED'
                ? 'Configure a dedicated CDC connection for this datasource.'
                : 'Validate the datasource CDC connection before publishing this workflow.',
            remediation: 'Open the datasource CDC connection settings and complete validation.',
          },
        };
      }
      throw error;
    }
    return {
      ...validated,
      issues,
      cdcPreflight: await this.cdcManager.preflight(profile, trigger),
    };
  }
}

function metadataIssues(
  metadata: WatchSourceMetadata,
  trigger: WorkflowWatchSourceTrigger,
): WatchSourceValidationResult['issues'] {
  const relations = indexRelations(metadata.relations);
  const issues: WatchSourceValidationResult['issues'][number][] = [];
  for (const selected of trigger.relations) {
    const relation = relations.get(selected.schema)?.get(selected.table);
    if (relation === undefined) {
      issues.push({ code: 'RELATION_NOT_AVAILABLE', relation: selected });
      continue;
    }
    if (trigger.mode !== 'POLLING' || !('cursor' in selected)) continue;
    const columns = new Set(relation.columns);
    for (const column of [selected.cursor.changeColumn, selected.cursor.tieBreakerColumn]) {
      if (!columns.has(column)) {
        issues.push({ code: 'CURSOR_COLUMN_NOT_AVAILABLE', relation: selected, column });
      }
    }
  }
  return issues;
}

/**
 * Database identifiers can contain dots when they were originally quoted.
 * Keep schema and table as independent map dimensions so distinct pairs can
 * never be merged by a separator-based key.
 */
function indexRelations(
  sourceRelations: readonly WatchSourceMetadataRelation[],
): ReadonlyMap<string, ReadonlyMap<string, WatchSourceMetadataRelation>> {
  const bySchema = new Map<string, Map<string, WatchSourceMetadataRelation>>();
  for (const relation of sourceRelations) {
    let byTable = bySchema.get(relation.schema);
    if (byTable === undefined) {
      byTable = new Map();
      bySchema.set(relation.schema, byTable);
    }
    byTable.set(relation.table, relation);
  }
  return bySchema;
}
