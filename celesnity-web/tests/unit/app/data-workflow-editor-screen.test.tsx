// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('next/dynamic', () => ({
  default: () =>
    function WorkflowFlowCanvasMock({
      graph,
      onConnect,
      onSelectNode,
      onSelectEdge,
    }: {
      readonly graph: {
        readonly nodes: readonly { readonly id: string }[];
        readonly edges: readonly { readonly id: string }[];
      };
      readonly onConnect: (connection: {
        readonly source: string;
        readonly sourceHandle: string;
        readonly target: string;
        readonly targetHandle: string;
      }) => void;
      readonly onSelectNode: (nodeId: string) => void;
      readonly onSelectEdge: (edgeId: string) => void;
    }) {
      return (
        <div aria-label="Workflow flow canvas">
          {graph.nodes.map((node) => (
            <button key={node.id} onClick={() => onSelectNode(node.id)}>
              Select node {node.id}
            </button>
          ))}
          {graph.edges.map((edge) => (
            <button key={edge.id} onClick={() => onSelectEdge(edge.id)}>
              Select edge {edge.id}
            </button>
          ))}
          {graph.nodes.some((node) => node.id.startsWith('pipeline_outcome-')) ? (
            <button
              onClick={() =>
                onConnect({
                  source: graph.nodes.find((node) => node.id.startsWith('pipeline_outcome-'))!.id,
                  sourceHandle: 'error',
                  target: 'trigger',
                  targetHandle: 'in',
                })
              }
            >
              Try invalid Outcome connection
            </button>
          ) : null}
        </div>
      );
    },
}));

import { DataWorkflowEditorScreen } from '@/app/(workspace)/data-workflows/_components/data-workflow-editor-screen';
import { renderUi } from '@/tests/support/render-ui';
import type { DataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';
import type { ListPipelinesController } from '@/src/interface-adapters/controllers/pipelines/list-pipelines.controller';

const listPipelines = vi.fn(async () => ({
  items: [
    {
      id: 'pipeline-orders',
      name: 'Normalize orders',
      status: 'DRAFT' as const,
      version: 7,
      databaseName: 'sales',
      sourceConnectionIds: [],
      createdBy: 'Owner',
      updatedAt: '2026-09-18T00:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 100,
  totalItems: 1,
  totalPages: 1,
})) satisfies ListPipelinesController;

describe('DataWorkflowEditorScreen', () => {
  afterEach(cleanup);

  it('offers keyboard node and edge alternatives, then creates through the controller', async () => {
    const controller = {
      list: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
      create: vi.fn().mockImplementation(async ({ draft }) => ({
        id: 'workflow-1',
        draft,
        revision: 1,
        paused: false,
        triggerKind: 'MANUAL',
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z',
      })),
    } satisfies DataWorkflowController;

    renderUi(createElement(DataWorkflowEditorScreen, { controller, listPipelines }));

    expect(screen.getByRole('option', { name: 'Watch source' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Pipeline job/i }));
    const pipelinePicker = await screen.findByRole('combobox', { name: 'Pipeline' });
    expect(screen.queryByLabelText('Pipeline ID')).toBeNull();
    fireEvent.click(pipelinePicker);
    fireEvent.click(await screen.findByText('Normalize orders · v7 · sales'));
    expect(screen.queryByRole('button', { name: 'Connect selected nodes' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Connection tools' }));
    expect(screen.getAllByRole('option', { name: 'Normalize orders' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Connect selected nodes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(controller.create).toHaveBeenCalledTimes(1));
    expect(controller.create).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          graph: expect.objectContaining({
            nodes: expect.arrayContaining([
              expect.objectContaining({
                type: 'PIPELINE',
                pipelineId: 'pipeline-orders',
                versionNumber: 7,
              }),
            ]),
            edges: expect.arrayContaining([expect.objectContaining({ sourceNodeId: 'trigger' })]),
          }),
        }),
      }),
    );
  });

  it('refreshes the draft revision after publishing before a subsequent save', async () => {
    const workflow = {
      id: 'workflow-1',
      draft: {
        name: 'Daily import',
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER' as const,
              trigger: { type: 'MANUAL' as const },
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
        },
      },
      revision: 1,
      paused: false,
      triggerKind: 'MANUAL' as const,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const controller = {
      list: vi.fn(),
      get: vi
        .fn()
        .mockResolvedValueOnce(workflow)
        .mockResolvedValueOnce({ ...workflow, revision: 2 }),
      create: vi.fn(),
      save: vi.fn().mockResolvedValue({ ...workflow, revision: 3 }),
      publish: vi.fn().mockResolvedValue({
        workflowId: workflow.id,
        versionNumber: 1,
        publishedAt: '2026-09-18T00:00:00.000Z',
      }),
      previewSchedule: vi.fn(),
    } satisfies DataWorkflowController;

    renderUi(
      createElement(DataWorkflowEditorScreen, {
        controller,
        listPipelines,
        workflowId: workflow.id,
      }),
    );

    await screen.findByRole('button', { name: 'Publish' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(controller.get).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(controller.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: workflow.id, expectedRevision: 2 }),
      ),
    );
  });

  it('keeps activity out of the editor and saves an unsaved draft', async () => {
    const workflow = {
      id: 'workflow-1',
      draft: {
        name: 'Daily import',
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER' as const,
              trigger: {
                type: 'CALENDAR' as const,
                timeOfDay: '07:00',
                weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
                timezone: 'UTC',
              },
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
        },
      },
      revision: 1,
      paused: false,
      triggerKind: 'CALENDAR' as const,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const controller = {
      list: vi.fn(),
      get: vi.fn().mockResolvedValue(workflow),
      create: vi.fn(),
      save: vi.fn().mockImplementation(async (input) => ({ ...workflow, ...input, revision: 3 })),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
      getSchedule: vi.fn().mockResolvedValue({
        kind: 'CALENDAR',
        lifecycle: 'ENABLED',
        enabled: true,
        paused: false,
        nextDueAt: '2026-09-19T07:00:00.000Z',
        occurrenceCoverage: { coalescedCount: 0 },
      }),
      setPaused: vi.fn().mockResolvedValue({ ...workflow, paused: true, revision: 2 }),
      listVersions: vi.fn().mockResolvedValue([]),
      listRuns: vi.fn().mockResolvedValue([]),
      startRun: vi.fn(),
      retryNode: vi.fn(),
    } satisfies DataWorkflowController;

    renderUi(
      createElement(DataWorkflowEditorScreen, {
        controller,
        listPipelines,
        workflowId: workflow.id,
      }),
    );

    const name = await screen.findByLabelText('Workflow name');
    fireEvent.change(name, { target: { value: 'Unsaved import' } });
    expect(screen.queryByText('Immutable versions')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Activity' })).toBeNull();
    expect((screen.getByLabelText('Workflow name') as HTMLInputElement).value).toBe(
      'Unsaved import',
    );
    expect(
      screen.getAllByRole('status').some((element) => element.textContent === 'Unsaved changes'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(controller.save).toHaveBeenCalledWith({
        id: workflow.id,
        expectedRevision: 1,
        draft: expect.objectContaining({ name: 'Unsaved import' }),
      }),
    );
  });

  it('keeps legacy routes visible and converts their node to Pipeline run data', async () => {
    const workflow = {
      id: 'workflow-1',
      draft: {
        name: 'Conditional import',
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER' as const,
              trigger: { type: 'MANUAL' as const },
              position: { x: 0, y: 0 },
            },
            {
              id: 'source',
              type: 'PIPELINE' as const,
              pipelineId: 'pipeline-source',
              versionNumber: 1,
              position: { x: 150, y: 0 },
            },
            {
              id: 'gate',
              type: 'CONDITIONAL_SPLIT' as const,
              mode: 'FIRST_MATCH' as const,
              branches: [
                {
                  id: 'approved',
                  condition: { op: 'eq' as const, path: ['trigger', 'ok'], value: true },
                },
                { id: 'fallback', fallback: true as const },
              ],
              position: { x: 300, y: 0 },
            },
            {
              id: 'pipeline',
              type: 'PIPELINE' as const,
              pipelineId: 'pipeline-1',
              versionNumber: 1,
              position: { x: 500, y: 0 },
            },
          ],
          edges: [
            {
              id: 'trigger-source',
              sourceNodeId: 'trigger',
              sourcePortId: 'out',
              targetNodeId: 'source',
              targetPortId: 'in',
            },
            {
              id: 'source-gate',
              sourceNodeId: 'source',
              sourcePortId: 'out',
              targetNodeId: 'gate',
              targetPortId: 'in',
            },
            {
              id: 'gate-approved',
              sourceNodeId: 'gate',
              sourcePortId: 'approved',
              targetNodeId: 'pipeline',
              targetPortId: 'in',
            },
          ],
        },
      },
      revision: 1,
      paused: false,
      triggerKind: 'MANUAL' as const,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const controller = {
      list: vi.fn(),
      get: vi.fn().mockResolvedValue(workflow),
      create: vi.fn(),
      save: vi
        .fn()
        .mockImplementation(async (input) => ({ ...workflow, draft: input.draft, revision: 2 })),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
      listPipelineTargets: vi.fn().mockResolvedValue([]),
    } satisfies DataWorkflowController;

    renderUi(
      createElement(DataWorkflowEditorScreen, {
        controller,
        listPipelines,
        workflowId: workflow.id,
      }),
    );

    await screen.findByRole('button', { name: 'Connection tools' });
    fireEvent.click(screen.getByRole('button', { name: 'Connection tools' }));
    await screen.findByLabelText('From node');
    fireEvent.change(screen.getByLabelText('From node'), { target: { value: 'gate' } });
    expect(screen.getByRole('option', { name: /Condition 1 · trigger\.ok is true/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /fallback/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('From branch'), { target: { value: 'fallback' } });
    fireEvent.change(screen.getByLabelText('To node'), { target: { value: 'pipeline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect selected nodes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(controller.save).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({
            graph: expect.objectContaining({
              edges: expect.arrayContaining([
                expect.objectContaining({ sourceNodeId: 'gate', sourcePortId: 'fallback' }),
              ]),
            }),
          }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select node gate' }));
    expect(screen.queryByLabelText('Condition source')).toBeNull();
    expect(screen.getByText(/created by an older release/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Pipeline run data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(controller.save).toHaveBeenCalledTimes(2));
    const savedGraph = controller.save.mock.calls[1]?.[0].draft.graph;
    expect(savedGraph.nodes.find((node: { id: string }) => node.id === 'gate')).toMatchObject({
      conditionKind: 'RUN_DATA',
      branches: [{ id: 'fallback', fallback: true }],
    });
    expect(savedGraph.edges.map((edge: { id: string }) => edge.id)).not.toContain('gate-approved');
  });

  it('offers Outcome routes without another pipeline picker', async () => {
    const controller = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
    } satisfies DataWorkflowController;
    renderUi(createElement(DataWorkflowEditorScreen, { controller, listPipelines }));
    fireEvent.click(screen.getByRole('button', { name: 'Pipeline outcome' }));
    expect(screen.getByText(/Error runs if any selected incoming pipeline failed/i)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Pipeline' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pipeline job' }));
    fireEvent.click(screen.getByRole('button', { name: 'Parallel split' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connection tools' }));
    const outcome = screen.getAllByRole('option', {
      name: /Pipeline outcome/i,
    })[0] as HTMLOptionElement;
    fireEvent.change(screen.getByLabelText('From node'), { target: { value: outcome.value } });
    expect(screen.getByRole('option', { name: 'Success' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Error' })).toBeTruthy();

    const targets = screen.getByLabelText('To node') as HTMLSelectElement;
    const selectableTargets = [...targets.options].filter((option) => option.value !== '');
    expect(selectableTargets).toHaveLength(1);
    expect(selectableTargets[0]?.textContent).toMatch(/Unavailable pipeline/i);

    fireEvent.click(screen.getByRole('button', { name: 'Try invalid Outcome connection' }));
    expect(
      await screen.findByText('Pipeline Outcome routes must connect to a pipeline job.'),
    ).toBeTruthy();
  });

  it('creates Conditional split in pipeline run data mode without a context selector', async () => {
    const controller = {
      list: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
      create: vi.fn(),
    } satisfies DataWorkflowController;

    renderUi(createElement(DataWorkflowEditorScreen, { controller, listPipelines }));

    fireEvent.click(screen.getByRole('button', { name: 'Conditional split' }));
    expect(screen.queryByLabelText('Condition source')).toBeNull();
    expect(
      screen.getByText(/checks only rows written by the directly connected pipeline run/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/needs exactly one directly incoming pipeline connection/i),
    ).toBeTruthy();
  });

  it('edits and serializes run-data conditions from the directly incoming pinned pipeline', async () => {
    const workflow = {
      id: 'workflow-run-data',
      draft: {
        name: 'Route rejected orders',
        graph: {
          nodes: [
            {
              id: 'load',
              type: 'PIPELINE' as const,
              pipelineId: 'pipeline-orders',
              versionNumber: 7,
              position: { x: 0, y: 0 },
            },
            {
              id: 'split',
              type: 'CONDITIONAL_SPLIT' as const,
              conditionKind: 'RUN_DATA' as const,
              mode: 'FIRST_MATCH' as const,
              position: { x: 300, y: 0 },
              branches: [{ id: 'fallback', fallback: true as const }],
            },
          ],
          edges: [
            {
              id: 'load-split',
              sourceNodeId: 'load',
              sourcePortId: 'out',
              targetNodeId: 'split',
              targetPortId: 'in',
            },
          ],
        },
      },
      revision: 1,
      paused: false,
      triggerKind: 'MANUAL' as const,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const controller = {
      list: vi.fn(),
      get: vi.fn().mockResolvedValue(workflow),
      create: vi.fn(),
      save: vi
        .fn()
        .mockImplementation(async (input) => ({ ...workflow, draft: input.draft, revision: 2 })),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
      listPipelineTargets: vi.fn().mockResolvedValue([
        {
          targetNodeId: 'target-orders',
          tableName: 'analytics.orders',
          schemaStatus: 'KNOWN' as const,
          columns: [{ id: 'status', name: 'status', type: 'string', nullable: false }],
        },
      ]),
    } satisfies DataWorkflowController;
    renderUi(
      createElement(DataWorkflowEditorScreen, {
        controller,
        listPipelines,
        workflowId: workflow.id,
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Select node split' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add run-data branch' }));
    expect(await screen.findByLabelText('Target table')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Rows matching'), { target: { value: 'COUNT' } });
    expect(screen.getByRole('option', { name: 'At least' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'More than' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Exactly' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Fewer than' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'rejected' } });
    fireEvent.change(screen.getByLabelText('Count threshold'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add run-data branch' }));
    fireEvent.change(screen.getAllByLabelText('Value')[1]!, { target: { value: 'pending' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const expectedSave = expect.objectContaining({
      draft: expect.objectContaining({
        graph: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              conditionKind: 'RUN_DATA',
              branches: expect.arrayContaining([
                expect.objectContaining({
                  runDataCondition: expect.objectContaining({
                    targetNodeId: 'target-orders',
                    quantifier: 'COUNT',
                    count: { operator: 'GTE', threshold: 3 },
                  }),
                }),
              ]),
            }),
          ]),
        }),
      }),
    });
    await waitFor(() => expect(controller.save).toHaveBeenCalledWith(expectedSave));
    const savedSplit = controller.save.mock.calls[0]?.[0].draft.graph.nodes.find(
      (node: { readonly id: string }) => node.id === 'split',
    );
    const runDataBranchIds = savedSplit.branches
      .filter((branch: { readonly fallback?: boolean }) => !branch.fallback)
      .map((branch: { readonly id: string }) => branch.id);
    expect(runDataBranchIds).toHaveLength(2);
    expect(new Set(runDataBranchIds).size).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove condition 1 and its connections' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(controller.save).toHaveBeenCalledTimes(2));
    const remainingSplit = controller.save.mock.calls[1]?.[0].draft.graph.nodes.find(
      (node: { readonly id: string }) => node.id === 'split',
    );
    expect(
      remainingSplit.branches.filter((branch: { readonly fallback?: boolean }) => !branch.fallback),
    ).toHaveLength(1);
  });

  it('shows a recoverable pipeline picker error instead of staying in loading state', async () => {
    const controller = {
      list: vi.fn(),
      get: vi.fn(),
      save: vi.fn(),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
      create: vi.fn(),
    } satisfies DataWorkflowController;
    const failingList = vi.fn().mockRejectedValue(new Error('Pipeline service unavailable'));

    renderUi(createElement(DataWorkflowEditorScreen, { controller, listPipelines: failingList }));
    fireEvent.click(screen.getByRole('button', { name: 'Pipeline job' }));

    expect(await screen.findByText('Pipeline service unavailable')).toBeTruthy();
    const pipeline = screen.getByRole('combobox', { name: 'Pipeline' }) as HTMLButtonElement;
    expect(pipeline.disabled).toBe(false);
    expect(pipeline.textContent).toContain('Choose a pipeline');
  });

  it('removes selected connections and nodes from the saved draft', async () => {
    const workflow = {
      id: 'workflow-1',
      draft: {
        name: 'Removable graph',
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER' as const,
              trigger: { type: 'MANUAL' as const },
              position: { x: 0, y: 0 },
            },
            {
              id: 'pipeline-1',
              type: 'PIPELINE' as const,
              pipelineId: 'pipeline-orders',
              versionNumber: 7,
              position: { x: 300, y: 0 },
            },
          ],
          edges: [
            {
              id: 'edge-1',
              sourceNodeId: 'trigger',
              sourcePortId: 'out',
              targetNodeId: 'pipeline-1',
              targetPortId: 'in',
            },
          ],
        },
      },
      revision: 1,
      paused: false,
      triggerKind: 'MANUAL' as const,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const controller = {
      list: vi.fn(),
      get: vi.fn().mockResolvedValue(workflow),
      create: vi.fn(),
      save: vi
        .fn()
        .mockImplementation(async (input) => ({ ...workflow, draft: input.draft, revision: 2 })),
      publish: vi.fn(),
      previewSchedule: vi.fn(),
    } satisfies DataWorkflowController;

    renderUi(
      createElement(DataWorkflowEditorScreen, {
        controller,
        listPipelines,
        workflowId: workflow.id,
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Select edge edge-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete connection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select node pipeline-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete node' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(controller.save).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({
            graph: {
              nodes: [expect.objectContaining({ id: 'trigger' })],
              edges: [],
            },
          }),
        }),
      ),
    );
  });
});
