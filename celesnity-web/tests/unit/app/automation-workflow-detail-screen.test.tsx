// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';
import type { AutomationWorkflowViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';

const { capturedPanelProps } = vi.hoisted(() => ({
  capturedPanelProps: { current: null as null | Record<string, unknown> },
}));

vi.mock(
  '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-chat-panel',
  () => ({
    AutomationWorkflowChatPanel: (props: Record<string, unknown>) => {
      capturedPanelProps.current = props;
      return null;
    },
  }),
);

import { AutomationWorkflowDetailScreen } from '@/app/(workspace)/automations/[workflowId]/_components/automation-workflow-detail-screen';

function workflow(
  overrides: Partial<AutomationWorkflowViewModel> = {},
): AutomationWorkflowViewModel {
  return {
    id: 'wf-1',
    name: 'Ingest to Slack',
    status: 'draft',
    triggerType: 'EVENT',
    eventTopic: 'celesnity.ingest.file.created.v1',
    createdAt: '2026-09-05T00:00:00.000Z',
    triggerFields: [],
    steps: [],
    ...overrides,
  };
}

function fakeController(
  overrides: Partial<AutomationWorkflowController> = {},
): AutomationWorkflowController {
  return {
    list: vi.fn(),
    get: vi.fn().mockResolvedValue(workflow()),
    create: vi.fn(),
    update: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    addStep: vi.fn(),
    removeStep: vi.fn(),
    updateStep: vi.fn(),
    testFire: vi.fn(),
    getRunStatus: vi.fn(),
    listRuns: vi.fn().mockResolvedValue([]),
    retryRun: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  capturedPanelProps.current = null;
});

/** The two run-file callbacks the screen now requires; default to no-ops. */
function fileProps(
  overrides: {
    listRunFiles?: (runId: string) => Promise<readonly unknown[]>;
    getRunFileContent?: (runId: string, path: string) => Promise<unknown>;
  } = {},
) {
  return {
    listRunFiles: overrides.listRunFiles ?? vi.fn().mockResolvedValue([]),
    getRunFileContent: overrides.getRunFileContent ?? vi.fn(),
  } as unknown as {
    listRunFiles: (runId: string) => Promise<readonly never[]>;
    getRunFileContent: (runId: string, path: string) => Promise<never>;
  };
}

describe('AutomationWorkflowDetailScreen — chat panel wiring', () => {
  it('renders the chat panel and refreshes the workflow when it reports a change', async () => {
    const get = vi.fn().mockResolvedValue(workflow());
    const controller = fakeController({ get });

    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    await screen.findByText('Ingest to Slack');
    await waitFor(() => expect(capturedPanelProps.current).not.toBeNull());
    expect(capturedPanelProps.current).toMatchObject({
      workflowId: 'wf-1',
      workflowName: 'Ingest to Slack',
    });

    get.mockClear();
    const onWorkflowChanged = capturedPanelProps.current?.onWorkflowChanged as () => void;
    act(() => {
      onWorkflowChanged();
    });

    await waitFor(() => expect(get).toHaveBeenCalledWith('wf-1'));
  });

  it('polls the workflow on an interval so agent MCP edits appear live without a run-finished event', async () => {
    // A step the agent adds mid-conversation via MCP lands in the DB, but the
    // screen only re-fetches on mount / run-finished — so it must poll to stay live.
    const first = workflow({ steps: [] });
    const withStep = workflow({
      steps: [
        {
          id: 'step-1',
          order: 0,
          agentId: 'chat-assistant',
          inputTemplate: { message: 'inspect $.trigger.run_date' },
        },
      ],
    });
    const get = vi
      .fn()
      .mockResolvedValueOnce(first) // initial mount
      .mockResolvedValue(withStep); // subsequent polls see the agent's edit
    const controller = fakeController({ get });

    vi.useFakeTimers();
    try {
      render(
        createElement(AutomationWorkflowDetailScreen, {
          controller,
          workflowId: 'wf-1',
          ...fileProps(),
        }),
      );
      await act(async () => {
        await Promise.resolve();
      });
      const callsAfterMount = get.mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(get.mock.calls.length).toBeGreaterThan(callsAfterMount);
    } finally {
      vi.useRealTimers();
    }
  });
});

function workflowWithSteps(): AutomationWorkflowViewModel {
  return workflow({
    steps: [
      {
        id: 'step-1',
        order: 0,
        agentId: 'schema-extractor',
        inputTemplate: { message: '$.trigger.bucket' },
      },
    ],
  });
}

describe('AutomationWorkflowDetailScreen — step selection and editing', () => {
  it('adds a step via controller.addStep using the existing agent, then reloads', async () => {
    const get = vi.fn().mockResolvedValue(workflowWithSteps());
    const addStep = vi.fn().mockResolvedValue({
      id: 'step-2',
      order: 1,
      agentId: 'schema-extractor',
      inputTemplate: { message: '' },
    });
    const controller = fakeController({ get, addStep });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    await screen.findByText('schema-extractor');
    get.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    await waitFor(() =>
      expect(addStep).toHaveBeenCalledWith('wf-1', {
        agentId: 'schema-extractor',
        inputTemplate: { message: '' },
      }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledWith('wf-1'));
  });

  it('adds a step defaulting to chat-assistant when the workflow has no steps yet', async () => {
    const get = vi.fn().mockResolvedValue(workflow({ steps: [] }));
    const addStep = vi.fn().mockResolvedValue({
      id: 'step-1',
      order: 0,
      agentId: 'chat-assistant',
      inputTemplate: { message: '' },
    });
    const controller = fakeController({ get, addStep });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    await screen.findByText('Ingest to Slack');
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    await waitFor(() =>
      expect(addStep).toHaveBeenCalledWith('wf-1', {
        agentId: 'chat-assistant',
        inputTemplate: { message: '' },
      }),
    );
  });

  it('selecting a step in the chain shows it in the Step tab', async () => {
    const controller = fakeController({ get: vi.fn().mockResolvedValue(workflowWithSteps()) });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    await screen.findByText('schema-extractor');
    fireEvent.click(screen.getByText('schema-extractor'));

    expect(await screen.findByDisplayValue('schema-extractor')).toBeTruthy();
  });

  it('saving a step in the inspector calls controller.updateStep and reloads the workflow', async () => {
    const get = vi.fn().mockResolvedValue(workflowWithSteps());
    const updateStep = vi.fn().mockResolvedValue({
      id: 'step-1',
      order: 0,
      agentId: 'summarizer',
      inputTemplate: { message: '$.trigger.bucket' },
    });
    const controller = fakeController({ get, updateStep });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    await screen.findByText('schema-extractor');
    fireEvent.click(screen.getByText('schema-extractor'));
    await screen.findByDisplayValue('schema-extractor');

    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'summarizer' } });
    get.mockClear();
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      expect(updateStep).toHaveBeenCalledWith('wf-1', 'step-1', {
        agentId: 'summarizer',
        inputTemplate: { message: '$.trigger.bucket' },
      }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledWith('wf-1'));
  });

  it('removing the selected step calls controller.removeStep and clears the selection', async () => {
    const get = vi.fn().mockResolvedValue(workflowWithSteps());
    const removeStep = vi.fn().mockResolvedValue(undefined);
    const controller = fakeController({ get, removeStep });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    await screen.findByText('schema-extractor');
    fireEvent.click(screen.getByText('schema-extractor'));
    await screen.findByDisplayValue('schema-extractor');

    fireEvent.click(screen.getByText('Remove step'));

    await waitFor(() => expect(removeStep).toHaveBeenCalledWith('wf-1', 'step-1'));
    expect(screen.getByText('Select a step to inspect it.')).toBeTruthy();
  });
});

describe('AutomationWorkflowDetailScreen — run history and drill-down', () => {
  it('ignores a document response after another document is selected', async () => {
    let resolveA!: (value: {
      kind: 'text';
      content: { extractionStatus: 'extracted'; text: string; chartPreviews: [] };
    }) => void;
    let resolveB!: (value: {
      kind: 'text';
      content: { extractionStatus: 'extracted'; text: string; chartPreviews: [] };
    }) => void;
    const getDocumentContent = vi.fn(
      (input: { documentId: string; mimeType: string }) =>
        new Promise((resolve) => {
          if (input.documentId === 'doc-a') resolveA = resolve;
          else resolveB = resolve;
        }),
    );
    const controller = fakeController({
      get: vi.fn().mockResolvedValue(workflowWithSteps()),
      listRuns: vi.fn().mockResolvedValue([
        {
          runId: 'run-1',
          status: 'success',
          triggeredBy: 'test',
          startedAt: '2026-09-06T07:00:00.000Z',
        },
      ]),
      getRunStatus: vi.fn().mockResolvedValue({
        runId: 'run-1',
        status: 'success',
        triggeredBy: 'test',
        startedAt: '2026-09-06T07:00:00.000Z',
        steps: [],
        documents: [
          {
            id: 'doc-a',
            filename: 'a.txt',
            mimeType: 'text/plain',
            pageCount: 1,
            extractionStatus: 'extracted',
            chartPreviews: [],
            createdAt: '',
          },
          {
            id: 'doc-b',
            filename: 'b.txt',
            mimeType: 'text/plain',
            pageCount: 1,
            extractionStatus: 'extracted',
            chartPreviews: [],
            createdAt: '',
          },
        ],
      }),
    });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
        getDocumentContent,
      }),
    );

    fireEvent.click(await screen.findByText(/Test ·/));
    fireEvent.click(await screen.findByText('a.txt'));
    fireEvent.click(await screen.findByText('b.txt'));
    await act(async () =>
      resolveB({
        kind: 'text',
        content: { extractionStatus: 'extracted', text: 'Document B', chartPreviews: [] },
      }),
    );
    await screen.findByText('Document B');
    await act(async () =>
      resolveA({
        kind: 'text',
        content: { extractionStatus: 'extracted', text: 'Document A', chartPreviews: [] },
      }),
    );

    expect(screen.getByText('Document B')).toBeTruthy();
    expect(screen.queryByText('Document A')).toBeNull();
  });

  it('lists runs by trigger and start time', async () => {
    const controller = fakeController({
      get: vi.fn().mockResolvedValue(workflowWithSteps()),
      listRuns: vi.fn().mockResolvedValue([
        {
          runId: 'run-1',
          status: 'success',
          triggeredBy: 'test',
          startedAt: '2026-09-06T07:00:00.000Z',
        },
      ]),
    });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    expect(await screen.findByText(/Test ·/)).toBeTruthy();
  });

  it('shows no-runs empty state when the workflow has never run', async () => {
    const controller = fakeController({ get: vi.fn().mockResolvedValue(workflowWithSteps()) });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    expect(await screen.findByText('No runs yet.')).toBeTruthy();
  });

  it('clicking a run fetches and shows its step results, labeled by step number, with suggestion tags stripped', async () => {
    const controller = fakeController({
      get: vi.fn().mockResolvedValue(workflowWithSteps()),
      listRuns: vi.fn().mockResolvedValue([
        {
          runId: 'run-1',
          status: 'success',
          triggeredBy: 'test',
          startedAt: '2026-09-06T07:00:00.000Z',
        },
      ]),
      getRunStatus: vi.fn().mockResolvedValue({
        runId: 'run-1',
        status: 'success',
        triggeredBy: 'test',
        startedAt: '2026-09-06T07:00:00.000Z',
        finishedAt: '2026-09-06T07:01:00.000Z',
        steps: [
          {
            stepId: 'step-1',
            status: 'success',
            output:
              'Report finished. <suggestion>Grant read access</suggestion> <suggestion>Provide table names</suggestion>',
            agentRunId: 'agent-run-1',
          },
        ],
      }),
    });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    fireEvent.click(await screen.findByText(/Test ·/));

    await waitFor(() => expect(controller.getRunStatus).toHaveBeenCalledWith('wf-1', 'run-1'));
    await screen.findByText('Report finished.');
    // "Step 1" also labels the card in the step chain above — the drill-down row is a second instance.
    expect(screen.getAllByText('Step 1').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/<suggestion>/)).toBeNull();
    expect(screen.getByText(/agent-run-1/)).toBeTruthy();
  });

  it('keeps the run details layout single-column until the dialog is wide enough', async () => {
    const controller = fakeController({
      get: vi.fn().mockResolvedValue(workflowWithSteps()),
      listRuns: vi.fn().mockResolvedValue([
        {
          runId: 'run-1',
          status: 'success',
          triggeredBy: 'test',
          startedAt: '2026-09-06T07:00:00.000Z',
        },
      ]),
      getRunStatus: vi.fn().mockResolvedValue({
        runId: 'run-1',
        status: 'success',
        triggeredBy: 'test',
        startedAt: '2026-09-06T07:00:00.000Z',
        steps: [{ stepId: 'step-1', status: 'success', output: 'Large report' }],
      }),
    });

    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    fireEvent.click(await screen.findByText(/Test ·/));
    await screen.findByText('Large report');

    const layout = screen.getByRole('dialog').querySelector('div.grid.min-h-0');
    expect(layout?.className).toContain('grid-cols-1');
    expect(layout?.className).toContain('@[68rem]/run-details:grid-cols-');
    expect(layout?.className).not.toContain('minmax(20rem');
  });

  it('shows a step run files browser keyed by agentRunId, on demand', async () => {
    const listRunFiles = vi.fn().mockResolvedValue([
      {
        path: 'report.md',
        accessType: 'created',
        toolName: 'Write',
        accessedAt: '2026-09-06T07:00:30.000Z',
        available: true,
        sizeBytes: 12,
      },
    ]);
    const controller = fakeController({
      get: vi.fn().mockResolvedValue(workflowWithSteps()),
      listRuns: vi.fn().mockResolvedValue([
        {
          runId: 'run-1',
          status: 'failed',
          triggeredBy: 'test',
          startedAt: '2026-09-06T07:00:00.000Z',
        },
      ]),
      getRunStatus: vi.fn().mockResolvedValue({
        runId: 'run-1',
        status: 'failed',
        triggeredBy: 'test',
        startedAt: '2026-09-06T07:00:00.000Z',
        steps: [
          {
            stepId: 'step-1',
            // A running/failed step still exposes the files it touched so far.
            status: 'running',
            agentRunId: 'agent-run-1',
          },
        ],
      }),
    });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps({ listRunFiles }),
      }),
    );

    fireEvent.click(await screen.findByText(/Test ·/));
    await waitFor(() => expect(controller.getRunStatus).toHaveBeenCalledWith('wf-1', 'run-1'));

    // Files are not fetched until the browser is opened.
    expect(listRunFiles).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Show files' }));

    await waitFor(() => expect(listRunFiles).toHaveBeenCalledWith('agent-run-1'));
    expect(await screen.findByText('report.md')).toBeTruthy();
  });

  it('does not render a files toggle for a step with no agentRunId', async () => {
    const controller = fakeController({
      get: vi.fn().mockResolvedValue(workflowWithSteps()),
      listRuns: vi.fn().mockResolvedValue([
        {
          runId: 'run-1',
          status: 'running',
          triggeredBy: 'test',
          startedAt: '2026-09-06T07:00:00.000Z',
        },
      ]),
      getRunStatus: vi.fn().mockResolvedValue({
        runId: 'run-1',
        status: 'running',
        triggeredBy: 'test',
        startedAt: '2026-09-06T07:00:00.000Z',
        steps: [{ stepId: 'step-1', status: 'queued' }],
      }),
    });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    fireEvent.click(await screen.findByText(/Test ·/));
    await waitFor(() => expect(controller.getRunStatus).toHaveBeenCalledWith('wf-1', 'run-1'));
    expect(screen.queryByRole('button', { name: 'Show files' })).toBeNull();
  });
});

describe('AutomationWorkflowDetailScreen — trigger fields authoring', () => {
  function workflowWithTriggerFields(): AutomationWorkflowViewModel {
    return workflow({
      triggerFields: [{ name: 'run_date', type: 'date', required: true }],
    });
  }

  it('adds a new trigger field and persists all fields via controller.update', async () => {
    const get = vi.fn().mockResolvedValue(workflowWithTriggerFields());
    const update = vi.fn().mockResolvedValue(workflowWithTriggerFields());
    const controller = fakeController({ get, update });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    await screen.findByText('Ingest to Slack');
    // Existing field is shown.
    expect(screen.getByDisplayValue('run_date')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add trigger field' }));

    // Two name inputs now — fill the new (empty) one.
    const nameInputs = screen.getAllByLabelText('Name') as HTMLInputElement[];
    expect(nameInputs).toHaveLength(2);
    fireEvent.change(nameInputs[1]!, { target: { value: 'amount' } });
    const typeSelects = screen.getAllByLabelText('Type') as HTMLSelectElement[];
    fireEvent.change(typeSelects[1]!, { target: { value: 'number' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save trigger fields' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('wf-1', {
        triggerFields: [
          { name: 'run_date', type: 'date', required: true },
          { name: 'amount', type: 'number', required: true },
        ],
      }),
    );
  });

  it('edits an existing trigger field (name, type, required) and persists the change', async () => {
    const get = vi.fn().mockResolvedValue(workflowWithTriggerFields());
    const update = vi.fn().mockResolvedValue(workflowWithTriggerFields());
    const controller = fakeController({ get, update });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    await screen.findByText('Ingest to Slack');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'scheduled_at' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'datetime' } });
    fireEvent.click(screen.getByLabelText('Required'));

    fireEvent.click(screen.getByRole('button', { name: 'Save trigger fields' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('wf-1', {
        triggerFields: [{ name: 'scheduled_at', type: 'datetime', required: false }],
      }),
    );
  });

  it('removes a trigger field and persists the remaining set', async () => {
    const get = vi.fn().mockResolvedValue(
      workflow({
        triggerFields: [
          { name: 'run_date', type: 'date', required: true },
          { name: 'amount', type: 'number', required: false },
        ],
      }),
    );
    const update = vi.fn().mockResolvedValue(workflow());
    const controller = fakeController({ get, update });
    render(
      createElement(AutomationWorkflowDetailScreen, {
        controller,
        workflowId: 'wf-1',
        ...fileProps(),
      }),
    );

    await screen.findByText('Ingest to Slack');
    expect(screen.getByDisplayValue('run_date')).toBeTruthy();
    expect(screen.getByDisplayValue('amount')).toBeTruthy();

    // Remove the first field.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Save trigger fields' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('wf-1', {
        triggerFields: [{ name: 'amount', type: 'number', required: false }],
      }),
    );
  });
});
