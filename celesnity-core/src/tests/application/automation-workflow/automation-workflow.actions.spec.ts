import { buildAutomationWorkflowActions } from '@application/automation-workflow/automation-workflow.actions';

describe('buildAutomationWorkflowActions', () => {
  const useCases = {
    createWorkflow: jest.fn(),
    addStep: jest.fn(),
    removeStep: jest.fn(),
    updateStep: jest.fn(),
    getWorkflow: jest.fn(),
    listAvailableAgents: jest.fn(),
    updateTrigger: jest.fn(),
    setEnabled: jest.fn(),
    testFireWorkflow: jest.fn(),
  };
  const actor = { source: 'agent' as const, runId: 'run-1', identityId: null };

  it('create_workflow: write permission, audited, not approval-gated', () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    expect(actions.create.mcpTool?.name).toBe('create_workflow');
    expect(actions.create.permission).toBe('write');
    expect(actions.create.auditRequired).toBe(true);
    expect(actions.create.approvalRequired).toBe(false);
  });

  it('create_workflow.run delegates to useCases.createWorkflow', async () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    const input = {
      organizationId: 'org-1',
      name: 'Chain',
      triggerType: 'EVENT' as const,
      eventTopic: 't',
      createdBy: 'org-1',
    };
    await actions.create.run(input, actor);
    expect(useCases.createWorkflow).toHaveBeenCalledWith(input);
  });

  it('update_workflow_step: write permission, audited, applies immediately (not approval-gated)', () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    expect(actions.updateStep.mcpTool?.name).toBe('update_workflow_step');
    expect(actions.updateStep.permission).toBe('write');
    expect(actions.updateStep.auditRequired).toBe(true);
    expect(actions.updateStep.approvalRequired).toBe(false);
  });

  it('update_workflow_step.run delegates to useCases.updateStep with only stepId and the patch fields', async () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    await actions.updateStep.run(
      {
        workflowId: 'wf-1',
        stepId: 'step-1',
        agentId: 'summarizer',
        inputTemplate: { message: '$.step1.output' },
      },
      actor,
    );
    expect(useCases.updateStep).toHaveBeenCalledWith('step-1', {
      agentId: 'summarizer',
      inputTemplate: { message: '$.step1.output' },
    });
  });

  it('get_workflow: read permission, not audited, not approval-gated by default', () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    expect(actions.getWorkflow.mcpTool?.name).toBe('get_workflow');
    expect(actions.getWorkflow.permission).toBe('read');
    expect(actions.getWorkflow.auditRequired).toBe(false);
    expect(actions.getWorkflow.approvalRequired).toBe(false);
  });

  it('get_workflow.run delegates to useCases.getWorkflow', async () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    await actions.getWorkflow.run({ workflowId: 'wf-1' }, actor);
    expect(useCases.getWorkflow).toHaveBeenCalledWith('wf-1');
  });

  it('list_available_agents: read permission, not audited, not approval-gated by default', () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    expect(actions.listAvailableAgents.mcpTool?.name).toBe('list_available_agents');
    expect(actions.listAvailableAgents.permission).toBe('read');
    expect(actions.listAvailableAgents.auditRequired).toBe(false);
    expect(actions.listAvailableAgents.approvalRequired).toBe(false);
  });

  it('list_available_agents.run delegates to useCases.listAvailableAgents', async () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    await actions.listAvailableAgents.run({}, actor);
    expect(useCases.listAvailableAgents).toHaveBeenCalledWith();
  });

  it('update_workflow_trigger: write permission, audited, applies immediately (not approval-gated)', () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    expect(actions.updateTrigger.mcpTool?.name).toBe('update_workflow_trigger');
    expect(actions.updateTrigger.permission).toBe('write');
    expect(actions.updateTrigger.auditRequired).toBe(true);
    expect(actions.updateTrigger.approvalRequired).toBe(false);
  });

  it('update_workflow_trigger.run delegates to useCases.updateTrigger with only workflowId and the patch fields', async () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    await actions.updateTrigger.run(
      {
        workflowId: 'wf-1',
        triggerType: 'SCHEDULE',
        scheduleCron: '0 8 * * *',
        scheduleTimezone: 'America/Los_Angeles',
      },
      actor,
    );
    expect(useCases.updateTrigger).toHaveBeenCalledWith('wf-1', {
      triggerType: 'SCHEDULE',
      eventTopic: undefined,
      scheduleCron: '0 8 * * *',
      scheduleTimezone: 'America/Los_Angeles',
    });
  });

  it('remove_workflow_step requires approval by default, mirroring automation.delete', () => {
    const actions = buildAutomationWorkflowActions(useCases as never);
    expect(actions.removeStep.approvalRequired).toBe(true);
  });

  it('policy overrides flip a default, e.g. making create_workflow approval-gated', () => {
    const actions = buildAutomationWorkflowActions(useCases as never, {
      'automation-workflow.create': { approvalRequired: true, auditRequired: true },
    });
    expect(actions.create.approvalRequired).toBe(true);
  });
});
