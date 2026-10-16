import { RunOwnershipResolver } from '@infrastructure/automation-workflow/run-ownership-resolver';

function prismaMock(opts: { messageBlock?: unknown; stepRun?: unknown }) {
  return {
    client: {
      messageBlock: { findFirst: jest.fn().mockResolvedValue(opts.messageBlock ?? null) },
      automationWorkflowStepRun: { findFirst: jest.fn().mockResolvedValue(opts.stepRun ?? null) },
    },
  };
}

describe('RunOwnershipResolver', () => {
  it('returns true when a message block for the run belongs to the org', async () => {
    const prisma = prismaMock({ messageBlock: { id: 'mb1' } });
    const resolver = new RunOwnershipResolver(prisma as never);
    await expect(resolver.ownsRun('run-1', 'org-1')).resolves.toBe(true);
    expect(prisma.client.messageBlock.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ runId: 'run-1', organizationId: 'org-1' }),
      }),
    );
  });

  it('returns true when a workflow step-run maps the agent run to the org', async () => {
    const prisma = prismaMock({ messageBlock: null, stepRun: { id: 'sr1' } });
    const resolver = new RunOwnershipResolver(prisma as never);
    await expect(resolver.ownsRun('run-2', 'org-1')).resolves.toBe(true);
    expect(prisma.client.automationWorkflowStepRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentRunId: 'run-2',
          run: expect.objectContaining({
            workflow: expect.objectContaining({ organizationId: 'org-1' }),
          }),
        }),
      }),
    );
  });

  it('returns false when neither source matches', async () => {
    const prisma = prismaMock({ messageBlock: null, stepRun: null });
    const resolver = new RunOwnershipResolver(prisma as never);
    await expect(resolver.ownsRun('run-x', 'org-1')).resolves.toBe(false);
  });

  it('denies a message block that exists under a different org (cross-org)', async () => {
    // findFirst returns a row ONLY when the caller's org is threaded into the
    // where-clause; a mismatching org yields null, proving org scoping applies.
    const messageBlockFindFirst = jest.fn((args: { where: { organizationId?: string } }) =>
      Promise.resolve(args.where.organizationId === 'org-1' ? { id: 'mb1' } : null),
    );
    const prisma = {
      client: {
        messageBlock: { findFirst: messageBlockFindFirst },
        automationWorkflowStepRun: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    };
    const resolver = new RunOwnershipResolver(prisma as never);

    // Same run, owning org => true.
    await expect(resolver.ownsRun('run-1', 'org-1')).resolves.toBe(true);
    // Same run, DIFFERENT org => false (no cross-org leak).
    await expect(resolver.ownsRun('run-1', 'org-2')).resolves.toBe(false);
    expect(messageBlockFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ runId: 'run-1', organizationId: 'org-2' }),
      }),
    );
  });

  it('denies a workflow step-run whose workflow belongs to a different org (cross-org)', async () => {
    // Step-run findFirst returns a row ONLY when the nested workflow org matches
    // the caller's org, proving the caller org is threaded through the relation filter.
    const stepRunFindFirst = jest.fn(
      (args: { where: { run?: { workflow?: { organizationId?: string } } } }) =>
        Promise.resolve(
          args.where.run?.workflow?.organizationId === 'org-1' ? { id: 'sr1' } : null,
        ),
    );
    const prisma = {
      client: {
        messageBlock: { findFirst: jest.fn().mockResolvedValue(null) },
        automationWorkflowStepRun: { findFirst: stepRunFindFirst },
      },
    };
    const resolver = new RunOwnershipResolver(prisma as never);

    // Same agent run, owning org => true.
    await expect(resolver.ownsRun('run-2', 'org-1')).resolves.toBe(true);
    // Same agent run, DIFFERENT org => false (no cross-org leak).
    await expect(resolver.ownsRun('run-2', 'org-2')).resolves.toBe(false);
    expect(stepRunFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentRunId: 'run-2',
          run: expect.objectContaining({
            workflow: expect.objectContaining({ organizationId: 'org-2' }),
          }),
        }),
      }),
    );
  });
});
