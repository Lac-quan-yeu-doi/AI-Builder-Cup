import type { CdcConnectionRuntimeProfile } from '@application/database-service/read-models/cdc-connection-runtime-profile';
import type {
  CdcConnectorStatus,
  CdcPreflightResult,
} from '@domain/data-workflow-watch-source/models/cdc-connector';
import type { WorkflowWatchSourceTrigger } from '@domain/data-workflow/models/workflow-trigger';

export interface CdcConnectorReconciliationInput {
  readonly organizationId: string;
  readonly databaseServiceId: string;
  readonly trigger: Extract<WorkflowWatchSourceTrigger, { type: 'WATCH_SOURCE'; mode: 'CDC' }>;
  readonly profile: CdcConnectionRuntimeProfile;
}

/** Boundary for source preflight and Debezium Connect lifecycle operations. */
export interface ICdcConnectorManager {
  preflight(
    profile: CdcConnectionRuntimeProfile,
    trigger: CdcConnectorReconciliationInput['trigger'],
  ): Promise<CdcPreflightResult>;
  reconcile(input: CdcConnectorReconciliationInput): Promise<CdcConnectorStatus>;
  pause(organizationId: string, databaseServiceId: string): Promise<void>;
}
