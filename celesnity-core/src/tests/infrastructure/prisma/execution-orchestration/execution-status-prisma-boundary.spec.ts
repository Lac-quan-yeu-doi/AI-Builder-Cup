import { ExecutionStatus as PrismaExecutionStatus } from '@generated/prisma/enums';
import { ExecutionStatusValue } from '@domain/execution-orchestration/value-objects/execution-value-objects';
import {
  toDomainExecutionStatus,
  toPrismaExecutionStatus,
} from '@infrastructure/prisma/execution-orchestration/execution-status.boundary';

/**
 * Guards the boundary the enum conversion made explicit. Before it, a Prisma
 * status flowed straight into the domain type as a bare string with nothing
 * checking the two vocabularies still agreed.
 */
describe('execution status Prisma boundary', () => {
  it('the domain vocabulary and the Prisma enum have the same members', () => {
    expect(Object.values<string>(ExecutionStatusValue).sort()).toEqual(
      Object.values<string>(PrismaExecutionStatus).sort(),
    );
  });

  it.each(Object.values(ExecutionStatusValue))('round-trips %s through Prisma', (status) => {
    expect(toDomainExecutionStatus(toPrismaExecutionStatus(status))).toBe(status);
  });

  it.each(Object.values(PrismaExecutionStatus))('round-trips %s back to Prisma', (status) => {
    expect(toPrismaExecutionStatus(toDomainExecutionStatus(status))).toBe(status);
  });

  it('keeps PREPARING, which the query vocabulary does not have', () => {
    expect(toPrismaExecutionStatus(ExecutionStatusValue.PREPARING)).toBe('PREPARING');
  });
});
