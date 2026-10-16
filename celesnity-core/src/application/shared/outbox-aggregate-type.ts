/**
 * The `aggregate_type` values written to the outbox table.
 *
 * These are a persisted contract, not incidental labels: existing rows carry
 * these exact strings and downstream consumers dispatch on them, so renaming a
 * member value is a data migration rather than a refactor. That is why they are
 * declared here as one set rather than inlined at each mapper — two of the three
 * were bare literals, and only the execution mapper had named its own.
 *
 * The names deliberately match the aggregate class names they describe.
 */
export enum OutboxAggregateType {
  DataConnection = 'DataConnection',
  Script = 'Script',
  Execution = 'Execution',
  SqlExecution = 'SqlExecution',
  MetadataCrawlerRun = 'MetadataCrawlerRun',
}
