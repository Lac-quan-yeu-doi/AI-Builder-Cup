import { PrismaAutomationWorkflowRunRepository } from '@infrastructure/prisma/automation-workflow/prisma-automation-workflow-run.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

describe('PrismaAutomationWorkflowRunRepository', () => {
  it('creates a run, finds it by id, and updates its status', async () => {
    const runs: Record<string, unknown>[] = [];
    const prismaClientFake = {
      automationWorkflowRun: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          runs.push(data);
          return { ...data };
        }),
        findUnique: jest.fn(
          async ({ where }: { where: { id: string } }) =>
            runs.find((r) => r.id === where.id) ?? null,
        ),
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const row = runs.find((r) => r.id === where.id) as Record<string, unknown>;
            Object.assign(row, data);
            return row;
          },
        ),
      },
    };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRunRepository(prismaServiceFake);

    const startedAt = new Date('2026-09-05T00:00:00.000Z');
    const run = await repository.createRun('wf-1', 'event', { bucket: 'x' }, startedAt);
    expect(run.status).toBe('running');
    expect(run.triggerPayload).toEqual({ bucket: 'x' });

    const found = await repository.findRunById(run.id);
    expect(found?.id).toBe(run.id);

    const finishedAt = new Date('2026-09-05T00:05:00.000Z');
    const finished = await repository.updateRunStatus(run.id, 'success', finishedAt);
    expect(finished.status).toBe('success');
    expect(finished.finishedAt).toEqual(finishedAt);
  });

  it('findRunById returns undefined for an unknown id', async () => {
    const prismaClientFake = { automationWorkflowRun: { findUnique: jest.fn(async () => null) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRunRepository(prismaServiceFake);

    expect(await repository.findRunById('missing-id')).toBeUndefined();
  });

  it('listRunsForWorkflow returns runs newest-first, capped at the given limit', async () => {
    const prismaClientFake = {
      automationWorkflowRun: {
        findMany: jest.fn(async () => [
          {
            id: 'run-2',
            workflowId: 'wf-1',
            triggeredBy: 'test',
            status: 'running',
            triggerPayload: { run_date: '2026-09-06' },
            startedAt: new Date('2026-09-06T07:00:00.000Z'),
            finishedAt: null,
          },
          {
            id: 'run-1',
            workflowId: 'wf-1',
            triggeredBy: 'schedule',
            status: 'success',
            triggerPayload: {},
            startedAt: new Date('2026-09-05T07:00:00.000Z'),
            finishedAt: new Date('2026-09-05T07:01:00.000Z'),
          },
        ]),
      },
    };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRunRepository(prismaServiceFake);

    const found = await repository.listRunsForWorkflow('wf-1', 5);

    expect(prismaClientFake.automationWorkflowRun.findMany).toHaveBeenCalledWith({
      where: { workflowId: 'wf-1' },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });
    expect(found.map((r) => r.id)).toEqual(['run-2', 'run-1']);
  });

  it('listRunsForWorkflow defaults the limit to 20 and returns empty for a workflow that has never run', async () => {
    const prismaClientFake = { automationWorkflowRun: { findMany: jest.fn(async () => []) } };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRunRepository(prismaServiceFake);

    const found = await repository.listRunsForWorkflow('wf-never-run');

    expect(prismaClientFake.automationWorkflowRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
    expect(found).toEqual([]);
  });

  it('creates and updates a step run, listing them back for their run', async () => {
    const stepRuns: Record<string, unknown>[] = [];
    const prismaClientFake = {
      automationWorkflowStepRun: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stepRuns.push(data);
          return { ...data };
        }),
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const row = stepRuns.find((r) => r.id === where.id) as Record<string, unknown>;
            Object.assign(row, data);
            return row;
          },
        ),
        findMany: jest.fn(async ({ where }: { where: { runId: string } }) =>
          stepRuns.filter((r) => r.runId === where.runId),
        ),
      },
    };
    const prismaServiceFake = { client: prismaClientFake } as unknown as PrismaService;
    const repository = new PrismaAutomationWorkflowRunRepository(prismaServiceFake);

    const stepRun = await repository.createStepRun('run-1', 'step-1');
    expect(stepRun.status).toBe('queued');

    const running = await repository.updateStepRun(stepRun.id, 'running', {
      agentRunId: 'agent-run-1',
    });
    expect(running.agentRunId).toBe('agent-run-1');

    const finished = await repository.updateStepRun(stepRun.id, 'success', {
      output: 'schema: 12 columns',
      finishedAt: new Date('2026-09-05T00:00:05.000Z'),
    });
    expect(finished.output).toBe('schema: 12 columns');

    const listed = await repository.listStepRunsForRun('run-1');
    expect(listed.map((r: { id: string }) => r.id)).toEqual([stepRun.id]);
    expect(listed[0]?.status).toBe('success');
  });
});
