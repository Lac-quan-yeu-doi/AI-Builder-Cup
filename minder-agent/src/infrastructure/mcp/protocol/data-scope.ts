import type { JsonObject } from "@domain/index.js";
import type { DataScope } from "@application/shared/ports/index.js";
export type { DataScope } from "@application/shared/ports/index.js";
export { normalizeDataScope } from "@application/shared/ports/index.js";

/** Returns a model-facing refusal when a call leaves the selected database. */
export function checkDataScope(
  scope: DataScope,
  args: JsonObject,
): string | undefined {
  const namedError = checkNamedScope(scope, args);
  if (namedError) return namedError;
  for (const key of ["query", "sql", "statement"]) {
    const sql = args[key];
    if (typeof sql !== "string") continue;
    const sqlError = checkSql(scope, sql);
    if (sqlError) return sqlError;
  }
  return undefined;
}

function checkNamedScope(
  scope: DataScope,
  args: JsonObject,
): string | undefined {
  const catalog = args.catalog;
  if (typeof catalog === "string" && !catalogEquals(scope, catalog))
    return refusal(scope, catalog);
  const schema = args.schema;
  if (typeof schema === "string" && !sameIdentifier(schema, scope.schema))
    return refusal(scope, schema);
  return undefined;
}

/**
 * Conservative relation extraction for SQL-bearing MCP tools. Bare table
 * names are intentionally left alone because they resolve against the
 * server's selected schema and can also be CTE names. Qualified names must
 * match the run scope. Unknown SQL is refused rather than sent to a data
 * server.
 */
function checkSql(scope: DataScope, sql: string): string | undefined {
  const stripped = stripSqlCommentsAndStrings(sql);
  if (!balancedParentheses(stripped))
    return refusal(scope, "an unparseable query");
  const relationPattern =
    /\b(?:from|join|update|into|using)\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*)){0,2})/gi;
  for (const match of stripped.matchAll(relationPattern)) {
    const raw = match[1];
    if (!raw) continue;
    const parts = raw
      .split(".")
      .map((part) => part.trim().replace(/^"|"$/g, ""));
    if (parts.length === 1) continue;
    if (parts.length === 2) {
      if (!sameIdentifier(parts[0]!, scope.schema))
        return refusal(scope, parts[0]!);
      continue;
    }
    if (
      !catalogEquals(scope, parts[0]!) ||
      !sameIdentifier(parts[1]!, scope.schema)
    )
      return refusal(scope, parts[0] === scope.catalog ? parts[1]! : parts[0]!);
  }
  return undefined;
}

function stripSqlCommentsAndStrings(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''");
}

function balancedParentheses(value: string): boolean {
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

function sameIdentifier(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function catalogEquals(scope: DataScope, catalog: string): boolean {
  return scope.catalog === undefined || sameIdentifier(scope.catalog, catalog);
}

function refusal(scope: DataScope, attempted: string): string {
  return `This conversation is scoped to the '${scope.schema}' database, so '${attempted}' is out of reach.`;
}
