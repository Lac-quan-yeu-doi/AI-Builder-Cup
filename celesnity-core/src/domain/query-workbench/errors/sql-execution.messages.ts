/**
 * Every validation and read-only-violation message the Query Workbench context
 * can raise.
 *
 * Kept beside {@link SqlExecutionError} rather than inline at each `throw`. The
 * read-only wording in particular is a security-relevant explanation shown to
 * users, so it is reviewed as part of this set rather than buried in a policy.
 */
export const SqlExecutionMessage = {
  // Identity
  invalidExecutionId: 'SQL execution ID must be a valid UUID.',
  trinoQueryIdUnsupportedCharacters: 'Trino query ID contains unsupported characters.',

  // Statement
  statementNotAString: 'SQL statement must be a string.',
  statementRequired: 'SQL statement is required.',
  statementInvalidCharacter: 'SQL statement contains an invalid character.',
  statementTooLarge: (maximumBytes: number): string =>
    `SQL statement must not exceed ${maximumBytes} UTF-8 bytes.`,

  // Read-only policy
  emptyStatement: 'A non-empty SQL statement is required.',
  multipleStatements: 'Only a single read-only SQL statement may be submitted.',
  notReadOnly:
    'Only read-only statements (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, TABLE, VALUES) are allowed.',

  // Temporal invariants
  updateBeforeQueue: 'Update time cannot precede the queue time.',
  startBeforeQueue: 'Start time cannot precede the queue time.',
  finishBeforeStart: 'Finish time cannot precede the start time.',
  terminalWithoutFinish: 'A terminal SQL execution must have a finish time.',

  // Status
  unknownStatus: (value: string): string => `Unknown SQL execution status: ${value}`,

  // Failure fallbacks, applied when the engine reports a failure without detail.
  // The code is persisted in `sql_executions.error_code`, so it is a stored
  // contract and not merely display text.
  unknownFailureCode: 'QUERY_FAILED',
  unknownFailureMessage: 'The query failed without a detailed message.',

  // Bounded values
  rowCountOutOfRange: (maximum: number): string =>
    `Row count must be an integer between 0 and ${maximum}.`,
  tooManyColumns: (maximum: number): string =>
    `A result cannot expose more than ${maximum} columns.`,
  rowLimitOutOfRange: (maximum: number): string =>
    `Result row limit must be an integer between 1 and ${maximum}.`,
} as const;
