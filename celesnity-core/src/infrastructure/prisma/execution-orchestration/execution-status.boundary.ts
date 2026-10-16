import type { ExecutionStatus as PrismaExecutionStatus } from '@generated/prisma/enums';
import { ExecutionStatusValue } from '@domain/execution-orchestration/value-objects/execution-value-objects';

/**
 * The single place the execution status vocabulary meets the database one.
 *
 * Both maps are exhaustive `Record`s rather than casts, so a member added to
 * either vocabulary without a counterpart fails the build here, at the boundary,
 * instead of failing silently at runtime. The spellings happen to match today;
 * the tables exist so that staying matched is checked rather than assumed.
 */
const TO_PRISMA: Readonly<Record<ExecutionStatusValue, PrismaExecutionStatus>> = {
  [ExecutionStatusValue.QUEUED]: 'QUEUED',
  [ExecutionStatusValue.PREPARING]: 'PREPARING',
  [ExecutionStatusValue.SUBMITTED]: 'SUBMITTED',
  [ExecutionStatusValue.RUNNING]: 'RUNNING',
  [ExecutionStatusValue.CANCELLING]: 'CANCELLING',
  [ExecutionStatusValue.SUCCEEDED]: 'SUCCEEDED',
  [ExecutionStatusValue.FAILED]: 'FAILED',
  [ExecutionStatusValue.CANCELLED]: 'CANCELLED',
  [ExecutionStatusValue.TIMED_OUT]: 'TIMED_OUT',
};

const TO_DOMAIN: Readonly<Record<PrismaExecutionStatus, ExecutionStatusValue>> = {
  QUEUED: ExecutionStatusValue.QUEUED,
  PREPARING: ExecutionStatusValue.PREPARING,
  SUBMITTED: ExecutionStatusValue.SUBMITTED,
  RUNNING: ExecutionStatusValue.RUNNING,
  CANCELLING: ExecutionStatusValue.CANCELLING,
  SUCCEEDED: ExecutionStatusValue.SUCCEEDED,
  FAILED: ExecutionStatusValue.FAILED,
  CANCELLED: ExecutionStatusValue.CANCELLED,
  TIMED_OUT: ExecutionStatusValue.TIMED_OUT,
};

export function toPrismaExecutionStatus(status: ExecutionStatusValue): PrismaExecutionStatus {
  return TO_PRISMA[status];
}

export function toDomainExecutionStatus(status: PrismaExecutionStatus): ExecutionStatusValue {
  return TO_DOMAIN[status];
}
