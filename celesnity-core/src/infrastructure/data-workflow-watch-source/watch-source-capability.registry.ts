import type { IWatchSourceCapabilityRegistry } from '@application/data-workflow-watch-source/interfaces/i-watch-source-capability-registry';
import type { DatabaseServiceRuntimeProfile } from '@application/database-service/read-models/database-service-runtime-profile';
import type {
  WatchSourceCapabilities,
  WatchSourceValidationIssue,
  WatchSourceValidationResult,
  WorkflowWatchSourceTrigger,
} from '@domain/data-workflow-watch-source/models/watch-source';

const POLLING_TYPES = new Set(['POSTGRESQL', 'MYSQL']);
const CDC_TYPES = new Set(['POSTGRESQL', 'MYSQL']);
const CDC_CHANGES = ['INSERT', 'UPDATE', 'DELETE'] as const;

/**
 * Static DBMS capability. Source-specific replication privileges are checked
 * by CDC preflight; MariaDB stays excluded because it has no supported path.
 */
export class WatchSourceCapabilityRegistry implements IWatchSourceCapabilityRegistry {
  public capabilities(
    profile: Pick<DatabaseServiceRuntimeProfile, 'connectorType'>,
  ): WatchSourceCapabilities {
    const connectorType = profile.connectorType.trim().toUpperCase();
    if (!POLLING_TYPES.has(connectorType)) {
      return {
        connectorType,
        polling: false,
        cdc: false,
        supportedChangeTypes: [],
        reason: 'UNSUPPORTED_CONNECTOR',
      };
    }
    return {
      connectorType,
      polling: true,
      cdc: CDC_TYPES.has(connectorType),
      supportedChangeTypes: [...CDC_CHANGES],
    };
  }

  public validate(
    profile: Pick<DatabaseServiceRuntimeProfile, 'connectorType'>,
    trigger: WorkflowWatchSourceTrigger,
  ): WatchSourceValidationResult {
    const capabilities = this.capabilities(profile);
    const issues: WatchSourceValidationIssue[] = [];
    if (trigger.mode === 'POLLING') {
      if (!capabilities.polling) issues.push({ code: 'UNSUPPORTED_CONNECTOR' });
      for (const relation of trigger.relations) {
        if (
          relation.cursor.changeColumn.trim() === '' ||
          relation.cursor.tieBreakerColumn.trim() === '' ||
          relation.cursor.changeColumn === relation.cursor.tieBreakerColumn
        ) {
          issues.push({ code: 'NO_RELIABLE_CURSOR', relation });
        }
      }
    } else {
      if (!capabilities.cdc) issues.push({ code: 'UNSUPPORTED_CONNECTOR' });
      for (const changeType of trigger.changeTypes) {
        if (!capabilities.supportedChangeTypes.includes(changeType)) {
          issues.push({ code: 'UNSUPPORTED_CHANGE_TYPE', changeType });
        }
      }
    }
    return { capabilities, issues };
  }
}
