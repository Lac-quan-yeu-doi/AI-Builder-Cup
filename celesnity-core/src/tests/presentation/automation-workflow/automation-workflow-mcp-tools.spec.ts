import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  buildAutomationWorkflowMcpTools,
  type AutomationWorkflowMcpContext,
} from '@presentation/automation-workflow/automation-workflow-mcp-tools';
import type { ActionDefinition } from '@application/actions/action.types';
import type { AutomationWorkflowActions } from '@application/automation-workflow/automation-workflow.actions';
import { AutomationWorkflow } from '@domain/automation-workflow/models/automation-workflow';
import { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';

function workflow(
  overrides: Partial<Parameters<typeof AutomationWorkflow.create>[0]> = {},
): AutomationWorkflow {
  return AutomationWorkflow.create({
    id: 'wf-1',
    organizationId: 'org-1',
    name: 'Ingest to Slack',
    status: 'draft',
    triggerType: 'EVENT',
    eventTopic: 'celesnity.ingest.file.created.v1',
    scheduleCron: undefined,
    scheduleTimezone: undefined,
    nextRunAt: undefined,
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
    createdBy: 'user-1',
    ...overrides,
  });
}

function step(
  overrides: Partial<Parameters<typeof AutomationWorkflowStep.create>[0]> = {},
): AutomationWorkflowStep {
  return AutomationWorkflowStep.create({
    id: 'step-1',
    workflowId: 'wf-1',
    order: 0,
    agentId: 'schema-extractor',
    inputTemplate: { message: '$.trigger.bucket' },
    ...overrides,
  });
}

function action<TInput, TOutput>(
  name: string,
  toolName: string,
  approvalRequired: boolean,
  run: (input: TInput) => Promise<TOutput>,
): ActionDefinition<TInput, TOutput> {
  return {
    name,
    permission: 'write',
    auditRequired: true,
    approvalRequired,
    mcpTool: { name: toolName, description: name, inputSchema: { type: 'object', properties: {} } },
    run,
  };
}

function context(overrides: Partial<AutomationWorkflowActions> = {}) {
  const actions: AutomationWorkflowActions = {
    create: action('automation-workflow.create', 'create_workflow', false, async () => workflow()),
    addStep: action('automation-workflow.addStep', 'add_workflow_step', false, async () => step()),
    removeStep: action(
      'automation-workflow.removeStep',
      'remove_workflow_step',
      true,
      async () => undefined,
    ),
    updateStep: action('automation-workflow.updateStep', 'update_workflow_step', false, async () =>
      step(),
    ),
    getWorkflow: action('automation-workflow.getWorkflow', 'get_workflow', false, async () => ({
      workflow: workflow(),
      steps: [step()],
    })),
    listAvailableAgents: action(
      'automation-workflow.listAvailableAgents',
      'list_available_agents',
      false,
      async () => [{ name: 'chat-assistant', systemPrompt: 'You are Minder...' }],
    ),
    updateTrigger: action(
      'automation-workflow.updateTrigger',
      'update_workflow_trigger',
      false,
      async () => workflow({ triggerType: 'SCHEDULE', scheduleCron: '0 8 * * *' }),
    ),
    setEnabled: action('automation-workflow.setEnabled', 'enable_workflow', false, async () =>
      workflow({ status: 'enabled' }),
    ),
    testFire: action('automation-workflow.testFire', 'test_fire_workflow', false, async () => ({
      runId: 'run-1',
    })),
    ...overrides,
  };
  const ctx: AutomationWorkflowMcpContext = {
    actions,
    auditLog: { record: jest.fn().mockResolvedValue(undefined) },
    pendingActions: {
      propose: jest.fn(),
    } as unknown as AutomationWorkflowMcpContext['pendingActions'],
    approvalOverridesHeader: undefined,
    authenticatedContexts: {
      require: () => ({ organizationId: 'org-1', identityId: 'user-1' }),
    } as unknown as AuthenticatedContextStore,
  };
  return ctx;
}

function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (block === undefined || block.type !== 'text')
    throw new Error('expected a text content block');
  return block.text;
}

function findTool(tools: ReturnType<typeof buildAutomationWorkflowMcpTools>, name: string) {
  const found = tools.find((tool) => tool.tool.name === name);
  if (found === undefined) throw new Error(`tool ${name} not found`);
  return found;
}

describe('buildAutomationWorkflowMcpTools', () => {
  it('exposes exactly the expected tool names', () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    expect(tools.map((t) => t.tool.name).sort()).toEqual([
      'add_workflow_step',
      'create_workflow',
      'enable_workflow',
      'get_workflow',
      'list_available_agents',
      'remove_workflow_step',
      'test_fire_workflow',
      'update_workflow_step',
      'update_workflow_trigger',
    ]);
  });

  it('list_available_agents returns the filtered agent list as JSON', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'list_available_agents').call({});
    expect(JSON.parse(textOf(result))).toEqual([
      { name: 'chat-assistant', systemPrompt: 'You are Minder...' },
    ]);
  });

  it('create_workflow maps snake_case args to the action input and returns the workflow JSON', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { create: AutomationWorkflowActions['create'] }).create = action(
      'automation-workflow.create',
      'create_workflow',
      false,
      async (input) => {
        received = input;
        return workflow();
      },
    );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    const result = await findTool(tools, 'create_workflow').call({
      organization_id: 'org-1',
      name: 'Ingest to Slack',
      trigger_type: 'EVENT',
      event_topic: 'celesnity.ingest.file.created.v1',
      created_by: 'user-1',
    });

    expect(result.isError).toBeFalsy();
    expect(received).toEqual({
      organizationId: 'org-1',
      name: 'Ingest to Slack',
      triggerType: 'EVENT',
      eventTopic: 'celesnity.ingest.file.created.v1',
      scheduleCron: undefined,
      scheduleTimezone: undefined,
      createdBy: 'user-1',
    });
    expect(JSON.parse(textOf(result)).id).toBe('wf-1');
  });

  it('create_workflow forwards trigger_fields to the action input', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { create: AutomationWorkflowActions['create'] }).create = action(
      'automation-workflow.create',
      'create_workflow',
      false,
      async (input) => {
        received = input;
        return workflow();
      },
    );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    await findTool(tools, 'create_workflow').call({
      name: 'Ingest to Slack',
      trigger_type: 'EVENT',
      trigger_fields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
    });

    expect(received).toMatchObject({
      triggerFields: [{ name: 'run_date', type: 'date', label: 'Run date', required: true }],
    });
  });

  it('update_workflow_trigger forwards trigger_fields to the action input', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { updateTrigger: AutomationWorkflowActions['updateTrigger'] }).updateTrigger =
      action(
        'automation-workflow.updateTrigger',
        'update_workflow_trigger',
        false,
        async (input) => {
          received = input;
          return workflow();
        },
      );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    await findTool(tools, 'update_workflow_trigger').call({
      workflow_id: 'wf-1',
      trigger_fields: [{ name: 'amount', type: 'number' }],
    });

    expect(received).toMatchObject({
      workflowId: 'wf-1',
      triggerFields: [{ name: 'amount', type: 'number' }],
    });
  });

  it('create_workflow fills in organization_id and created_by when the agent omits them — never asks for them', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { create: AutomationWorkflowActions['create'] }).create = action(
      'automation-workflow.create',
      'create_workflow',
      false,
      async (input) => {
        received = input;
        return workflow();
      },
    );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    const result = await findTool(tools, 'create_workflow').call({
      name: 'Daily report',
      trigger_type: 'SCHEDULE',
      schedule_cron: '0 7 * * *',
      schedule_timezone: 'UTC',
    });

    expect(result.isError).toBeFalsy();
    expect(received).toMatchObject({ organizationId: 'org-1', createdBy: 'user-1' });
  });

  it('cannot select another organization or creator from tool arguments', async () => {
    const ctx = context();
    const create = jest.spyOn(ctx.actions.create, 'run');
    const result = await findTool(buildAutomationWorkflowMcpTools(ctx), 'create_workflow').call({
      organization_id: 'org-other',
      created_by: 'other-user',
      name: 'Unauthorized workflow',
      trigger_type: 'EVENT',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('ORGANIZATION_ACCESS_DENIED');
    expect(create).not.toHaveBeenCalled();
  });

  it('add_workflow_step rejects a missing input_template', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'add_workflow_step').call({
      workflow_id: 'wf-1',
      agent_id: 'schema-extractor',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('input_template');
  });

  it('add_workflow_step rejects an input_template without a "message" key', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'add_workflow_step').call({
      workflow_id: 'wf-1',
      agent_id: 'schema-extractor',
      input_template: { data: '$.trigger.bucket', top_n: 10 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('message');
  });

  it('add_workflow_step rejects an input_template with an empty "message" value', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'add_workflow_step').call({
      workflow_id: 'wf-1',
      agent_id: 'schema-extractor',
      input_template: { message: '' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('message');
  });

  it('add_workflow_step forwards agent_id/input_template and returns the step JSON', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { addStep: AutomationWorkflowActions['addStep'] }).addStep = action(
      'automation-workflow.addStep',
      'add_workflow_step',
      false,
      async (input) => {
        received = input;
        return step();
      },
    );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    const result = await findTool(tools, 'add_workflow_step').call({
      workflow_id: 'wf-1',
      agent_id: 'schema-extractor',
      input_template: { message: '$.trigger.bucket' },
    });

    expect(received).toEqual({
      workflowId: 'wf-1',
      agentId: 'schema-extractor',
      inputTemplate: { message: '$.trigger.bucket' },
      systemPrompt: undefined,
    });
    expect(JSON.parse(textOf(result)).agentId).toBe('schema-extractor');
  });

  it('add_workflow_step forwards an optional system_prompt as camelCase systemPrompt', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { addStep: AutomationWorkflowActions['addStep'] }).addStep = action(
      'automation-workflow.addStep',
      'add_workflow_step',
      false,
      async (input) => {
        received = input;
        return step();
      },
    );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    await findTool(tools, 'add_workflow_step').call({
      workflow_id: 'wf-1',
      agent_id: 'schema-extractor',
      input_template: { message: '$.trigger.bucket' },
      system_prompt: 'You are a terse schema critic.',
    });

    expect(received).toMatchObject({ systemPrompt: 'You are a terse schema critic.' });
  });

  it('get_workflow rejects a missing workflow_id', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'get_workflow').call({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('workflow_id');
  });

  it('get_workflow returns the workflow with its steps', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'get_workflow').call({ workflow_id: 'wf-1' });
    const parsed = JSON.parse(textOf(result));
    expect(parsed.id).toBe('wf-1');
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0].agentId).toBe('schema-extractor');
  });

  it('get_workflow reports an error when the workflow does not exist', async () => {
    const ctx = context();
    (ctx.actions as { getWorkflow: AutomationWorkflowActions['getWorkflow'] }).getWorkflow = action(
      'automation-workflow.getWorkflow',
      'get_workflow',
      false,
      async () => undefined,
    );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    const result = await findTool(tools, 'get_workflow').call({ workflow_id: 'missing' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('missing');
  });

  it('update_workflow_step rejects a missing step_id', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'update_workflow_step').call({ workflow_id: 'wf-1' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('step_id');
  });

  it('update_workflow_step forwards only the provided patch fields and returns the step JSON', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { updateStep: AutomationWorkflowActions['updateStep'] }).updateStep = action(
      'automation-workflow.updateStep',
      'update_workflow_step',
      false,
      async (input) => {
        received = input;
        return step({ agentId: 'summarizer' });
      },
    );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    const result = await findTool(tools, 'update_workflow_step').call({
      workflow_id: 'wf-1',
      step_id: 'step-1',
      agent_id: 'summarizer',
    });

    expect(received).toEqual({
      workflowId: 'wf-1',
      stepId: 'step-1',
      agentId: 'summarizer',
      inputTemplate: undefined,
      systemPrompt: undefined,
    });
    expect(JSON.parse(textOf(result)).agentId).toBe('summarizer');
  });

  it('update_workflow_step forwards an optional system_prompt as camelCase systemPrompt', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { updateStep: AutomationWorkflowActions['updateStep'] }).updateStep = action(
      'automation-workflow.updateStep',
      'update_workflow_step',
      false,
      async (input) => {
        received = input;
        return step();
      },
    );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    await findTool(tools, 'update_workflow_step').call({
      workflow_id: 'wf-1',
      step_id: 'step-1',
      system_prompt: 'You are a blunt editor.',
    });

    expect(received).toMatchObject({ systemPrompt: 'You are a blunt editor.' });
  });

  it('update_workflow_step rejects an input_template without a "message" key', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'update_workflow_step').call({
      workflow_id: 'wf-1',
      step_id: 'step-1',
      input_template: { date: '$.trigger.run_date', fetch: 'auto_discover' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('message');
  });

  it('update_workflow_trigger rejects an invalid trigger_type', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'update_workflow_trigger').call({
      workflow_id: 'wf-1',
      trigger_type: 'NOT_A_TYPE',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('trigger_type');
  });

  it('update_workflow_trigger forwards only the provided patch fields', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { updateTrigger: AutomationWorkflowActions['updateTrigger'] }).updateTrigger =
      action(
        'automation-workflow.updateTrigger',
        'update_workflow_trigger',
        false,
        async (input) => {
          received = input;
          return workflow({
            triggerType: 'SCHEDULE',
            scheduleCron: '0 8 * * *',
            scheduleTimezone: 'America/Los_Angeles',
          });
        },
      );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    const result = await findTool(tools, 'update_workflow_trigger').call({
      workflow_id: 'wf-1',
      trigger_type: 'SCHEDULE',
      schedule_cron: '0 8 * * *',
      schedule_timezone: 'America/Los_Angeles',
    });

    expect(received).toEqual({
      workflowId: 'wf-1',
      triggerType: 'SCHEDULE',
      eventTopic: undefined,
      scheduleCron: '0 8 * * *',
      scheduleTimezone: 'America/Los_Angeles',
    });
    expect(JSON.parse(textOf(result)).triggerType).toBe('SCHEDULE');
  });

  it('remove_workflow_step forwards the rationale and reports pending_approval without throwing', async () => {
    const ctx = context();
    const tools = buildAutomationWorkflowMcpTools(ctx);
    (ctx.pendingActions.propose as jest.Mock).mockResolvedValue({ id: 'pending-1' });

    const result = await findTool(tools, 'remove_workflow_step').call({
      workflow_id: 'wf-1',
      step_id: 'step-1',
      rationale: 'user asked to drop the Slack notification step',
    });

    expect(result.isError).toBeFalsy();
    expect(ctx.pendingActions.propose).toHaveBeenCalledWith(
      'automation-workflow.removeStep',
      { workflowId: 'wf-1', stepId: 'step-1' },
      expect.objectContaining({ source: 'agent' }),
      'user asked to drop the Slack notification step',
    );
    expect(textOf(result)).toContain('pending-1');
  });

  it('enable_workflow forwards enabled and returns the updated workflow JSON', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'enable_workflow').call({
      workflow_id: 'wf-1',
      enabled: true,
    });
    expect(JSON.parse(textOf(result)).status).toBe('enabled');
  });

  it('test_fire_workflow forwards payload and optional force_fail_at_step', async () => {
    const ctx = context();
    let received: unknown;
    (ctx.actions as { testFire: AutomationWorkflowActions['testFire'] }).testFire = action(
      'automation-workflow.testFire',
      'test_fire_workflow',
      false,
      async (input) => {
        received = input;
        return { runId: 'run-1' };
      },
    );
    const tools = buildAutomationWorkflowMcpTools(ctx);

    await findTool(tools, 'test_fire_workflow').call({
      workflow_id: 'wf-1',
      payload: { bucket: 'ingest-bucket' },
      force_fail_at_step: 2,
    });

    expect(received).toEqual({
      workflowId: 'wf-1',
      payload: { bucket: 'ingest-bucket' },
      forceFailAtStep: 2,
    });
  });

  it('rejects an unknown required argument type without throwing', async () => {
    const tools = buildAutomationWorkflowMcpTools(context());
    const result = await findTool(tools, 'enable_workflow').call({ workflow_id: 'wf-1' });
    expect(result.isError).toBe(true);
  });
});
