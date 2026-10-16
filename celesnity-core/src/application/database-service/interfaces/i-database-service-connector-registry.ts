import type { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { IConnectionConfigCodec } from '@application/database-service/interfaces/i-connection-config-codec';
import type { IConnectionProbe } from '@application/database-service/interfaces/i-connection-probe';
import type { IExecutionConnectionAdapter } from '@application/database-service/interfaces/i-execution-connection-adapter';
import type { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import type { DatabaseServiceConnectorDescriptor } from '@application/database-service/read-models/database-service-connector-descriptor';
import type { ConnectorType } from '@domain/database-service/value-objects/connector-type';

export interface DatabaseServiceConnector {
  readonly connectorType: ConnectorType;
  readonly descriptor?: DatabaseServiceConnectorDescriptor;
  readonly configCodec: IConnectionConfigCodec;
  readonly probe: IConnectionProbe;
  readonly executionAdapter: IExecutionConnectionAdapter;
}

export interface IDatabaseServiceConnectorRegistry {
  require(connectorType: ConnectorType): DatabaseServiceConnector;
  list?(): readonly DatabaseServiceConnectorDescriptor[];
}

export type { ExecutionConnectionDescriptor, PlaintextCredentialPayload };
