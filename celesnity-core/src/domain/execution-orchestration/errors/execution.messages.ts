/**
 * Every validation message the Execution Orchestration context can raise.
 *
 * Kept beside {@link ExecutionError} rather than inline at each `throw`.
 */
export const ExecutionMessage = {
  // Identity
  invalidExecutionId: 'Execution ID must be a valid UUID.',
  sparkApplicationIdUnexpectedFormat: 'Spark application ID has an unexpected format.',

  // Temporal invariants
  updateBeforeQueue: 'Execution update time cannot precede its queue time.',

  // Process result
  exitCodeOutOfRange: 'Exit code must be an integer between 0 and 255.',

  // Log location
  logObjectKeyInvalid: 'Execution log object key is invalid.',
  logBucketInvalid: 'Execution log bucket must be a valid bucket name.',

  // Resource profile
  timeoutOutOfRange: 'Execution timeout must be between 1000 and 86400000 milliseconds.',
  invalidSparkMemory: (label: string): string => `${label} must be a valid Spark memory size.`,
} as const;
