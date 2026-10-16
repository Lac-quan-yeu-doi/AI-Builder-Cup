import { backgroundContexts } from '@tests/application/administration/background-principal.fixture';
import { WorkflowScheduleWorkerService } from '@application/data-workflow/workflow-schedule-worker.service';
import type { IWorkflowScheduleClaimStore } from '@application/data-workflow/interfaces/i-workflow-schedule-claim-store';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';

const now = new Date('2026-09-18T10:00:00.000Z');
const claim = {
  scheduleId: 'schedule-1',
  organizationId: 'org-1',
  workflowId: 'workflow-1',
  versionId: 'version-1',
  actor: 'identity-1',
  triggerKind: 'INTERVAL' as const,
  nextDueAt: new Date('2026-09-18T09:59:00.000Z'),
  intervalAnchorAt: new Date('2026-09-18T09:00:00.000Z'),
  coalescedCount: 0,
  revision: 2,
  leaseToken: 'lease-1',
};
const graph: WorkflowGraph = {
  nodes: [
    {
      id: 'trigger',
      type: 'TRIGGER' as const,
      config: { type: 'INTERVAL' as const, everySeconds: 60, anchorAt: '2026-09-18T09:00:00.000Z' },
    },
    { id: 'job', type: 'PIPELINE' as const, pipelineId: 'pipeline-1', versionNumber: 1 },
  ],
  edges: [
    {
      id: 'edge',
      sourceNodeId: 'trigger',
      sourcePortId: 'out',
      targetNodeId: 'job',
      targetPortId: 'in',
    },
  ],
};

const calendarGraph: WorkflowGraph = {
  ...graph,
  nodes: [
    {
      id: 'trigger',
      type: 'TRIGGER' as const,
      config: {
        type: 'CALENDAR' as const,
        timeOfDay: '07:00',
        weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        timezone: 'UTC',
      },
    },
    { id: 'job', type: 'PIPELINE' as const, pipelineId: 'pipeline-1', versionNumber: 1 },
  ],
};

describe('WorkflowScheduleWorkerService', () => {
  it('creates one version-pinned scheduled run and clears coalescing only after it persists', async () => {
    const claims = { claimDue: jest.fn(async () => [claim]), complete: jest.fn(async () => true) };
    const createRun = jest.fn(async () => ({ id: 'run-1' }));
    const service = subject({ claims, createRun });
    await expect(service.tick()).resolves.toBe(1);
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: 'version-1',
        actor: 'identity-1',
        triggerContext: expect.objectContaining({ type: 'SCHEDULE', scheduleId: 'schedule-1' }),
      }),
    );
    expect(claims.complete).toHaveBeenCalledWith(expect.objectContaining({ coalescedCount: 0 }));
  });
  it('coalesces a due occurrence while a run is active and does not create another run', async () => {
    const claims = { claimDue: jest.fn(async () => [claim]), complete: jest.fn(async () => true) };
    const createRun = jest.fn();
    const service = subject({ claims, createRun, active: { id: 'active' } });
    await service.tick();
    expect(createRun).not.toHaveBeenCalled();
    expect(claims.complete).toHaveBeenCalledWith(
      expect.objectContaining({ coalescedCount: 2, coalescedFromAt: claim.nextDueAt }),
    );
  });
  it('advances paused schedules without blocking a manual run path', async () => {
    const claims = { claimDue: jest.fn(async () => [claim]), complete: jest.fn(async () => true) };
    const createRun = jest.fn();
    const service = subject({ claims, createRun, paused: true });
    await service.tick();
    expect(createRun).not.toHaveBeenCalled();
    expect(claims.complete).toHaveBeenCalledWith(expect.objectContaining({ coalescedCount: 0 }));
  });
  it('runs a calendar occurrence when the worker is late within its UTC minute', async () => {
    const calendarClaim = { ...claim, triggerKind: 'CALENDAR' as const, nextDueAt: now };
    const claims = {
      claimDue: jest.fn(async () => [calendarClaim]),
      complete: jest.fn(async () => true),
    };
    const createRun = jest.fn(async () => ({ id: 'run-1' }));
    const service = subject({ claims, createRun, graph: calendarGraph });

    await service.tick();

    expect(createRun).toHaveBeenCalledTimes(1);
  });
  it('skips a calendar occurrence from a previous UTC minute after downtime', async () => {
    const calendarClaim = {
      ...claim,
      triggerKind: 'CALENDAR' as const,
      nextDueAt: new Date('2026-09-18T09:59:00.000Z'),
    };
    const claims = {
      claimDue: jest.fn(async () => [calendarClaim]),
      complete: jest.fn(async () => true),
    };
    const createRun = jest.fn();
    const service = subject({ claims, createRun, graph: calendarGraph });

    await service.tick();

    expect(createRun).not.toHaveBeenCalled();
    expect(claims.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        claim: calendarClaim,
        nextDueAt: new Date('2026-09-18T10:01:00.000Z'),
        coalescedCount: 0,
      }),
    );
  });
});

function subject({
  claims,
  createRun,
  active,
  paused = false,
  graph: workflowGraph = graph,
}: {
  claims: IWorkflowScheduleClaimStore;
  createRun: jest.Mock;
  active?: unknown;
  paused?: boolean;
  graph?: WorkflowGraph;
}) {
  return new WorkflowScheduleWorkerService(
    claims,
    {
      find: jest.fn(async () => ({ id: 'workflow-1', organizationId: 'org-1', paused })),
      findVersionById: jest.fn(async () => ({
        id: 'version-1',
        organizationId: 'org-1',
        workflowId: 'workflow-1',
        graph: workflowGraph,
      })),
    } as never,
    { findActive: jest.fn(async () => active), createRun } as never,
    { require: jest.fn(async () => undefined), requirePipeline: jest.fn(async () => undefined) },
    { next: jest.fn(() => new Date('2026-09-18T10:01:00.000Z')) },
    backgroundContexts(),
    { commit: (work) => work({ record: jest.fn() }) } satisfies IUnitOfWork,
    { now: () => now },
    { next: () => 'run-1' },
    { batchSize: 2, leaseMs: 30_000 },
    'worker-a',
  );
}
