import type { DatabaseServiceRuntimeProfile } from '@application/database-service/read-models/database-service-runtime-profile';
import type {
  WatchSourceCapabilities,
  WatchSourceValidationResult,
  WorkflowWatchSourceTrigger,
} from '@domain/data-workflow-watch-source/models/watch-source';

/** Connector-qualified boundary. Adapters validate metadata only in P1; they never query customer rows. */
export interface IWatchSourceCapabilityRegistry {
  capabilities(
    profile: Pick<DatabaseServiceRuntimeProfile, 'connectorType'>,
  ): WatchSourceCapabilities;
  validate(
    profile: Pick<DatabaseServiceRuntimeProfile, 'connectorType'>,
    trigger: WorkflowWatchSourceTrigger,
  ): WatchSourceValidationResult;
}
