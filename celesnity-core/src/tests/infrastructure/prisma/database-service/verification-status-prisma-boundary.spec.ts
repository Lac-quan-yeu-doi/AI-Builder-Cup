import { VerificationStatus as PrismaVerificationStatus } from '@generated/prisma/enums';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import {
  toDomainVerificationStatus,
  toPrismaVerificationStatus,
} from '@infrastructure/prisma/database-service/verification-status.boundary';

/**
 * Guards the one place the domain verification vocabulary meets the database one.
 *
 * The exhaustive `Record`s in verification-status.boundary.ts already make a
 * member added on either side a compile error. These cases cover the runtime half
 * of the same contract, so a Prisma schema change that drops or renames a member
 * is caught by the suite too, and prove the conversion round-trips.
 */
describe('verification status Prisma boundary', () => {
  it('the domain vocabulary and the Prisma enum have the same members', () => {
    expect(Object.values<string>(VerificationStatusValue).sort()).toEqual(
      Object.values<string>(PrismaVerificationStatus).sort(),
    );
  });

  it.each(Object.values(VerificationStatusValue))('round-trips %s through Prisma', (status) => {
    expect(toDomainVerificationStatus(toPrismaVerificationStatus(status))).toBe(status);
  });

  it.each(Object.values(PrismaVerificationStatus))('round-trips %s back to Prisma', (status) => {
    expect(toPrismaVerificationStatus(toDomainVerificationStatus(status))).toBe(status);
  });

  it('preserves the persisted spelling, not just the identity', () => {
    // The stored value has to stay byte-identical: existing rows were written
    // with these exact strings.
    expect(toPrismaVerificationStatus(VerificationStatusValue.UNTESTED)).toBe('UNTESTED');
    expect(toPrismaVerificationStatus(VerificationStatusValue.SUCCEEDED)).toBe('SUCCEEDED');
    expect(toPrismaVerificationStatus(VerificationStatusValue.FAILED)).toBe('FAILED');
  });
});
