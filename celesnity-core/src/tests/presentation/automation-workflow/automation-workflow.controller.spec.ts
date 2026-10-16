import type { Request } from 'express';

import { AutomationWorkflowController } from '@presentation/automation-workflow/automation-workflow.controller';
import { buildAutomationWorkflowActions } from '@application/automation-workflow/automation-workflow.actions';
import type { AutomationWorkflowUseCases } from '@application/automation-workflow/automation-workflow.use-cases';
import { AutomationWorkflow } from '@domain/automation-workflow/models/automation-workflow';
import { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';
import { AutomationWorkflowRun } from '@domain/automation-workflow/models/automation-workflow-run';
import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import type { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import type { AutomationMutationRequest } from '@presentation/http/automation-mutation.guard';

function makeWorkflow(
  overrides: Partial<{ status: 'draft' | 'enabled' }> = {},
): AutomationWorkflow {
  return AutomationWorkflow.create({
    id: 'wf-1',
    organizationId: 'org-1',
    name: 'Ingest to Slack',
    status: overrides.status ?? 'draft',
    triggerType: 'EVENT',
    eventTopic: 'celesnity.ingest.file.created.v1',
    createdBy: 'user-1',
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
  });
}

function requestWithPrincipal(): AutomationMutationRequest {
  return { get: () => undefined, headers: {} } as unknown as AutomationMutationRequest;
}

const noopAuditLog: IActionAuditLog = { record: jest.fn(async () => undefined) };

function buildController(useCasesOverrides: Partial<AutomationWorkflowUseCases> = {}): {
  controller: AutomationWorkflowController;
  useCases: AutomationWorkflowUseCases;
} {
  const useCases = { ...useCasesOverrides } as unknown as AutomationWorkflowUseCases;
  const actions = buildAutomationWorkflowActions(useCases);
  const pendingActions = { propose: jest.fn() } as unknown as PendingActionUseCases;
  const controller = new AutomationWorkflowController(
    actions,
    noopAuditLog,
    pendingActions,
    useCases,
  );
  return { controller, useCases };
}

async function authenticatedRequest(): Promise<AutomationMutationRequest> {
  const { setAuthenticatedPrincipal } = await import('@presentation/http/authenticated-request');
  const req = requestWithPrincipal();
  setAuthenticatedPrincipal(req, {
    identityId: 'user-1',
    subject: 'user-1',
    identityTenantId: 'tenant-1',
    organizationId: 'org-1',
    organizationStatus: 'ACTIVE',
    mfaRequired: false,
    membershipId: 'membership-1',
    role: 'ORG_ADMIN',
    authenticationTime: 0,
    mfaVerified: true,
  });
  return req;
}

describe('AutomationWorkflowController', () => {
  it('creates a workflow and maps it to a response DTO with no steps', async () => {
    const { controller } = buildController({ createWorkflow: jest.fn(async () => makeWorkflow()) });
    const req = await authenticatedRequest();

    const response = await controller.create(req, {
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
      eventTopic: 'celesnity.ingest.file.created.v1',
    });

    expect(response).toEqual(
      expect.objectContaining({ id: 'wf-1', name: 'Ingest to Slack', status: 'draft', steps: [] }),
    );
  });

  it('threads triggerFields through create into the createWorkflow use-case', async () => {
    const createWorkflow = jest.fn(async () => makeWorkflow());
    const { controller } = buildController({ createWorkflow });
    const req = await authenticatedRequest();

    await controller.create(req, {
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
      triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
    });

    expect(createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
      }),
    );
  });

  it('exposes triggerFields on the response DTO', async () => {
    const workflowWithFields = AutomationWorkflow.create({
      id: 'wf-1',
      organizationId: 'org-1',
      name: 'Ingest to Slack',
      status: 'draft',
      triggerType: 'EVENT',
      eventTopic: 'celesnity.ingest.file.created.v1',
      createdBy: 'user-1',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
      triggerFields: [{ name: 'run_date', type: 'date', required: true }],
    });
    const { controller } = buildController({
      getWorkflow: jest.fn(async () => ({ workflow: workflowWithFields, steps: [] })),
    });

    const response = await controller.get('wf-1');
    expect(response.triggerFields).toEqual([{ name: 'run_date', type: 'date', required: true }]);
  });

  it('lists workflows with their steps for the caller organization', async () => {
    const step = AutomationWorkflowStep.create({
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: {},
    });
    const { controller, useCases } = buildController({
      listWorkflows: jest.fn(async () => [makeWorkflow()]),
      listSteps: jest.fn(async () => [step]),
    });
    const req = (await authenticatedRequest()) as unknown as Request;

    const response = await controller.list(req as never);

    expect(useCases.listWorkflows).toHaveBeenCalledWith('org-1');
    expect(response).toHaveLength(1);
    expect(response[0]?.steps).toHaveLength(1);
  });

  it('refuses listing workflows without a verified principal', async () => {
    const { controller, useCases } = buildController({
      listWorkflows: jest.fn(async () => [makeWorkflow()]),
      listSteps: jest.fn(async () => []),
    });
    // No setAuthenticatedPrincipal — mirrors local-development mode where the
    // bearer guard does not attach a principal to the request.
    const req = requestWithPrincipal() as unknown as Request;

    await expect(controller.list(req as never)).rejects.toThrow('Authenticated organization context is required');
    expect(useCases.listWorkflows).not.toHaveBeenCalled();
  });

  it('gets one workflow with its steps', async () => {
    const step = AutomationWorkflowStep.create({
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: {},
    });
    const { controller } = buildController({
      getWorkflow: jest.fn(async () => ({ workflow: makeWorkflow(), steps: [step] })),
    });

    const response = await controller.get('wf-1');
    expect(response.steps).toHaveLength(1);
  });

  it('get throws a 404-shaped error when the workflow does not exist', async () => {
    const { controller } = buildController({ getWorkflow: jest.fn(async () => undefined) });
    await expect(controller.get('missing')).rejects.toThrow();
  });

  it('update enables a workflow via the setEnabled action, and renames it directly', async () => {
    const setStatus = jest.fn(async () => makeWorkflow({ status: 'enabled' }));
    const renameWorkflow = jest.fn(async () => makeWorkflow());
    const { controller } = buildController({
      renameWorkflow,
      getWorkflow: jest.fn(async () => ({
        workflow: makeWorkflow({ status: 'enabled' }),
        steps: [],
      })),
      setEnabled: setStatus as never,
    });
    const req = requestWithPrincipal();

    const response = await controller.update(req, 'wf-1', { enabled: true, name: 'New name' });

    expect(setStatus).toHaveBeenCalledWith('wf-1', true);
    expect(renameWorkflow).toHaveBeenCalledWith('wf-1', 'New name');
    expect(response.status).toBe('enabled');
  });

  it('update changes the trigger via the updateTrigger action', async () => {
    const updateTrigger = jest.fn(async () => makeWorkflow());
    const { controller } = buildController({
      updateTrigger: updateTrigger as never,
      getWorkflow: jest.fn(async () => ({ workflow: makeWorkflow(), steps: [] })),
    });
    const req = requestWithPrincipal();

    await controller.update(req, 'wf-1', {
      scheduleCron: '0 8 * * *',
      scheduleTimezone: 'America/Los_Angeles',
    });

    expect(updateTrigger).toHaveBeenCalledWith('wf-1', {
      triggerType: undefined,
      eventTopic: undefined,
      scheduleCron: '0 8 * * *',
      scheduleTimezone: 'America/Los_Angeles',
      triggerFields: undefined,
    });
  });

  it('update threads triggerFields through the updateTrigger action', async () => {
    const updateTrigger = jest.fn(async () => makeWorkflow());
    const { controller } = buildController({
      updateTrigger: updateTrigger as never,
      getWorkflow: jest.fn(async () => ({ workflow: makeWorkflow(), steps: [] })),
    });
    const req = requestWithPrincipal();

    await controller.update(req, 'wf-1', {
      triggerFields: [{ name: 'run_date', type: 'date', required: true }],
    });

    expect(updateTrigger).toHaveBeenCalledWith('wf-1', {
      triggerType: undefined,
      eventTopic: undefined,
      scheduleCron: undefined,
      scheduleTimezone: undefined,
      triggerFields: [{ name: 'run_date', type: 'date', required: true }],
    });
  });

  it('update does not call updateTrigger when no trigger fields are provided', async () => {
    const updateTrigger = jest.fn(async () => makeWorkflow());
    const { controller } = buildController({
      updateTrigger: updateTrigger as never,
      renameWorkflow: jest.fn(async () => makeWorkflow()),
      getWorkflow: jest.fn(async () => ({ workflow: makeWorkflow(), steps: [] })),
    });
    const req = requestWithPrincipal();

    await controller.update(req, 'wf-1', { name: 'New name' });

    expect(updateTrigger).not.toHaveBeenCalled();
  });

  it('duplicates a workflow', async () => {
    const copy = makeWorkflow();
    const { controller } = buildController({
      duplicateWorkflow: jest.fn(async () => copy),
      listSteps: jest.fn(async () => []),
    });
    const req = await authenticatedRequest();

    const response = await controller.duplicate(req, 'wf-1');
    expect(response.id).toBe('wf-1');
  });

  it('adds a step to a workflow', async () => {
    const step = AutomationWorkflowStep.create({
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    });
    const { controller } = buildController({ addStep: jest.fn(async () => step) });
    const req = requestWithPrincipal();

    const response = await controller.addStep(req, 'wf-1', {
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
    });
    expect(response.agentId).toBe('schema-extractor');
  });

  it('updates a step', async () => {
    const step = AutomationWorkflowStep.create({
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
    });
    const { controller } = buildController({ updateStep: jest.fn(async () => step) });
    const req = requestWithPrincipal();

    const response = await controller.updateStep(req, 'wf-1', 'step-1', {
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
    });
    expect(response.agentId).toBe('summarizer');
  });

  it('updates a step with only agentId, leaving inputTemplate untouched', async () => {
    const step = AutomationWorkflowStep.create({
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'validator',
      inputTemplate: { message: '$.trigger.bucket' },
    });
    const updateStep = jest.fn(async () => step);
    const { controller } = buildController({ updateStep });
    const req = requestWithPrincipal();

    await controller.updateStep(req, 'wf-1', 'step-1', { agentId: 'validator' });
    expect(updateStep).toHaveBeenCalledWith('step-1', {
      agentId: 'validator',
      inputTemplate: undefined,
      systemPrompt: undefined,
    });
  });

  it('adds a step forwarding an optional systemPrompt to the use-case', async () => {
    const step = AutomationWorkflowStep.create({
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
      systemPrompt: 'You are a terse schema critic.',
    });
    const addStep = jest.fn(async () => step);
    const { controller } = buildController({ addStep });
    const req = requestWithPrincipal();

    const response = await controller.addStep(req, 'wf-1', {
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
      systemPrompt: 'You are a terse schema critic.',
    });

    expect(addStep).toHaveBeenCalledWith(
      'wf-1',
      'schema-extractor',
      { message: '$.trigger.bucket' },
      'You are a terse schema critic.',
    );
    expect(response.systemPrompt).toBe('You are a terse schema critic.');
  });

  it('updates a step forwarding an optional systemPrompt to the use-case', async () => {
    const step = AutomationWorkflowStep.create({
      id: 'step-1',
      workflowId: 'wf-1',
      order: 0,
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
      systemPrompt: 'You are a blunt editor.',
    });
    const updateStep = jest.fn(async () => step);
    const { controller } = buildController({ updateStep });
    const req = requestWithPrincipal();

    const response = await controller.updateStep(req, 'wf-1', 'step-1', {
      systemPrompt: 'You are a blunt editor.',
    });

    expect(updateStep).toHaveBeenCalledWith('step-1', {
      agentId: undefined,
      inputTemplate: undefined,
      systemPrompt: 'You are a blunt editor.',
    });
    expect(response.systemPrompt).toBe('You are a blunt editor.');
  });

  it('proposes removing a step and returns a pending-action id, by default', async () => {
    const propose = jest.fn(async () => ({ id: 'pending-1' }));
    const useCases = {} as unknown as AutomationWorkflowUseCases;
    const actions = buildAutomationWorkflowActions(useCases);
    const pendingActions = { propose } as unknown as PendingActionUseCases;
    const controller = new AutomationWorkflowController(
      actions,
      noopAuditLog,
      pendingActions,
      useCases,
    );

    const body = await controller.removeStep(requestWithPrincipal(), 'wf-1', 'step-1');

    expect(propose).toHaveBeenCalledWith(
      'automation-workflow.removeStep',
      { workflowId: 'wf-1', stepId: 'step-1' },
      expect.anything(),
      null,
    );
    expect(body).toEqual({ status: 'pending_approval', pending_action_id: 'pending-1' });
  });

  it('removes a step immediately when the approval override header disables it', async () => {
    const removeStep = jest.fn(async () => undefined);
    const useCases = { removeStep } as unknown as AutomationWorkflowUseCases;
    const actions = buildAutomationWorkflowActions(useCases);
    const pendingActions = { propose: jest.fn() } as unknown as PendingActionUseCases;
    const controller = new AutomationWorkflowController(
      actions,
      noopAuditLog,
      pendingActions,
      useCases,
    );
    const req = {
      get: () => undefined,
      headers: { 'x-action-approval-overrides': 'automation-workflow.removeStep=false' },
    } as unknown as AutomationMutationRequest;

    const body = await controller.removeStep(req, 'wf-1', 'step-1');

    expect(removeStep).toHaveBeenCalledWith('step-1');
    expect(body).toBeUndefined();
  });

  it('test-fires a workflow and returns its run id', async () => {
    const run = AutomationWorkflowRun.create({
      id: 'run-1',
      workflowId: 'wf-1',
      triggeredBy: 'test',
      status: 'running',
      triggerPayload: { bucket: 'x' },
      startedAt: new Date('2026-09-05T00:00:00.000Z'),
    });
    const { controller } = buildController({ testFireWorkflow: jest.fn(async () => run) });

    const response = await controller.testFire(requestWithPrincipal(), 'wf-1', {
      payload: { bucket: 'x' },
    });
    expect(response).toEqual({ runId: 'run-1' });
  });

  it('reports run status with its step runs', async () => {
    const run = AutomationWorkflowRun.create({
      id: 'run-1',
      workflowId: 'wf-1',
      triggeredBy: 'test',
      status: 'success',
      triggerPayload: { bucket: 'x' },
      startedAt: new Date('2026-09-05T00:00:00.000Z'),
    });
    const { controller } = buildController({
      getRunStatus: jest.fn(async () => ({ run, stepRuns: [] })),
    });

    const response = await controller.runStatus('run-1');
    expect(response).toEqual(
      expect.objectContaining({ runId: 'run-1', status: 'success', steps: [] }),
    );
  });

  it('runStatus throws a 404-shaped error when the run does not exist', async () => {
    const { controller } = buildController({ getRunStatus: jest.fn(async () => undefined) });
    await expect(controller.runStatus('missing')).rejects.toThrow();
  });

  it('lists the workflow’s runs newest-first as summaries, without step detail', async () => {
    const run = AutomationWorkflowRun.create({
      id: 'run-2',
      workflowId: 'wf-1',
      triggeredBy: 'test',
      status: 'running',
      triggerPayload: { run_date: '2026-09-06' },
      startedAt: new Date('2026-09-06T07:00:00.000Z'),
    });
    const { controller } = buildController({ listRuns: jest.fn(async () => [run]) });

    const response = await controller.listRuns('wf-1');
    expect(response).toEqual([
      expect.objectContaining({ runId: 'run-2', status: 'running', triggeredBy: 'test' }),
    ]);
    expect(response[0]).not.toHaveProperty('steps');
  });

  it('lists an empty array when the workflow has never run', async () => {
    const { controller } = buildController({ listRuns: jest.fn(async () => []) });
    expect(await controller.listRuns('wf-1')).toEqual([]);
  });

  it('retries a run from the given step', async () => {
    const retryWorkflowRun = jest.fn(async () => undefined);
    const { controller } = buildController({ retryWorkflowRun });

    await controller.retry('wf-1', 'run-1', { resumeFromStep: 2 });
    expect(retryWorkflowRun).toHaveBeenCalledWith('run-1', 'wf-1', 2);
  });

  it('deletes a workflow', async () => {
    const deleteWorkflow = jest.fn(async () => undefined);
    const { controller } = buildController({ deleteWorkflow });

    await controller.remove('wf-1');
    expect(deleteWorkflow).toHaveBeenCalledWith('wf-1');
  });
});
