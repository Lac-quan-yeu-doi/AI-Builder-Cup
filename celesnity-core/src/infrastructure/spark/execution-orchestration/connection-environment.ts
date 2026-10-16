import type { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';

/** Converts a DBMS-neutral descriptor into the environment exposed to a Spark job. */
export function toConnectionEnvironment(
  descriptor: ExecutionConnectionDescriptor | undefined,
): Record<string, string> {
  if (descriptor === undefined) return {};
  return {
    CELESNITY_DB_DRIVER_CLASS: descriptor.driverClass,
    CELESNITY_DB_JDBC_URL: descriptor.jdbcUrl,
    ...descriptor.publicOptions,
    ...descriptor.secretOptions,
  };
}
