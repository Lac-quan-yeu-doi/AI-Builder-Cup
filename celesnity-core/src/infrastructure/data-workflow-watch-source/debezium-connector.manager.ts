import { Injectable } from '@nestjs/common';

import type {
  ICdcConnectorManager,
  CdcConnectorReconciliationInput,
} from '@application/data-workflow-watch-source/interfaces/i-cdc-connector-manager';
import type { CdcConnectionRuntimeProfile } from '@application/database-service/read-models/cdc-connection-runtime-profile';
import type {
  CdcConnectorStatus,
  CdcPreflightResult,
} from '@domain/data-workflow-watch-source/models/cdc-connector';
import { DebeziumConnectClient } from '@infrastructure/data-workflow-watch-source/debezium-connect.client';
import {
  DebeziumConnectorConfigFactory,
  connectorName,
} from '@infrastructure/data-workflow-watch-source/debezium-connector-config.factory';
import { CdcSourcePreflight } from '@infrastructure/data-workflow-watch-source/cdc-source-preflight';

@Injectable()
export class DebeziumConnectorManager implements ICdcConnectorManager {
  public constructor(
    private readonly client: DebeziumConnectClient,
    private readonly factory: DebeziumConnectorConfigFactory,
    private readonly sourcePreflight?: CdcSourcePreflight,
  ) {}

  public async preflight(
    profile: CdcConnectionRuntimeProfile,
    _trigger: CdcConnectorReconciliationInput['trigger'],
  ): Promise<CdcPreflightResult> {
    const connectorType = profile.connectorType.trim().toUpperCase();
    if (connectorType !== 'POSTGRESQL' && connectorType !== 'MYSQL') {
      return {
        available: false,
        code: 'UNSUPPORTED_CONNECTOR',
        message: 'CDC is available only for PostgreSQL and MySQL sources.',
        remediation: 'Use polling for this source type.',
      };
    }
    const sourceResult = await this.sourcePreflight?.check(profile);
    if (sourceResult !== undefined && !sourceResult.available) return sourceResult;
    try {
      await this.client.checkHealth();
      return {
        available: true,
        code: 'READY',
        message: 'The local Debezium Connect runtime is reachable.',
      };
    } catch {
      return {
        available: false,
        code: 'CONNECTOR_UNAVAILABLE',
        message: 'The local CDC runtime is not ready.',
        remediation: 'Start the local cdc Compose profile and retry the preflight.',
      };
    }
  }

  public async reconcile(input: CdcConnectorReconciliationInput): Promise<CdcConnectorStatus> {
    const preflight = await this.preflight(input.profile, input.trigger);
    const name = connectorName(input.organizationId, input.databaseServiceId);
    if (!preflight.available) return { name, lifecycle: 'SETUP_REQUIRED', preflight };

    let spec: ReturnType<DebeziumConnectorConfigFactory['build']>;
    try {
      spec = this.factory.build(
        input.organizationId,
        input.databaseServiceId,
        input.profile,
        input.trigger,
      );
    } catch {
      return {
        name,
        lifecycle: 'SETUP_REQUIRED',
        preflight: {
          available: false,
          code: 'CONNECTOR_CONFIGURATION_INVALID',
          message: 'The CDC connector configuration could not be built.',
          remediation: 'Verify the source connection and selected tables, then retry publish.',
        },
      };
    }
    try {
      const existing = await this.client.get(spec.name);
      if (existing === undefined) await this.client.create(spec.name, spec.config);
      else if (!matchesDesiredConfig(existing.config, spec.config)) {
        await this.client.update(spec.name, spec.config);
      }
      const status = await this.client.getStatus(spec.name);
      if (
        status === undefined ||
        status.connectorState.toUpperCase() !== 'RUNNING' ||
        status.taskStates.length === 0 ||
        status.taskStates.some((state) => state.toUpperCase() !== 'RUNNING')
      ) {
        return {
          name: spec.name,
          lifecycle: 'FAILED',
          preflight: {
            available: false,
            code: 'CONNECTOR_TASK_FAILED',
            message: 'The CDC connector or one of its tasks is not running.',
            remediation: 'Check the local Debezium Connect task status and logs, then retry.',
          },
        };
      }
      return { name: spec.name, lifecycle: 'RUNNING', preflight };
    } catch {
      return {
        name: spec.name,
        lifecycle: 'FAILED',
        preflight: {
          available: false,
          code: 'CONNECTOR_UNAVAILABLE',
          message: 'The local CDC connector could not be reconciled.',
          remediation: 'Check the local Debezium Connect logs and retry reconciliation.',
        },
      };
    }
  }

  public pause(organizationId: string, databaseServiceId: string): Promise<void> {
    return this.client.pause(connectorName(organizationId, databaseServiceId));
  }
}

function matchesDesiredConfig(
  actual: Readonly<Record<string, unknown>> | undefined,
  desired: Readonly<Record<string, string>>,
): boolean {
  if (actual === undefined) return false;
  return Object.entries(desired).every(([key, value]) => actual[key] === value);
}
