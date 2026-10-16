export const DEFAULT_MINDER_DATABASE_SCHEMA = "minder_agent";

export function normalizeDatabaseSchema(schema: string | undefined): string {
  const normalized = schema?.trim() || DEFAULT_MINDER_DATABASE_SCHEMA;
  if (!/^[a-z_][a-z0-9_]*$/iu.test(normalized))
    throw new Error(
      "MINDER_DATABASE_SCHEMA must be a valid PostgreSQL identifier.",
    );
  return normalized;
}

export function buildPrismaDatasourceUrl(
  connectionString: string | undefined,
  schema: string | undefined,
): string | undefined {
  if (!connectionString?.trim()) return undefined;
  const url = new URL(connectionString);
  const normalizedSchema = normalizeDatabaseSchema(schema);
  url.searchParams.set("schema", normalizedSchema);
  return url.toString();
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
