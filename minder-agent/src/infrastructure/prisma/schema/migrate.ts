import {
  normalizeDatabaseSchema,
  quoteIdentifier,
} from "../database-config.js";
import { PRISMA_BASELINE_MIGRATION_SQL } from "../migration-sql.js";
import type { PrismaService } from "../prisma.service.js";

export async function migratePrismaSchema(
  prisma: PrismaService,
  schema?: string,
): Promise<void> {
  const normalized = normalizeDatabaseSchema(schema);
  await prisma.$transaction(async (client) => {
    await client.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(normalized)}`,
    );
    await client.$executeRawUnsafe(
      `SET LOCAL search_path TO ${quoteIdentifier(normalized)}, public`,
    );
    for (const statement of splitSqlStatements(PRISMA_BASELINE_MIGRATION_SQL))
      await client.$executeRawUnsafe(statement);
  });
}

function splitSqlStatements(sql: string): readonly string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "'" | '"' | undefined;
  let dollarQuote: string | undefined;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (dollarQuote !== undefined) {
      if (sql.startsWith(dollarQuote, index)) {
        index += dollarQuote.length - 1;
        dollarQuote = undefined;
      }
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) {
        if (sql[index + 1] === quote) index += 1;
        else quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "$") {
      const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u);
      if (match) {
        dollarQuote = match[0];
        index += dollarQuote.length - 1;
        continue;
      }
    }
    if (character === ";") {
      const statement = sql.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  const trailing = sql.slice(start).trim();
  if (trailing) statements.push(trailing);
  return statements;
}
