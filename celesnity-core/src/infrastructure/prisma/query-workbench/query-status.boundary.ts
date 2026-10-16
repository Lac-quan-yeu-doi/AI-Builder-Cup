import type { SqlExecutionStatus as PrismaSqlExecutionStatus } from '@generated/prisma/enums';
import { QueryStatusValue } from '@domain/query-workbench/value-objects/sql-execution-value-objects';

/**
 * The single place the query status vocabulary meets the database one.
 *
 * Both maps are exhaustive `Record`s rather than casts, so a member added to
 * either vocabulary without a counterpart fails the build here, at the boundary,
 * instead of failing silently at runtime. Note this vocabulary has no
 * `PREPARING`: a SQL query is not staged the way a Spark submission is.
 */
const TO_PRISMA: Readonly<Record<QueryStatusValue, PrismaSqlExecutionStatus>> = {
  [QueryStatusValue.QUEUED]: 'QUEUED',
  [QueryStatusValue.SUBMITTED]: 'SUBMITTED',
  [QueryStatusValue.RUNNING]: 'RUNNING',
  [QueryStatusValue.CANCELLING]: 'CANCELLING',
  [QueryStatusValue.SUCCEEDED]: 'SUCCEEDED',
  [QueryStatusValue.FAILED]: 'FAILED',
  [QueryStatusValue.CANCELLED]: 'CANCELLED',
  [QueryStatusValue.TIMED_OUT]: 'TIMED_OUT',
};

const TO_DOMAIN: Readonly<Record<PrismaSqlExecutionStatus, QueryStatusValue>> = {
  QUEUED: QueryStatusValue.QUEUED,
  SUBMITTED: QueryStatusValue.SUBMITTED,
  RUNNING: QueryStatusValue.RUNNING,
  CANCELLING: QueryStatusValue.CANCELLING,
  SUCCEEDED: QueryStatusValue.SUCCEEDED,
  FAILED: QueryStatusValue.FAILED,
  CANCELLED: QueryStatusValue.CANCELLED,
  TIMED_OUT: QueryStatusValue.TIMED_OUT,
};

export function toPrismaQueryStatus(status: QueryStatusValue): PrismaSqlExecutionStatus {
  return TO_PRISMA[status];
}

export function toDomainQueryStatus(status: PrismaSqlExecutionStatus): QueryStatusValue {
  return TO_DOMAIN[status];
}
