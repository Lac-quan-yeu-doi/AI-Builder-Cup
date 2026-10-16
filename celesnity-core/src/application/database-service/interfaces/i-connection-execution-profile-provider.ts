import type { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';

/** Port: resolves the DBMS-specific execution descriptor for an active connection. */
export interface IConnectionExecutionProfileProvider {
  resolveExecutionProfile(connectionId: string): Promise<ExecutionConnectionDescriptor>;
}
