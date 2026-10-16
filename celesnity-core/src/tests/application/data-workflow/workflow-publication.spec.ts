import { CreateWorkflowUseCase } from '@application/data-workflow/create-workflow.use-case';
import { PublishWorkflowUseCase } from '@application/data-workflow/publish-workflow.use-case';
import { UpdateWorkflowUseCase } from '@application/data-workflow/update-workflow.use-case';
import type {
  IWorkflowAccess,
  PipelineReference,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowPipelinePreparer } from '@application/data-workflow/interfaces/i-workflow-pipeline-preparer';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowScheduleRepository } from '@application/data-workflow/interfaces/i-workflow-schedule-repository';
import type { IWorkflowTriggerSchedule } from '@application/data-workflow/interfaces/i-workflow-trigger-schedule';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { WorkflowAuthoringErrorCode } from '@application/data-workflow/workflow-authoring.error';
import { parseWorkflowGraph } from '@application/data-workflow/workflow-graph-input';
import type {
  DataWorkflow,
  DataWorkflowVersion,
} from '@domain/data-workflow/models/workflow-persistence';
import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';
import { WorkflowPipelinePreparerAdapter } from '@infrastructure/data-workflow/workflow-pipeline-preparer.adapter';

const actor: WorkflowActor = { organizationId: 'organization-1', identityId: 'identity-1' };
const now = new Date('2026-09-17T07:00:00.000Z');

function graph(versionNumber = 1): WorkflowGraph {
  return {
    nodes: [
      { id: 'trigger', type: 'TRIGGER' },
      { id: 'extract', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber },
    ],
    edges: [
      {
        id: 'trigger-to-extract',
        sourceNodeId: 'trigger',
        sourcePortId: 'out',
        targetNodeId: 'extract',
        targetPortId: 'in',
      },
    ],
  };
}

class WorkflowRepositoryDouble implements IWorkflowRepository {
  public readonly workflows = new Map<string, DataWorkflow>();
  public readonly versions: DataWorkflowVersion[] = [];
  public publishResult = true;

  public find(id: string): Promise<DataWorkflow | undefined> {
    return Promise.resolve(this.workflows.get(id));
  }

  public async listByOrganization(
    organizationId: string,
    _page: number,
    _pageSize: number,
  ): Promise<{ readonly items: readonly DataWorkflow[]; readonly totalItems: number }> {
    const items = [...this.workflows.values()].filter(
      (workflow) => workflow.organizationId === organizationId,
    );
    return { items, totalItems: items.length };
  }

  public findVersion(
    workflowId: string,
    versionNumber: number,
  ): Promise<DataWorkflowVersion | undefined> {
    return Promise.resolve(
      this.versions.find(
        (version) => version.workflowId === workflowId && version.versionNumber === versionNumber,
      ),
    );
  }

  public findVersionById(id: string): Promise<DataWorkflowVersion | undefined> {
    return Promise.resolve(this.versions.find((version) => version.id === id));
  }

  public listVersions(workflowId: string, _limit: number): Promise<readonly DataWorkflowVersion[]> {
    return Promise.resolve(this.versions.filter((version) => version.workflowId === workflowId));
  }

  public async create(input: Parameters<IWorkflowRepository['create']>[0]): Promise<DataWorkflow> {
    const workflow: DataWorkflow = {
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      draft: input.draft,
      revision: 1,
      paused: input.paused,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  public async saveDraft(
    id: string,
    expectedRevision: number,
    input: Parameters<IWorkflowRepository['saveDraft']>[2],
  ): Promise<boolean> {
    const current = this.workflows.get(id);
    if (current === undefined || current.revision !== expectedRevision) return false;
    this.workflows.set(id, {
      ...current,
      name: input.name,
      draft: input.draft,
      paused: input.paused,
      revision: current.revision + 1,
      updatedAt: input.now,
    });
    return true;
  }

  public async savePaused(
    id: string,
    expectedRevision: number,
    paused: boolean,
    now: Date,
  ): Promise<boolean> {
    const current = this.workflows.get(id);
    if (current === undefined || current.revision !== expectedRevision) return false;
    this.workflows.set(id, { ...current, paused, revision: current.revision + 1, updatedAt: now });
    return true;
  }

  public async publish(
    id: string,
    expectedRevision: number,
    input: Parameters<IWorkflowRepository['publish']>[2],
  ): Promise<DataWorkflowVersion | false> {
    const current = this.workflows.get(id);
    if (!this.publishResult || current === undefined || current.revision !== expectedRevision)
      return false;
    const version: DataWorkflowVersion = {
      id: input.id,
      organizationId: current.organizationId,
      workflowId: current.id,
      versionNumber: (current.publishedVersion ?? 0) + 1,
      graph: input.graph,
      trigger: input.trigger,
      pipelineDisplayNames: input.pipelineDisplayNames,
      publishedAt: input.publishedAt,
    };
    this.versions.push(version);
    this.workflows.set(id, {
      ...current,
      revision: current.revision + 1,
      publishedVersion: version.versionNumber,
      updatedAt: input.publishedAt,
    });
    return version;
  }
}

describe('workflow authoring and publication', () => {
  let workflows: WorkflowRepositoryDouble;
  let access: jest.Mocked<IWorkflowAccess>;
  let preparer: jest.Mocked<IWorkflowPipelinePreparer>;
  let schedules: jest.Mocked<IWorkflowScheduleRepository>;
  let triggerSchedule: jest.Mocked<IWorkflowTriggerSchedule>;
  let watchSource: { validate: jest.Mock };
  let ids: { next: jest.Mock<string, []> };
  let create: CreateWorkflowUseCase;
  let update: UpdateWorkflowUseCase;
  let publish: PublishWorkflowUseCase;
  let descriptor: { describe: jest.Mock };

  beforeEach(() => {
    workflows = new WorkflowRepositoryDouble();
    access = { require: jest.fn(), requirePipeline: jest.fn() };
    preparer = { prepare: jest.fn() };
    descriptor = {
      describe: jest.fn(async (_actor: WorkflowActor, reference: PipelineReference) => ({
        name: `Name ${reference.pipelineId}`,
      })),
    };
    schedules = {
      findCurrent: jest.fn(),
      synchronizePublication: jest.fn(),
      saveState: jest.fn(),
    };
    triggerSchedule = {
      next: jest.fn((_trigger, _after) => new Date('2026-09-17T08:00:00.000Z')),
    };
    watchSource = { validate: jest.fn(async () => ({ capabilities: {}, issues: [] })) };
    let generatedId = 0;
    ids = {
      next: jest.fn(
        () => ['workflow-1', 'workflow-version-1', 'schedule-1'][generatedId++] ?? 'extra-id',
      ),
    };
    const clock = { now: (): Date => now };
    create = new CreateWorkflowUseCase(workflows, access, clock, ids);
    update = new UpdateWorkflowUseCase(workflows, access, clock);
    const unitOfWork: IUnitOfWork = { commit: async (work) => work({ record: () => undefined }) };
    publish = new PublishWorkflowUseCase(
      workflows,
      schedules,
      triggerSchedule,
      unitOfWork,
      access,
      preparer,
      clock,
      ids,
      descriptor,
      watchSource,
    );
  });

  it('validates JSON-shaped graph input before persisting a draft', async () => {
    await expect(
      create.execute(actor, { name: 'Invalid', graph: { nodes: 'nope', edges: [] } }),
    ).rejects.toMatchObject({
      code: WorkflowAuthoringErrorCode.INVALID_GRAPH,
    });
    expect(workflows.workflows.size).toBe(0);
  });

  it('does not publish a forbidden pipeline reference', async () => {
    const workflow = await create.execute(actor, { name: 'Daily', graph: graph() });
    access.requirePipeline.mockRejectedValueOnce(new Error('forbidden'));

    await expect(publish.execute(actor, workflow.id)).rejects.toThrow('forbidden');
    expect(preparer.prepare).not.toHaveBeenCalled();
    expect(workflows.versions).toHaveLength(0);
  });

  it('does not publish a missing or archived pinned pipeline version', async () => {
    const workflow = await create.execute(actor, { name: 'Daily', graph: graph() });
    access.requirePipeline.mockRejectedValueOnce(new Error('pipeline unavailable'));

    await expect(publish.execute(actor, workflow.id)).rejects.toThrow('pipeline unavailable');
    expect(preparer.prepare).not.toHaveBeenCalled();
  });

  it('returns a conflict when an edit wins the publication race', async () => {
    const workflow = await create.execute(actor, { name: 'Daily', graph: graph() });
    preparer.prepare.mockImplementationOnce(async (): Promise<void> => {
      await update.execute(actor, workflow.id, {
        revision: 1,
        name: 'Edited while compiling',
        graph: graph(),
      });
    });

    await expect(publish.execute(actor, workflow.id)).rejects.toMatchObject({
      code: WorkflowAuthoringErrorCode.REVISION_CONFLICT,
    });
    expect(workflows.versions).toHaveLength(0);
  });

  it('keeps the pinned pipeline version in the immutable publication snapshot', async () => {
    const workflow = await create.execute(actor, { name: 'Daily', graph: graph(1) });
    const published = await publish.execute(actor, workflow.id);
    await update.execute(actor, workflow.id, {
      revision: 2,
      name: 'Daily',
      graph: graph(2),
    });

    expect(published.graph.nodes.find((node) => node.type === 'PIPELINE')).toMatchObject({
      pipelineId: 'pipeline-1',
      versionNumber: 1,
    });
  });

  it('publishes an outcome graph with exact success and error source ports', async () => {
    const routed: WorkflowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER' },
        { id: 'extract', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 1 },
        { id: 'outcome', type: 'PIPELINE_OUTCOME' },
        { id: 'load-success', type: 'PIPELINE', pipelineId: 'pipeline-2', versionNumber: 1 },
        { id: 'load-error', type: 'PIPELINE', pipelineId: 'pipeline-3', versionNumber: 1 },
      ],
      edges: [
        {
          id: 'start',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'extract',
          targetPortId: 'in',
        },
        {
          id: 'inspect',
          sourceNodeId: 'extract',
          sourcePortId: 'out',
          targetNodeId: 'outcome',
          targetPortId: 'in',
        },
        {
          id: 'success',
          sourceNodeId: 'outcome',
          sourcePortId: 'success',
          targetNodeId: 'load-success',
          targetPortId: 'in',
        },
        {
          id: 'error',
          sourceNodeId: 'outcome',
          sourcePortId: 'error',
          targetNodeId: 'load-error',
          targetPortId: 'in',
        },
      ],
    };

    const workflow = await create.execute(actor, { name: 'Routed', graph: routed });
    const published = await publish.execute(actor, workflow.id);

    expect(parseWorkflowGraph(JSON.parse(JSON.stringify(published.graph)))).toEqual(routed);
    expect(
      published.graph.edges
        .filter((item) => item.sourceNodeId === 'outcome')
        .map((item) => item.sourcePortId),
    ).toEqual(['success', 'error']);
  });

  it('refuses to publish run-data branches when target-schema validation is unavailable', async () => {
    const runDataGraph: WorkflowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER' },
        { id: 'load', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 1 },
        {
          id: 'route',
          type: 'CONDITIONAL_SPLIT',
          conditionKind: 'RUN_DATA',
          mode: 'FIRST_MATCH',
          branches: [
            {
              id: 'large-order',
              runDataCondition: {
                targetNodeId: 'target-1',
                quantifier: 'ANY',
                predicate: { column: 'amount', operator: 'GTE', value: 1000 },
              },
            },
            { id: 'other', fallback: true },
          ],
        },
        { id: 'follow-up', type: 'PIPELINE', pipelineId: 'pipeline-2', versionNumber: 1 },
      ],
      edges: [
        {
          id: 'start',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'load',
          targetPortId: 'in',
        },
        {
          id: 'inspect',
          sourceNodeId: 'load',
          sourcePortId: 'out',
          targetNodeId: 'route',
          targetPortId: 'in',
        },
        {
          id: 'large-order-route',
          sourceNodeId: 'route',
          sourcePortId: 'large-order',
          targetNodeId: 'follow-up',
          targetPortId: 'in',
        },
      ],
    };
    const workflow = await create.execute(actor, { name: 'Run data', graph: runDataGraph });

    await expect(publish.execute(actor, workflow.id)).rejects.toMatchObject({
      code: WorkflowAuthoringErrorCode.INVALID_GRAPH,
      issues: [{ code: 'RUN_DATA_TARGET_VALIDATION_UNAVAILABLE' }],
    });
    expect(workflows.versions).toHaveLength(0);
  });

  it('keeps pipeline display names in the immutable published version', async () => {
    const workflow = await create.execute(actor, { name: 'Named flow', graph: graph() });
    descriptor.describe.mockResolvedValueOnce({ name: 'Orders ingest' });
    const published = await publish.execute(actor, workflow.id);
    descriptor.describe.mockResolvedValueOnce({ name: 'Orders ingest renamed' });
    expect(published.pipelineDisplayNames).toEqual({ extract: 'Orders ingest' });
    expect((await workflows.findVersionById(published.id))?.pipelineDisplayNames).toEqual({
      extract: 'Orders ingest',
    });
  });

  it('parses an existing conditional graph without changing its branch definitions', () => {
    const legacy: WorkflowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER' },
        { id: 'extract', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 1 },
        {
          id: 'gate',
          type: 'CONDITIONAL_SPLIT',
          mode: 'FIRST_MATCH',
          branches: [
            {
              id: 'accepted',
              condition: { op: 'eq', path: ['extract', 'status'], value: 'accepted' },
            },
            { id: 'otherwise', fallback: true },
          ],
        },
        { id: 'accepted-load', type: 'PIPELINE', pipelineId: 'pipeline-2', versionNumber: 1 },
      ],
      edges: [
        {
          id: 'start',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'extract',
          targetPortId: 'in',
        },
        {
          id: 'inspect',
          sourceNodeId: 'extract',
          sourcePortId: 'out',
          targetNodeId: 'gate',
          targetPortId: 'in',
        },
        {
          id: 'accepted',
          sourceNodeId: 'gate',
          sourcePortId: 'accepted',
          targetNodeId: 'accepted-load',
          targetPortId: 'in',
        },
      ],
    };

    expect(parseWorkflowGraph(JSON.parse(JSON.stringify(legacy)))).toEqual(legacy);
  });

  it('pins a validated automatic trigger configuration in the published version', async () => {
    const scheduledGraph: WorkflowGraph = {
      ...graph(),
      nodes: [
        {
          id: 'trigger',
          type: 'TRIGGER',
          config: {
            type: 'CALENDAR',
            timeOfDay: '07:00',
            weekdays: ['SUN'],
            timezone: 'Asia/Ho_Chi_Minh',
          },
        },
        { id: 'extract', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 1 },
      ],
    };
    const workflow = await create.execute(actor, { name: 'Weekly', graph: scheduledGraph });

    const published = await publish.execute(actor, workflow.id);

    expect(published.trigger).toEqual({
      triggerNodeId: 'trigger',
      config: {
        type: 'CALENDAR',
        timeOfDay: '07:00',
        weekdays: ['SUN'],
        timezone: 'Asia/Ho_Chi_Minh',
      },
    });
    expect(schedules.synchronizePublication).toHaveBeenCalledWith({
      id: expect.any(String),
      actor: actor.identityId,
      organizationId: actor.organizationId,
      workflowId: workflow.id,
      versionId: published.id,
      triggerKind: 'CALENDAR',
      nextDueAt: new Date('2026-09-17T08:00:00.000Z'),
      intervalAnchorAt: undefined,
      now,
    });
  });

  it('validates a Watch Source reference before publishing it', async () => {
    const watched: WorkflowGraph = {
      ...graph(),
      nodes: [
        {
          id: 'trigger',
          type: 'TRIGGER',
          config: {
            type: 'WATCH_SOURCE',
            mode: 'POLLING',
            databaseServiceId: 'source-1',
            everySeconds: 600,
            relations: [
              {
                schema: 'public',
                table: 'orders',
                cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
              },
            ],
          },
        },
        { id: 'extract', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 1 },
      ],
    };
    const workflow = await create.execute(actor, { name: 'Changes', graph: watched });
    watchSource.validate.mockResolvedValueOnce({
      capabilities: {},
      issues: [{ code: 'UNSUPPORTED_CHANGE_TYPE' }],
    });

    await expect(publish.execute(actor, workflow.id)).rejects.toMatchObject({
      code: WorkflowAuthoringErrorCode.INVALID_GRAPH,
    });
    expect(watchSource.validate).toHaveBeenCalledWith(
      actor,
      (watched.nodes[0] as Extract<WorkflowGraph['nodes'][number], { type: 'TRIGGER' }>).config,
    );
    expect(workflows.versions).toHaveLength(0);
  });

  it('disables an automatic schedule when a manual-only version is published', async () => {
    const workflow = await create.execute(actor, { name: 'Manual', graph: graph() });

    await publish.execute(actor, workflow.id);

    expect(schedules.synchronizePublication).toHaveBeenCalledWith({
      id: expect.any(String),
      actor: actor.identityId,
      organizationId: actor.organizationId,
      workflowId: workflow.id,
      versionId: 'workflow-version-1',
      triggerKind: undefined,
      nextDueAt: undefined,
      intervalAnchorAt: undefined,
      now,
    });
    expect(triggerSchedule.next).not.toHaveBeenCalled();
  });

  it('uses the immutable published trigger to derive an interval schedule state', async () => {
    const intervalGraph: WorkflowGraph = {
      ...graph(),
      nodes: [
        {
          id: 'trigger',
          type: 'TRIGGER',
          config: {
            type: 'INTERVAL',
            everySeconds: 60,
            anchorAt: '2026-09-17T06:00:00.000Z',
          },
        },
        { id: 'extract', type: 'PIPELINE', pipelineId: 'pipeline-1', versionNumber: 1 },
      ],
    };
    const workflow = await create.execute(actor, { name: 'Polling', graph: intervalGraph });

    const published = await publish.execute(actor, workflow.id);

    expect(schedules.synchronizePublication).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: workflow.id,
        versionId: published.id,
        triggerKind: 'INTERVAL',
        nextDueAt: new Date('2026-09-17T08:00:00.000Z'),
        intervalAnchorAt: new Date('2026-09-17T06:00:00.000Z'),
      }),
    );
  });

  it('keeps the existing pause state when an update omits it', async () => {
    const workflow = await create.execute(actor, { name: 'Daily', graph: graph(), paused: true });
    const updated = await update.execute(actor, workflow.id, {
      revision: 1,
      name: 'Daily updated',
      graph: graph(),
    });

    expect(updated.paused).toBe(true);
  });

  it('prepares each distinct authorized pinned pipeline only once', async () => {
    const workflow = await create.execute(actor, { name: 'Daily', graph: graph() });
    await publish.execute(actor, workflow.id);

    expect(access.requirePipeline).toHaveBeenCalledWith(actor, {
      pipelineId: 'pipeline-1',
      versionNumber: 1,
    } satisfies PipelineReference);
    expect(preparer.prepare).toHaveBeenCalledWith(actor, {
      pipelineId: 'pipeline-1',
      versionNumber: 1,
    } satisfies PipelineReference);
  });

  it('authorizes a pinned version before the preparer invokes compilation', async () => {
    const compilation = { compile: jest.fn() };
    const adapter = new WorkflowPipelinePreparerAdapter(access, compilation as never);
    access.requirePipeline.mockRejectedValueOnce(new Error('forbidden'));

    await expect(
      adapter.prepare(actor, { pipelineId: 'pipeline-1', versionNumber: 1 }),
    ).rejects.toThrow('forbidden');
    expect(compilation.compile).not.toHaveBeenCalled();
  });
});
