import { UniqueId } from '@domain/shared/unique-id';
import { assertReadOnlyStatement } from '@domain/query-workbench/policies/read-only-statement.policy';
import { SqlExecutionError } from '@domain/query-workbench/errors/sql-execution.errors';
import { TextGuard } from '@domain/shared/text-guard';
import { SqlExecutionMessage } from '@domain/query-workbench/errors/sql-execution.messages';

const MAX_STATEMENT_BYTES = 1_000_000;
const MAX_IDENTIFIER_LENGTH = 255;
const MAX_TRINO_QUERY_ID_LENGTH = 255;
const MAX_ERROR_CODE_LENGTH = 255;
const MAX_ERROR_MESSAGE_LENGTH = 4_000;
const MAX_COLUMNS = 4_096;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const TRINO_QUERY_ID_PATTERN = /^[A-Za-z0-9._-]{1,255}$/u;

const text = TextGuard.reporting((message) => SqlExecutionError.validation(message));

/**
 * Identifier of a persisted SQL execution.
 */
export class SqlExecutionId extends UniqueId {
  private constructor(value: string) {
    super(value);
  }

  public static from(value: string): SqlExecutionId {
    try {
      return new SqlExecutionId(value);
    } catch {
      throw SqlExecutionError.validation(SqlExecutionMessage.invalidExecutionId);
    }
  }
}

/**
 * A single SQL statement. Presence/size are validated here; read-only semantics
 * are enforced separately by {@link assertReadOnlyStatement}.
 */
export class SqlStatement {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  public static create(value: string): SqlStatement {
    if (typeof value !== 'string') {
      throw SqlExecutionError.validation(SqlExecutionMessage.statementNotAString);
    }
    const trimmed = normalizeSingleStatement(value.trim());
    if (trimmed.length === 0) {
      throw SqlExecutionError.validation(SqlExecutionMessage.statementRequired);
    }
    if (Buffer.byteLength(trimmed, 'utf8') > MAX_STATEMENT_BYTES) {
      throw SqlExecutionError.validation(
        SqlExecutionMessage.statementTooLarge(MAX_STATEMENT_BYTES),
      );
    }
    if (trimmed.includes('\0')) {
      throw SqlExecutionError.validation(SqlExecutionMessage.statementInvalidCharacter);
    }
    return new SqlStatement(trimmed);
  }

  public assertReadOnly(): void {
    assertReadOnlyStatement(this.value);
  }

  public preview(maxLength = 240): string {
    const collapsed = this.value.replace(/\s+/gu, ' ').trim();
    return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength - 1)}…`;
  }

  public equals(other: SqlStatement): boolean {
    return this.value === other.value;
  }
}

/**
 * Trino's HTTP statement endpoint expects the statement without a terminator.
 * Remove one trailing, top-level semicolon while leaving semicolons inside SQL
 * strings, identifiers and comments untouched. Statements containing any
 * other top-level semicolon remain unchanged and are rejected by the existing
 * single-statement/read-only validation path.
 */
function normalizeSingleStatement(value: string): string {
  const semicolons: number[] = [];
  let quote: "'" | '"' | undefined;
  let lineComment = false;
  let blockDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];
    if (lineComment) {
      if (current === '\n' || current === '\r') lineComment = false;
      continue;
    }
    if (blockDepth > 0) {
      if (current === '/' && next === '*') {
        blockDepth += 1;
        index += 1;
      } else if (current === '*' && next === '/') {
        blockDepth -= 1;
        index += 1;
      }
      continue;
    }
    if (quote !== undefined) {
      if (current === quote && next === quote) {
        index += 1;
      } else if (current === quote) {
        quote = undefined;
      }
      continue;
    }
    if (current === '-' && next === '-') {
      lineComment = true;
      index += 1;
    } else if (current === '/' && next === '*') {
      blockDepth = 1;
      index += 1;
    } else if (current === "'" || current === '"') {
      quote = current;
    } else if (current === ';') {
      semicolons.push(index);
    }
  }

  if (semicolons.length !== 1) return value;
  const terminator = semicolons[0]!;
  const suffix = value.slice(terminator + 1);
  if (!/^\s*(?:(?:--[^\r\n]*(?:\r?\n|$))|(?:\/\*[\s\S]*?\*\/))*\s*$/u.test(suffix)) {
    return value;
  }
  return `${value.slice(0, terminator)}${suffix}`.trim();
}

/**
 * Trino execution context: the catalog to run against plus an optional namespace/schema.
 */
export class QueryContext {
  private constructor(
    public readonly catalog: string,
    public readonly namespace: string | undefined,
  ) {
    Object.freeze(this);
  }

  public static create(catalog: string, namespace?: string | null): QueryContext {
    const normalizedCatalog = text.required('Catalog', catalog, MAX_IDENTIFIER_LENGTH);
    if (namespace === undefined || namespace === null) {
      return new QueryContext(normalizedCatalog, undefined);
    }
    const trimmedNamespace = namespace.trim();
    if (trimmedNamespace === '') {
      return new QueryContext(normalizedCatalog, undefined);
    }
    return new QueryContext(
      normalizedCatalog,
      text.required('Namespace', trimmedNamespace, MAX_IDENTIFIER_LENGTH),
    );
  }

  public equals(other: QueryContext): boolean {
    return this.catalog === other.catalog && this.namespace === other.namespace;
  }
}

/**
 * Opaque Trino query identifier returned by the statement protocol.
 */
export class TrinoQueryId {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  public static create(value: string): TrinoQueryId {
    const normalized = text.required('Trino query ID', value, MAX_TRINO_QUERY_ID_LENGTH);
    if (!TRINO_QUERY_ID_PATTERN.test(normalized)) {
      throw SqlExecutionError.validation(SqlExecutionMessage.trinoQueryIdUnsupportedCharacters);
    }
    return new TrinoQueryId(normalized);
  }

  public equals(other: TrinoQueryId): boolean {
    return this.value === other.value;
  }
}

/**
 * The SQL execution status vocabulary, owned here and nowhere else. Declared as
 * a string enum, matching how every other closed vocabulary in this codebase is
 * declared. Members carry their own persisted spelling, so callers name a status
 * (`QueryStatusValue.SUCCEEDED`) instead of repeating a bare literal, and the
 * enum object itself is what OpenAPI and `Object.values` consume.
 */
export enum QueryStatusValue {
  QUEUED = 'QUEUED',
  SUBMITTED = 'SUBMITTED',
  RUNNING = 'RUNNING',
  CANCELLING = 'CANCELLING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMED_OUT = 'TIMED_OUT',
}

const TERMINAL_STATUSES: ReadonlySet<QueryStatusValue> = new Set([
  QueryStatusValue.SUCCEEDED,
  QueryStatusValue.FAILED,
  QueryStatusValue.CANCELLED,
  QueryStatusValue.TIMED_OUT,
]);

/**
 * Narrows an arbitrary string to a member of the vocabulary. Needed at every
 * boundary where a status arrives as text, because a string enum deliberately
 * refuses assignment from a plain string.
 */
export function isQueryStatusValue(value: string): value is QueryStatusValue {
  return Object.values<string>(QueryStatusValue).includes(value);
}

/**
 * Whether a status is final. Exported so callers holding a raw status rather
 * than a {@link QueryStatus} ask the domain instead of restating the set, and to
 * match the `isTerminalStatus` predicate in the Execution Orchestration context.
 */
export function isTerminalQueryStatus(status: QueryStatusValue): boolean {
  return TERMINAL_STATUSES.has(status);
}

const ALLOWED_TRANSITIONS: Readonly<Record<QueryStatusValue, readonly QueryStatusValue[]>> = {
  [QueryStatusValue.QUEUED]: [
    QueryStatusValue.SUBMITTED,
    QueryStatusValue.CANCELLING,
    QueryStatusValue.CANCELLED,
    QueryStatusValue.FAILED,
    QueryStatusValue.TIMED_OUT,
  ],
  [QueryStatusValue.SUBMITTED]: [
    QueryStatusValue.RUNNING,
    QueryStatusValue.SUCCEEDED,
    QueryStatusValue.FAILED,
    QueryStatusValue.CANCELLING,
    QueryStatusValue.CANCELLED,
    QueryStatusValue.TIMED_OUT,
  ],
  // RUNNING may transition to itself: progress updates re-record the status.
  [QueryStatusValue.RUNNING]: [
    QueryStatusValue.RUNNING,
    QueryStatusValue.SUCCEEDED,
    QueryStatusValue.FAILED,
    QueryStatusValue.CANCELLING,
    QueryStatusValue.CANCELLED,
    QueryStatusValue.TIMED_OUT,
  ],
  [QueryStatusValue.CANCELLING]: [
    QueryStatusValue.CANCELLED,
    QueryStatusValue.FAILED,
    QueryStatusValue.SUCCEEDED,
    QueryStatusValue.TIMED_OUT,
  ],
  [QueryStatusValue.SUCCEEDED]: [],
  [QueryStatusValue.FAILED]: [],
  [QueryStatusValue.CANCELLED]: [],
  [QueryStatusValue.TIMED_OUT]: [],
};

/**
 * Lifecycle status of a SQL execution together with the strict transition policy.
 */
export class QueryStatus {
  private constructor(public readonly value: QueryStatusValue) {
    Object.freeze(this);
  }

  public static queued(): QueryStatus {
    return new QueryStatus(QueryStatusValue.QUEUED);
  }

  /**
   * Parses a persisted status. The membership check is what lets the cast be
   * safe: a string enum is not assignable from an arbitrary string, so the value
   * has to be proven a member first.
   */
  public static from(value: string): QueryStatus {
    if (!isQueryStatusValue(value)) {
      throw SqlExecutionError.validation(SqlExecutionMessage.unknownStatus(value));
    }
    return new QueryStatus(value);
  }

  public get isTerminal(): boolean {
    return TERMINAL_STATUSES.has(this.value);
  }

  public get isCancellable(): boolean {
    return !this.isTerminal;
  }

  public canTransitionTo(next: QueryStatusValue): boolean {
    return ALLOWED_TRANSITIONS[this.value].includes(next);
  }

  public equals(other: QueryStatus): boolean {
    return this.value === other.value;
  }
}

/**
 * Ordered result column with its Trino-visible type.
 */
export interface ResultColumn {
  readonly name: string;
  readonly type: string;
}

/**
 * Immutable list of result columns.
 */
export class QueryColumns {
  private constructor(public readonly values: readonly ResultColumn[]) {
    Object.freeze(this.values);
    Object.freeze(this);
  }

  public static create(columns: readonly ResultColumn[]): QueryColumns {
    if (columns.length > MAX_COLUMNS) {
      throw SqlExecutionError.validation(SqlExecutionMessage.tooManyColumns(MAX_COLUMNS));
    }
    const normalized = columns.map((column) => ({
      name: text.required('Column name', column.name, MAX_IDENTIFIER_LENGTH),
      type: text.required('Column type', column.type, MAX_IDENTIFIER_LENGTH),
    }));
    return new QueryColumns(normalized);
  }

  public toJSON(): readonly ResultColumn[] {
    return this.values;
  }
}

/**
 * Progress and resource statistics reported by Trino for a query.
 */
export interface QueryStatisticsProps {
  readonly state?: string;
  readonly queued?: boolean;
  readonly progressPercentage?: number;
  readonly elapsedTimeMillis?: number;
  readonly queuedTimeMillis?: number;
  readonly cpuTimeMillis?: number;
  readonly processedRows?: number;
  readonly processedBytes?: number;
  readonly peakMemoryBytes?: number;
  readonly totalSplits?: number;
  readonly completedSplits?: number;
}

export class QueryStatistics {
  private constructor(public readonly props: QueryStatisticsProps) {
    Object.freeze(this.props);
    Object.freeze(this);
  }

  public static create(props: QueryStatisticsProps): QueryStatistics {
    const sanitized: QueryStatisticsProps = {
      state: typeof props.state === 'string' ? props.state.slice(0, 64) : undefined,
      queued: typeof props.queued === 'boolean' ? props.queued : undefined,
      progressPercentage: finiteNumber(props.progressPercentage),
      elapsedTimeMillis: finiteNumber(props.elapsedTimeMillis),
      queuedTimeMillis: finiteNumber(props.queuedTimeMillis),
      cpuTimeMillis: finiteNumber(props.cpuTimeMillis),
      processedRows: finiteNumber(props.processedRows),
      processedBytes: finiteNumber(props.processedBytes),
      peakMemoryBytes: finiteNumber(props.peakMemoryBytes),
      totalSplits: finiteNumber(props.totalSplits),
      completedSplits: finiteNumber(props.completedSplits),
    };
    return new QueryStatistics(sanitized);
  }

  public toJSON(): QueryStatisticsProps {
    return this.props;
  }
}

function finiteNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Location within the submitted SQL text where a failure originated.
 */
export interface QueryFailureLocation {
  readonly line: number;
  readonly column: number;
}

/**
 * Sanitized, structured description of a query failure (code, message, location).
 */
export class QueryFailure {
  private constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly location: QueryFailureLocation | undefined,
  ) {
    Object.freeze(this);
  }

  public static create(input: {
    readonly code?: string | null;
    readonly message?: string | null;
    readonly location?: { readonly line?: number | null; readonly column?: number | null } | null;
  }): QueryFailure {
    const code =
      typeof input.code === 'string' && input.code.trim() !== ''
        ? input.code.trim().slice(0, MAX_ERROR_CODE_LENGTH)
        : SqlExecutionMessage.unknownFailureCode;
    const message =
      typeof input.message === 'string' && input.message.trim() !== ''
        ? input.message.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH)
        : SqlExecutionMessage.unknownFailureMessage;
    const location = QueryFailure.locationFrom(input.location);
    return new QueryFailure(code, message, location);
  }

  private static locationFrom(
    location: { readonly line?: number | null; readonly column?: number | null } | null | undefined,
  ): QueryFailureLocation | undefined {
    if (location === undefined || location === null) {
      return undefined;
    }
    const line = location.line;
    const column = location.column;
    if (
      typeof line !== 'number' ||
      typeof column !== 'number' ||
      !Number.isInteger(line) ||
      !Number.isInteger(column) ||
      line < 1 ||
      column < 1
    ) {
      return undefined;
    }
    return { line, column };
  }

  public toJSON(): QueryFailureLocation | undefined {
    return this.location;
  }
}

/**
 * Maximum number of result rows that will be retained/exposed for a query.
 */
export class QueryLimit {
  private constructor(public readonly maxRows: number) {
    Object.freeze(this);
  }

  public static create(maxRows: number): QueryLimit {
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > MAX_DATABASE_INTEGER) {
      throw SqlExecutionError.validation(
        SqlExecutionMessage.rowLimitOutOfRange(MAX_DATABASE_INTEGER),
      );
    }
    return new QueryLimit(maxRows);
  }
}
