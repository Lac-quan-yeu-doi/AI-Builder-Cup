import type { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import type { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';

export interface IExecutionConnectionAdapter {
  build(
    config: NormalizedConnectionConfig,
    credential: PlaintextCredentialPayload,
  ): ExecutionConnectionDescriptor;
}
