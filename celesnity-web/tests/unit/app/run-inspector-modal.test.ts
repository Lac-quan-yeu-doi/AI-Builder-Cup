// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunInspectorModal } from '@/app/(workspace)/chat/_components/run-inspector-modal';
import { NotFoundError } from '@/src/entities/errors/application-errors';
import type {
  ChatTranscriptMessage,
  RunManifest,
  RunTraceSpan,
  RunValidation,
} from '@/src/entities/models/chat';
import type { RunGovernance } from '@/src/entities/models/governance';

afterEach(() => {
  cleanup();
});

const manifest: RunManifest = {
  manifestVersion: 1,
  manifestId: 'manifest-1',
  runId: 'run-1',
  sessionId: null,
  parentRunId: null,
  rootRunId: 'run-1',
  agent: { name: 'analyst' },
  model: { name: 'sonnet' },
  instructions: {},
  skills: [],
  tools: {},
  runtime: {},
  environment: {},
  input: {},
};

const governance: RunGovernance = {
  owner: 'alice',
  runId: 'run-1',
  policyRevision: 'revision-1',
  admittedAt: '2026-09-16T00:00:00.000Z',
  policy: {
    actionApprovals: {},
    autonomy: 'manual',
    sandbox: { enabled: false, allowedCommandCount: 0, writablePathCount: 0 },
    sensitiveFiles: 'deny',
    budget: {
      maxInputTokens: 100,
      maxOutputTokens: 100,
      maxToolCalls: 5,
      maxCostUsd: null,
    },
  },
};

/** Every test needs this whole shape; only a handful of props vary per test. */
function props(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run-1',
    onClose: vi.fn(),
    getRunManifest: vi.fn().mockResolvedValue(manifest),
    getRunTrace: vi.fn(),
    getRunReport: vi.fn().mockRejectedValue(new NotFoundError('no report')),
    getRunValidation: vi.fn(),
    listRunFiles: vi.fn().mockResolvedValue([]),
    getRunFileContent: vi.fn(),
    getSessionResult: vi.fn(),
    listPendingActions: vi.fn().mockResolvedValue([]),
    approvePendingAction: vi.fn(),
    rejectPendingAction: vi.fn(),
    ...overrides,
  };
}

describe('RunInspectorModal', () => {
  it('shows the root section list by default, with nothing fetched yet', () => {
    const getRunManifest = vi.fn();
    const getRunTrace = vi.fn();
    render(createElement(RunInspectorModal, props({ getRunManifest, getRunTrace })));

    for (const label of ['Result', 'Manifest', 'Trace', 'Graph', 'Validation', 'Approvals']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeDefined();
    }
    expect(getRunManifest).not.toHaveBeenCalled();
    expect(getRunTrace).not.toHaveBeenCalled();
  });

  it('drills into a section on click, and a back button returns to the list', async () => {
    const getRunManifest = vi.fn().mockResolvedValue(manifest);
    render(createElement(RunInspectorModal, props({ getRunManifest })));

    fireEvent.click(screen.getByRole('button', { name: /Manifest/ }));
    expect(await screen.findByText('manifest-1')).toBeDefined();
    // Root listing rows are gone while drilled in — only the breadcrumb's
    // "Run details" back link and the detail content remain.
    expect(screen.queryByRole('button', { name: /^Trace$/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Run details/ }));
    expect(screen.getByRole('button', { name: /Manifest/ })).toBeDefined();
    expect(screen.queryByText('manifest-1')).toBeNull();
  });

  it("shows the run's response on the result view", async () => {
    const withSession: RunManifest = { ...manifest, sessionId: 'session-1' };
    const transcript: readonly ChatTranscriptMessage[] = [
      { role: 'user', content: 'What is in the database?', reasoning: null },
      { role: 'assistant', content: 'Here is what I found.', reasoning: null },
    ];
    const getSessionResult = vi.fn().mockResolvedValue(transcript);
    render(
      createElement(
        RunInspectorModal,
        props({ getRunManifest: vi.fn().mockResolvedValue(withSession), getSessionResult }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Result/ }));

    expect(await screen.findByText('Here is what I found.')).toBeDefined();
    expect(screen.getByText('What is in the database?')).toBeDefined();
    expect(getSessionResult).toHaveBeenCalledWith('session-1');
  });

  it('shows "no longer available" on the result view when the run has no session', async () => {
    render(createElement(RunInspectorModal, props()));

    fireEvent.click(screen.getByRole('button', { name: /Result/ }));

    expect(await screen.findByText('No longer available.')).toBeDefined();
  });

  it('shows the report on the result view when the run has one', async () => {
    const getRunReport = vi
      .fn()
      .mockResolvedValue({ runId: 'run-1', markdown: '# Daily summary\n\nAll good.' });
    render(createElement(RunInspectorModal, props({ getRunReport })));

    fireEvent.click(screen.getByRole('button', { name: /Result/ }));

    expect(await screen.findByText('Daily summary')).toBeDefined();
    expect(screen.getByText('All good.')).toBeDefined();
    expect(getRunReport).toHaveBeenCalledWith('run-1');
  });

  it('downloads the report as a .md file when the run has one', async () => {
    const anchors: HTMLAnchorElement[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      anchors.push(this);
    });
    const createObjectURLSpy = vi.fn((blob: Blob) => {
      void blob;
      return 'blob:mock-url';
    });
    const revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = createObjectURLSpy as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURLSpy as unknown as typeof URL.revokeObjectURL;

    const getRunReport = vi
      .fn()
      .mockResolvedValue({ runId: 'run-1', markdown: '# Daily summary\n\nAll good.' });
    render(createElement(RunInspectorModal, props({ getRunReport })));

    fireEvent.click(screen.getByRole('button', { name: /Result/ }));
    await screen.findByText('Daily summary');

    fireEvent.click(screen.getByRole('button', { name: /Download \.md/ }));

    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.download).toBe('run-run-1.md');
    const blob = createObjectURLSpy.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('text/markdown');
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');

    clickSpy.mockRestore();
  });

  it('has no download button on the result view when falling back to the transcript', async () => {
    const withSession: RunManifest = { ...manifest, sessionId: 'session-1' };
    const getSessionResult = vi
      .fn()
      .mockResolvedValue([{ role: 'assistant', content: 'Fallback answer.', reasoning: null }]);
    render(
      createElement(
        RunInspectorModal,
        props({ getRunManifest: vi.fn().mockResolvedValue(withSession), getSessionResult }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Result/ }));

    expect(await screen.findByText('Fallback answer.')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Download \.md/ })).toBeNull();
  });

  it('falls back to the transcript when the run has no report', async () => {
    const getRunReport = vi.fn().mockRejectedValue(new NotFoundError('no report'));
    const withSession: RunManifest = { ...manifest, sessionId: 'session-1' };
    const getSessionResult = vi
      .fn()
      .mockResolvedValue([{ role: 'assistant', content: 'Fallback answer.', reasoning: null }]);
    render(
      createElement(
        RunInspectorModal,
        props({
          getRunReport,
          getRunManifest: vi.fn().mockResolvedValue(withSession),
          getSessionResult,
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Result/ }));

    expect(await screen.findByText('Fallback answer.')).toBeDefined();
  });

  it('shows the error state when the report fetch fails for a reason other than 404', async () => {
    const getRunReport = vi.fn().mockRejectedValue(new Error('network down'));
    render(createElement(RunInspectorModal, props({ getRunReport })));

    fireEvent.click(screen.getByRole('button', { name: /Result/ }));

    expect(await screen.findByText('network down')).toBeDefined();
  });

  it('fetches and shows the manifest view once selected', async () => {
    const getRunManifest = vi.fn().mockResolvedValue(manifest);
    render(createElement(RunInspectorModal, props({ getRunManifest })));

    fireEvent.click(screen.getByRole('button', { name: /Manifest/ }));

    expect(await screen.findByText('manifest-1')).toBeDefined();
    expect(getRunManifest).toHaveBeenCalledWith('run-1');
  });

  it('shows "no longer available" when the manifest is 404', async () => {
    const getRunManifest = vi.fn().mockRejectedValue(new NotFoundError('gone'));
    render(createElement(RunInspectorModal, props({ getRunManifest })));

    fireEvent.click(screen.getByRole('button', { name: /Manifest/ }));

    expect(await screen.findByText('No longer available.')).toBeDefined();
  });

  it('shows "nothing recorded yet" for an empty trace, and fetches lazily on drill-in', async () => {
    const getRunTrace = vi.fn().mockResolvedValue([] as readonly RunTraceSpan[]);
    render(createElement(RunInspectorModal, props({ getRunTrace })));

    expect(getRunTrace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Trace/ }));

    expect(await screen.findByText('Nothing recorded yet.')).toBeDefined();
    expect(getRunTrace).toHaveBeenCalledWith('run-1');
  });

  it('colors a failed trace span differently from a succeeded one', async () => {
    // minder-runtime reports 'succeeded' | 'failed' | ... (never the literal
    // 'ok' this comparison used to check), so every span rendered as failed
    // regardless of its real outcome.
    const spans: readonly RunTraceSpan[] = [
      {
        traceId: 'trace-1',
        spanId: 'span-ok',
        parentSpanId: null,
        runId: 'run-1',
        rootRunId: 'run-1',
        name: 'model.generate',
        kind: 'model_generation',
        status: 'succeeded',
        startedAt: '2026-08-24T00:00:00.000Z',
        endedAt: '2026-08-24T00:00:01.000Z',
        attributes: {},
        error: null,
      },
      {
        traceId: 'trace-1',
        spanId: 'span-failed',
        parentSpanId: null,
        runId: 'run-1',
        rootRunId: 'run-1',
        name: 'mcp__trino__run_query',
        kind: 'tool_execution',
        status: 'failed',
        startedAt: '2026-08-24T00:00:02.000Z',
        endedAt: '2026-08-24T00:00:03.000Z',
        attributes: {},
        error: {
          category: 'tool',
          code: 'trino_query_failed',
          message: 'mismatched input',
          retryable: false,
          source: 'tool',
        },
      },
    ];
    render(
      createElement(RunInspectorModal, props({ getRunTrace: vi.fn().mockResolvedValue(spans) })),
    );

    fireEvent.click(screen.getByRole('button', { name: /Trace/ }));
    await screen.findByText('model.generate');

    const okBadge = screen.getByText('model_generation');
    const failedBadge = screen.getByText('tool_execution');
    expect(okBadge.getAttribute('class')).toContain('bg-accent');
    expect(failedBadge.getAttribute('class')).toContain('bg-destructive');
    // Regression: minder-runtime reports a structured TraceError object
    // ({category, code, message, retryable, source}), not a plain string —
    // rendering it directly as a JSX child threw "Objects are not valid as a
    // React child" (React error #31) the moment any run actually failed.
    expect(await screen.findByText('mismatched input')).toBeDefined();
  });

  it('renders validation status once fetched', async () => {
    const validation: RunValidation = {
      status: 'valid',
      contractId: 'contract-1',
      contractVersion: '1.0.0',
      attempts: 1,
      errors: [],
      outputHash: 'sha256:abc',
      validatedAt: '2026-08-17T00:00:02.000Z',
    };
    render(
      createElement(
        RunInspectorModal,
        props({ getRunValidation: vi.fn().mockResolvedValue(validation) }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Validation/ }));

    expect(await screen.findByText('valid')).toBeDefined();
  });

  it('renders redacted governance evidence in the governance tab', async () => {
    const getRunGovernance = vi.fn().mockResolvedValue(governance);
    const getRunGovernanceEvidence = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'evidence-1',
          owner: 'alice',
          runId: 'run-1',
          seq: 1,
          at: '2026-09-16T00:00:01.000Z',
          kind: 'approval_requested',
          detail: {
            approvalId: 'approval-1',
            toolCallId: 'call-1',
            action: 'Write',
            expiresAt: '2026-09-16T00:05:00.000Z',
          },
        },
      ],
    });
    render(createElement(RunInspectorModal, props({ getRunGovernance, getRunGovernanceEvidence })));

    fireEvent.click(screen.getByRole('button', { name: /Governance/ }));

    expect(await screen.findByText('approval_requested')).toBeDefined();
    expect(screen.getByText(/Write/)).toBeDefined();
    expect(getRunGovernanceEvidence).toHaveBeenCalledWith('run-1', undefined);
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(createElement(RunInspectorModal, props({ onClose })));

    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalled();
  });
});
