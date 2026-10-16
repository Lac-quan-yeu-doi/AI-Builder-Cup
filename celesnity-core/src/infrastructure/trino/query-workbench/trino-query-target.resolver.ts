import { Injectable } from '@nestjs/common';
import { createJiti } from 'jiti';
import type { ParseTree } from 'antlr4ng';
import type * as TrinoParserModule from 'dt-sql-parser/dist/parser/trino';
import type * as TrinoGrammarModule from 'dt-sql-parser/dist/lib/trino/TrinoSqlParser';
import type {
  IQueryTargetResolver,
  QueryTableTarget,
} from '@application/query-workbench/interfaces/i-query-target-resolver';
import type {
  QueryContext,
  SqlStatement,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import { SqlExecutionError } from '@domain/query-workbench/errors/sql-execution.errors';

// This parser publishes extensionless ESM. Load only the Trino grammar through
// jiti's CJS bridge; no SQL is evaluated as JavaScript and no other dialect is used.
const load = createJiti(__filename);
const { TrinoSQL } = load('dt-sql-parser/dist/parser/trino') as typeof TrinoParserModule;
const grammar = load('dt-sql-parser/dist/lib/trino/TrinoSqlParser') as typeof TrinoGrammarModule;

@Injectable()
export class TrinoQueryTargetResolver implements IQueryTargetResolver {
  public resolve(statement: SqlStatement, context: QueryContext): readonly QueryTableTarget[] {
    if (statement.value.length > 20_000) throw unsupported();
    // A fresh parser avoids shared mutable parse state across requests.
    const parser = new TrinoSQL();
    const parserInput = normalizeForPinnedParser(statement.value);
    const errors = parser.validate(parserInput);
    if (errors.length !== 0) {
      const first = errors[0]!;
      throw unsupported(
        `Authorization parser rejected the SQL at line ${first.startLine}, column ${first.startColumn}: ${first.message}`,
      );
    }
    const tree = parser.parse(parserInput);
    const statements = tree.statements();
    if (
      statements.length !== 1 ||
      !isContext(statements[0]?.singleStatement().statement(), grammar.StatementDefaultContext)
    )
      throw unsupported();
    const targets = new Map<string, QueryTableTarget>();
    let visited = 0;
    const visit = (node: ParseTree, scope: ReadonlySet<string>, depth = 0): void => {
      if (++visited > 20_000 || depth > 200) throw unsupported();
      if (isContext(node, grammar.QueryStatementContext)) {
        const local = new Set(scope);
        const withClause = node.with();
        // Recursive and forward CTE resolution is intentionally not guessed.
        if (withClause?.KW_RECURSIVE()) throw unsupported();
        for (const named of withClause?.namedQuery() ?? []) {
          visit(named.query(), local, depth + 1);
          local.add(identifier(named.identifier().getText()));
        }
        visit(node.queryNoWith(), local, depth + 1);
        return;
      }
      if (
        isContext(node, grammar.TableFunctionInvocationContext) ||
        isContext(node, grammar.FunctionSpecificationContext)
      )
        throw unsupported();
      if (
        isContext(node, grammar.FunctionCallContext) &&
        node.functionName().qualifiedName().identifier().length !== 1
      )
        throw unsupported();
      if (isContext(node, grammar.TableRefContext) || isContext(node, grammar.ViewRefContext)) {
        const parts = node.identifier().map((part) => identifier(part.getText()));
        if (parts.length === 1 && parts[0] && scope.has(parts[0])) return;
        const table = parts.at(-1);
        const schema = parts.length >= 2 ? parts.at(-2) : context.namespace;
        const catalog = parts.length === 3 ? parts[0] : context.catalog;
        if (parts.length > 3 || !table || !schema || !catalog) throw unsupported();
        const target = { catalog: identifier(catalog), schema: identifier(schema), table };
        targets.set(JSON.stringify(target), target);
        return;
      }
      for (let i = 0; i < node.getChildCount(); i++) {
        const child = node.getChild(i);
        if (child) visit(child, scope, depth + 1);
      }
    };
    visit(tree, new Set());
    return [...targets.values()];
  }
}

function identifier(value: string): string {
  const text =
    value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value;
  // Existing grant IDs use dot-separated names, without escaping. Reject names
  // that cannot be represented unambiguously, including Iceberg $ metadata tables.
  if (!/^[A-Za-z0-9_-]+$/u.test(text)) throw unsupported();
  return text.toLowerCase();
}

function isContext<T extends ParseTree>(
  node: ParseTree | undefined,
  type: { name: string; prototype: T },
): node is T {
  // Generated context names are stable within the pinned grammar. Constructor
  // identity can differ across Jest/jiti module realms; the tree is always
  // generated locally, never deserialized from a user-supplied AST.
  return node?.constructor.name === type.name;
}

function unsupported(detail?: string): SqlExecutionError {
  return SqlExecutionError.validation(
    detail ??
      'This SQL cannot be safely authorized. Use a SELECT, WITH, TABLE or VALUES query over base tables; recursive queries, session overrides, SQL routines and table functions are not supported.',
  );
}

/**
 * dt-sql-parser 4.5.1 does not accept Trino's boolean-test predicates even
 * though Trino 483 does. The resolver only extracts table targets, so a
 * semantics-preserving predicate rewrite lets the pinned parser inspect the
 * same relations while the original statement is still executed by Trino.
 */
function normalizeForPinnedParser(sql: string): string {
  const identifier = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_]*))*`;
  return sql
    .replace(
      new RegExp(`(${identifier})\\s+IS\\s+NOT\\s+TRUE\\b`, 'giu'),
      'NOT COALESCE($1, FALSE)',
    )
    .replace(new RegExp(`(${identifier})\\s+IS\\s+TRUE\\b`, 'giu'), 'COALESCE($1, FALSE)')
    .replace(new RegExp(`(${identifier})\\s+IS\\s+NOT\\s+FALSE\\b`, 'giu'), 'COALESCE($1, TRUE)')
    .replace(new RegExp(`(${identifier})\\s+IS\\s+FALSE\\b`, 'giu'), 'NOT COALESCE($1, TRUE)');
}
