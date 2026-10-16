import type { DatabaseServiceInput } from '@/src/entities/models/database-service';

/**
 * Trims what the visitor typed, and carries everything else through.
 *
 * Rebuilt field by field on purpose, so a value Core cares about has to be
 * named here to survive. `databaseName` was not, and it is the field the
 * database screen's own list filters on: a source created from inside a
 * database arrived without its initial membership, then vanished from the
 * list that created it on the next load.
 */
export function normalizeDatabaseServiceInput(input: DatabaseServiceInput): DatabaseServiceInput {
  const initialDatabaseName = input.initialDatabaseName?.trim();
  const legacyDatabaseName = input.databaseName?.trim();
  if (
    initialDatabaseName !== undefined &&
    initialDatabaseName !== '' &&
    legacyDatabaseName !== undefined &&
    legacyDatabaseName !== '' &&
    initialDatabaseName !== legacyDatabaseName
  ) {
    throw new Error(
      'initialDatabaseName and databaseName must identify the same catalog database.',
    );
  }
  const membership = initialDatabaseName || legacyDatabaseName;
  return {
    name: input.name.trim(),
    ...(membership === undefined || membership === '' ? {} : { initialDatabaseName: membership }),
    connectorType: input.connectorType.trim().toUpperCase(),
    details: normalizeDatabaseServiceDetails(input.details),
  };
}

export function normalizeDatabaseServiceDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  );
}
