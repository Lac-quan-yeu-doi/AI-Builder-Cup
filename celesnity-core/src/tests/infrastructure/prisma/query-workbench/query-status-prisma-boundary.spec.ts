import { SqlExecutionStatus as PrismaSqlExecutionStatus } from '@generated/prisma/enums';
import { QueryStatusValue } from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import {
  toDomainQueryStatus,
  toPrismaQueryStatus,
} from '@infrastructure/prisma/query-workbench/query-status.boundary';

/**
 * Guards the boundary the enum conversion made explicit. Before it, a Prisma
 * status flowed straight into the domain type as a bare string with nothing
 * checking the two vocabularies still agreed.
 */
describe('query status Prisma boundary', () => {
  it('the domain vocabulary and the Prisma enum have the same members', () => {
    expect(Object.values<string>(QueryStatusValue).sort()).toEqual(
      Object.values<string>(PrismaSqlExecutionStatus).sort(),
    );
  });

  it.each(Object.values(QueryStatusValue))('round-trips %s through Prisma', (status) => {
    expect(toDomainQueryStatus(toPrismaQueryStatus(status))).toBe(status);
  });

  it.each(Object.values(PrismaSqlExecutionStatus))('round-trips %s back to Prisma', (status) => {
    expect(toPrismaQueryStatus(toDomainQueryStatus(status))).toBe(status);
  });

  it('has no PREPARING member, unlike the execution vocabulary', () => {
    expect(Object.values<string>(QueryStatusValue)).not.toContain('PREPARING');
    expect(Object.values<string>(PrismaSqlExecutionStatus)).not.toContain('PREPARING');
  });
});
