import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { PrismaWorkflowRunClaimStore } from '@infrastructure/prisma/data-workflow/prisma-workflow-run-claim.store';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-09-17T11:00:00.000Z');

describe('PrismaWorkflowRunClaimStore', () => {
  it('claims a bounded candidate with SKIP LOCKED and persists a fresh fencing lease', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValue([{ id: RUN_ID, organization_id: ORGANIZATION_ID, revision: 3 }]);
    const executeRaw = jest.fn().mockResolvedValue(1);
    const store = new PrismaWorkflowRunClaimStore(
      { client: { $queryRaw: queryRaw, $executeRaw: executeRaw } } as never,
      immediateUnitOfWork(),
    );

    const claimed = await store.claimDue({
      limit: 2,
      owner: 'worker-a',
      now,
      leaseMs: 30_000,
      reconciliationMs: 5_000,
    });

    expect(claimed).toEqual([
      expect.objectContaining({ runId: RUN_ID, organizationId: ORGANIZATION_ID }),
    ]);
    const query = queryRaw.mock.calls[0]?.[0] as { readonly strings: readonly string[] };
    expect(query.strings.join(' ')).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.strings.join(' ')).not.toContain('organization_id =');
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const statement = executeRaw.mock.calls[0]?.[0] as { readonly strings: readonly string[] };
    expect(statement.strings.join(' ')).toContain('next_reconciliation_at');
    expect(statement.strings.join(' ')).toContain('revision = revision + 1');
  });

  it('does not issue a claim for invalid capacity or lease configuration', async () => {
    const queryRaw = jest.fn();
    const store = new PrismaWorkflowRunClaimStore(
      { client: { $queryRaw: queryRaw } } as never,
      immediateUnitOfWork(),
    );

    await expect(
      store.claimDue({
        limit: 0,
        owner: 'worker-a',
        now,
        leaseMs: 30_000,
        reconciliationMs: 5_000,
      }),
    ).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

function immediateUnitOfWork(): IUnitOfWork {
  return { commit: async (work) => work({ record: jest.fn() }) };
}
