import type { VerificationStatus as PrismaVerificationStatus } from '@generated/prisma/enums';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';

/**
 * The single place the verification vocabulary meets the database one.
 *
 * Both maps are exhaustive `Record`s rather than casts, so a member added to
 * either vocabulary without a counterpart fails the build here, at the boundary,
 * instead of failing silently at runtime.
 */
const TO_PRISMA: Readonly<Record<VerificationStatusValue, PrismaVerificationStatus>> = {
  [VerificationStatusValue.UNTESTED]: 'UNTESTED',
  [VerificationStatusValue.SUCCEEDED]: 'SUCCEEDED',
  [VerificationStatusValue.FAILED]: 'FAILED',
};

const TO_DOMAIN: Readonly<Record<PrismaVerificationStatus, VerificationStatusValue>> = {
  UNTESTED: VerificationStatusValue.UNTESTED,
  SUCCEEDED: VerificationStatusValue.SUCCEEDED,
  FAILED: VerificationStatusValue.FAILED,
};

export function toPrismaVerificationStatus(
  status: VerificationStatusValue,
): PrismaVerificationStatus {
  return TO_PRISMA[status];
}

export function toDomainVerificationStatus(
  status: PrismaVerificationStatus,
): VerificationStatusValue {
  return TO_DOMAIN[status];
}
