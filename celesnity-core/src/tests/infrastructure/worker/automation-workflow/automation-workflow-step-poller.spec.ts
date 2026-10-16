import { AutomationWorkflowStepPoller } from '@infrastructure/worker/automation-workflow/automation-workflow-step-poller';

function makeTranscriptClient(finalMessage: string) {
  return { fetchTranscript: jest.fn().mockResolvedValue({ finalAssistantMessage: finalMessage }) };
}

describe('AutomationWorkflowStepPoller', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('calls onTerminal with success and the transcript output once status is completed', async () => {
    const statusClient = {
      fetchStatus: jest.fn().mockResolvedValue({ status: 'completed', sessionId: 'sess-1' }),
    };
    const transcriptClient = makeTranscriptClient('schema: 12 columns');
    const poller = new AutomationWorkflowStepPoller(statusClient, transcriptClient, {
      pollIntervalMs: 100,
      timeoutMs: 5000,
    });

    const onTerminal = jest.fn();
    poller.watch('agent-run-1', onTerminal, 'tenant-1');
    await jest.advanceTimersByTimeAsync(100);

    expect(onTerminal).toHaveBeenCalledWith({ success: true, output: 'schema: 12 columns' });
    expect(statusClient.fetchStatus).toHaveBeenCalledWith('agent-run-1', 'tenant-1');
    expect(transcriptClient.fetchTranscript).toHaveBeenCalledWith('sess-1', 'tenant-1');
  });

  it('uses the completed run response text without requiring a transcript lookup', async () => {
    const statusClient = {
      fetchStatus: jest.fn().mockResolvedValue({ status: 'completed', responseText: 'done' }),
    };
    const transcriptClient = { fetchTranscript: jest.fn() };
    const poller = new AutomationWorkflowStepPoller(statusClient, transcriptClient, {
      pollIntervalMs: 100,
      timeoutMs: 5000,
    });

    const onTerminal = jest.fn();
    poller.watch('agent-run-1', onTerminal, 'tenant-1');
    await jest.advanceTimersByTimeAsync(100);

    expect(onTerminal).toHaveBeenCalledWith({ success: true, output: 'done' });
    expect(transcriptClient.fetchTranscript).not.toHaveBeenCalled();
  });

  it('calls onTerminal with failure for any other terminal status, without fetching the transcript', async () => {
    const statusClient = {
      fetchStatus: jest.fn().mockResolvedValue({ status: 'failed', error: 'boom' }),
    };
    const transcriptClient = { fetchTranscript: jest.fn() };
    const poller = new AutomationWorkflowStepPoller(statusClient, transcriptClient, {
      pollIntervalMs: 100,
      timeoutMs: 5000,
    });

    const onTerminal = jest.fn();
    poller.watch('agent-run-1', onTerminal);
    await jest.advanceTimersByTimeAsync(100);

    expect(onTerminal).toHaveBeenCalledWith({ success: false, error: 'boom' });
    expect(transcriptClient.fetchTranscript).not.toHaveBeenCalled();
  });

  it('keeps polling while status is running, then resolves once terminal', async () => {
    const statusClient = {
      fetchStatus: jest
        .fn()
        .mockResolvedValueOnce({ status: 'running' })
        .mockResolvedValueOnce({ status: 'completed', sessionId: 'sess-1' }),
    };
    const transcriptClient = makeTranscriptClient('done');
    const poller = new AutomationWorkflowStepPoller(statusClient, transcriptClient, {
      pollIntervalMs: 100,
      timeoutMs: 5000,
    });

    const onTerminal = jest.fn();
    poller.watch('agent-run-1', onTerminal);
    await jest.advanceTimersByTimeAsync(100);
    expect(onTerminal).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(100);
    expect(onTerminal).toHaveBeenCalledWith({ success: true, output: 'done' });
  });

  it('calls onTerminal with failure once the timeout window elapses without a terminal status', async () => {
    const statusClient = { fetchStatus: jest.fn().mockResolvedValue({ status: 'running' }) };
    const poller = new AutomationWorkflowStepPoller(
      statusClient,
      { fetchTranscript: jest.fn() },
      { pollIntervalMs: 100, timeoutMs: 250 },
    );

    const onTerminal = jest.fn();
    poller.watch('agent-run-1', onTerminal);
    await jest.advanceTimersByTimeAsync(300);

    expect(onTerminal).toHaveBeenCalledWith({
      success: false,
      error: 'timed out waiting for agent run agent-run-1',
    });
  });
});
