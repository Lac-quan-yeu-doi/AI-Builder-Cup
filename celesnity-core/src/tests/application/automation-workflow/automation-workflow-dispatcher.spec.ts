import { AutomationWorkflowDispatcher } from '@application/automation-workflow/automation-workflow-dispatcher';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { backgroundPrincipal } from '@tests/application/administration/background-principal.fixture';
import { AutomationWorkflow } from '@domain/automation-workflow/models/automation-workflow';
import { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';
import { AutomationWorkflowRun } from '@domain/automation-workflow/models/automation-workflow-run';
import { AutomationWorkflowStepRun } from '@domain/automation-workflow/models/automation-workflow-step-run';

const workflow = AutomationWorkflow.create({
  id: 'wf-1',
  organizationId: 'org-1',
  name: 'Chain',
  status: 'enabled',
  triggerType: 'EVENT',
  eventTopic: 'celesnity.ingest.file.created.v1',
  createdBy: 'org-1',
  createdAt: new Date(),
});
const steps = [
  AutomationWorkflowStep.create({
    id: 'step-1',
    workflowId: 'wf-1',
    order: 0,
    agentId: 'schema-extractor',
    inputTemplate: { message: '$.trigger.bucket' },
  }),
  AutomationWorkflowStep.create({
    id: 'step-2',
    workflowId: 'wf-1',
    order: 1,
    agentId: 'summarizer',
    inputTemplate: { message: '$.step1.output' },
  }),
];

function makeDispatcher() {
  const contexts = new AuthenticatedContextStore();
  contexts.configureBackgroundResolver(async (org) => backgroundPrincipal(org));
  const runs: Record<string, AutomationWorkflowRun> = {};
  const stepRuns: Record<string, AutomationWorkflowStepRun> = {};
  let stepRunSeq = 0;

  const workflowRepo = {
    listStepsForWorkflow: jest.fn().mockResolvedValue(steps),
  };
  const runRepo = {
    createRun: jest.fn(
      async (workflowId: string, triggeredBy: string, triggerPayload: unknown, startedAt: Date) => {
        const run = AutomationWorkflowRun.create({
          id: 'run-1',
          workflowId,
          triggeredBy: triggeredBy as never,
          status: 'running',
          triggerPayload,
          startedAt,
        });
        runs['run-1'] = run;
        return run;
      },
    ),
    updateRunStatus: jest.fn(async (runId: string, status: string, finishedAt?: Date) => {
      runs[runId] = runs[runId]!.withStatus(status as never, finishedAt);
      return runs[runId];
    }),
    createStepRun: jest.fn(async (runId: string, stepId: string) => {
      const id = `step-run-${++stepRunSeq}`;
      const stepRun = AutomationWorkflowStepRun.create({
        id,
        runId,
        stepId,
        status: 'running',
        startedAt: new Date(),
      });
      stepRuns[id] = stepRun;
      return stepRun;
    }),
    updateStepRun: jest.fn(async (stepRunId: string, status: string, patch = {}) => {
      stepRuns[stepRunId] = stepRuns[stepRunId]!.withStatus(status as never, patch as never);
      return stepRuns[stepRunId];
    }),
    listStepRunsForRun: jest.fn(async () => Object.values(stepRuns)),
  };
  const webhookClient = {
    trigger: jest
      .fn()
      .mockImplementation(async (request: { runId?: string }) => ({
        outcome: 'TRIGGERED',
        runId: request.runId,
        callerId: 'tenant-1',
      })),
    listAgents: jest.fn(),
  };
  let capturedOnTerminal:
    ((result: { success: boolean; output?: string; error?: string }) => Promise<void>) | undefined;
  const poller = {
    watch: jest.fn(
      (_agentRunId: string, onTerminal: typeof capturedOnTerminal, _callerId?: string) => {
      capturedOnTerminal = onTerminal;
      },
    ),
  };

  const dispatcher = new AutomationWorkflowDispatcher(
    workflowRepo as never,
    runRepo as never,
    webhookClient,
    poller,
    contexts,
  );
  return {
    dispatcher,
    webhookClient,
    runRepo,
    workflowRepo,
    poller,
    contexts,
    seedRun: (run: AutomationWorkflowRun) => { runs[run.id] = run; },
    getOnTerminal: () => capturedOnTerminal!,
  };
}

describe('AutomationWorkflowDispatcher', () => {
  it('uses the persisted organization background identity for event, schedule, and test admissions', async () => {
    const { dispatcher, webhookClient, contexts } = makeDispatcher();
    webhookClient.trigger.mockImplementation(async (request: { runId: string }) => {
      expect(contexts.require()).toMatchObject({
        organizationId: workflow.organizationId,
        role: 'SERVICE_ACCOUNT',
      });
      return { outcome: 'TRIGGERED', runId: request.runId, callerId: 'service' };
    });
    for (const trigger of ['event', 'schedule', 'test'] as const) {
      await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, trigger);
    }
    expect(webhookClient.trigger).toHaveBeenCalledTimes(3);
  });

  it('fails closed when the background organization identity is unavailable', async () => {
    const { workflowRepo, runRepo, webhookClient, poller } = makeDispatcher();
    const dispatcher = new AutomationWorkflowDispatcher(
      workflowRepo as never, runRepo as never, webhookClient, poller,
      new AuthenticatedContextStore(),
    );
    await expect(dispatcher.start(workflow, { bucket: 'x' }, 'event'))
      .rejects.toThrow('Background identity resolver is required');
    expect(webhookClient.trigger).not.toHaveBeenCalled();
  });

  it('reactivates a retried workflow before admitting its next Agent step', async () => {
    const { dispatcher, runRepo, webhookClient, seedRun } = makeDispatcher();
    const failedRun = AutomationWorkflowRun.create({
      id: 'run-1', workflowId: workflow.id, triggeredBy: 'test',
      status: 'failed', triggerPayload: { bucket: 'ingest-bucket' },
      startedAt: new Date(), finishedAt: new Date(),
    });
    seedRun(failedRun);
    await dispatcher.retryFrom(failedRun, workflow, 1);
    expect(runRepo.updateRunStatus).toHaveBeenCalledWith('run-1', 'running');
    expect((runRepo.updateRunStatus as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan(webhookClient.trigger.mock.invocationCallOrder[0]!);
  });

  it('dispatches step 1 first, resolving its input from the trigger payload', async () => {
    const { dispatcher, webhookClient, runRepo } = makeDispatcher();
    await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, 'event');
    expect(webhookClient.trigger).toHaveBeenCalledTimes(1);
    expect(webhookClient.trigger).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'schema-extractor', input: 'ingest-bucket' }),
    );
    const submitted = webhookClient.trigger.mock.calls[0]?.[0] as { runId: string };
    expect(runRepo.updateStepRun).toHaveBeenCalledWith('step-run-1', 'running', {
      agentRunId: submitted.runId,
    });
    expect((runRepo.updateStepRun as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      webhookClient.trigger.mock.invocationCallOrder[0]!,
    );
  });

  it('passes the persisted run ID and workflow context to Agent', async () => {
    const { dispatcher, webhookClient } = makeDispatcher();
    await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, 'event');

    expect(webhookClient.trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: expect.any(String),
        automationContext: {
          workflowId: 'wf-1',
          workflowRunId: 'run-1',
          workflowStepId: 'step-1',
          organizationId: 'org-1',
        },
      }),
    );
  });

  it('passes the trigger caller identity to the status poller', async () => {
    const { dispatcher, poller } = makeDispatcher();
    await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, 'event');

    expect(poller.watch).toHaveBeenCalledWith(expect.any(String), expect.any(Function), 'tenant-1');
    const agentRunId = (poller.watch as jest.Mock).mock.calls[0]?.[0] as string;
    expect(agentRunId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('forwards a step’s systemPrompt to the webhook client when the step has one', async () => {
    const { dispatcher, webhookClient, workflowRepo } = makeDispatcher();
    const stepsWithPrompt = [
      AutomationWorkflowStep.create({
        id: 'step-1',
        workflowId: 'wf-1',
        order: 0,
        agentId: 'schema-extractor',
        inputTemplate: { message: '$.trigger.bucket' },
        systemPrompt: 'You are a terse schema critic.',
      }),
    ];
    workflowRepo.listStepsForWorkflow.mockResolvedValueOnce(stepsWithPrompt);

    await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, 'event');

    expect(webhookClient.trigger).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: 'You are a terse schema critic.' }),
    );
  });

  it('omits systemPrompt from the trigger request when the step has none', async () => {
    const { dispatcher, webhookClient } = makeDispatcher();
    await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, 'event');

    const firstCallArg = webhookClient.trigger.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstCallArg).not.toHaveProperty('systemPrompt');
  });

  it('advances to step 2 once step 1 is reported terminal-success, resolving step1.output', async () => {
    const { dispatcher, webhookClient, getOnTerminal } = makeDispatcher();
    await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, 'event');

    await getOnTerminal()({ success: true, output: 'schema: 12 columns' });

    expect(webhookClient.trigger).toHaveBeenCalledTimes(2);
    expect(webhookClient.trigger).toHaveBeenLastCalledWith(
      expect.objectContaining({ agentId: 'summarizer', input: 'schema: 12 columns' }),
    );
  });

  it('marks the run failed and never dispatches step 2 if step 1 terminates as a failure', async () => {
    const { dispatcher, webhookClient, runRepo, getOnTerminal } = makeDispatcher();
    await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, 'event');

    await getOnTerminal()({ success: false, error: 'agent run failed' });

    expect(webhookClient.trigger).toHaveBeenCalledTimes(1);
    expect(runRepo.updateRunStatus).toHaveBeenCalledWith('run-1', 'failed', expect.any(Date));
  });

  it('persists the poller-reported error as the failed step run’s output, for the UI to show', async () => {
    const { dispatcher, runRepo, getOnTerminal } = makeDispatcher();
    await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, 'event');

    await getOnTerminal()({ success: false, error: 'agent run failed: rate limited' });

    expect(runRepo.updateStepRun).toHaveBeenCalledWith(
      'step-run-1',
      'failed',
      expect.objectContaining({ output: 'agent run failed: rate limited' }),
    );
  });

  it('forceFailAtStep synthesizes a failed step run without calling the webhook client', async () => {
    const { dispatcher, webhookClient, runRepo } = makeDispatcher();
    await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, 'test', { forceFailAtStep: 1 });

    expect(webhookClient.trigger).not.toHaveBeenCalled();
    expect(runRepo.updateRunStatus).toHaveBeenCalledWith('run-1', 'failed', expect.any(Date));
    expect(runRepo.updateStepRun).toHaveBeenCalledWith(
      'step-run-1',
      'failed',
      expect.objectContaining({ output: expect.stringContaining('forced') }),
    );
  });

  it('records a reason when a step’s input template does not resolve to a value', async () => {
    const { dispatcher, webhookClient, runRepo } = makeDispatcher();
    await dispatcher.start(workflow, {}, 'event'); // no `bucket` in the trigger payload, so $.trigger.bucket can't resolve

    expect(webhookClient.trigger).not.toHaveBeenCalled();
    expect(runRepo.updateStepRun).toHaveBeenCalledWith(
      'step-run-1',
      'failed',
      expect.objectContaining({ output: expect.stringContaining('input') }),
    );
  });

  it('records the webhook client’s message when the trigger is rejected', async () => {
    const { dispatcher, webhookClient, runRepo } = makeDispatcher();
    webhookClient.trigger.mockResolvedValueOnce({
      outcome: 'UNKNOWN_AGENT',
      message: 'minder-agent returned 404 for source "schema-extractor"',
    });

    await dispatcher.start(workflow, { bucket: 'ingest-bucket' }, 'event');

    expect(runRepo.updateStepRun).toHaveBeenCalledWith(
      'step-run-1',
      'failed',
      expect.objectContaining({
        output: 'minder-agent returned 404 for source "schema-extractor"',
      }),
    );
  });
});
