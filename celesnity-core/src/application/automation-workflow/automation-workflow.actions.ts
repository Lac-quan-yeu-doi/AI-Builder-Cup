import type { ActionDefinition } from '@application/actions/action.types';
import type { ActionPolicyOverrides } from '@application/actions/action-policy';
import type { CreateAutomationWorkflowInput } from '@application/automation-workflow/interfaces/i-automation-workflow.repository';
import type {
  AutomationWorkflow,
  AutomationWorkflowTriggerType,
  AutomationWorkflowTriggerField,
} from '@domain/automation-workflow/models/automation-workflow';
import type { AutomationWorkflowStep } from '@domain/automation-workflow/models/automation-workflow-step';
import type { AvailableAgent } from '@application/automation/interfaces/i-agent-webhook-client';
import type { AutomationWorkflowUseCases } from './automation-workflow.use-cases';

export const AUTOMATION_WORKFLOW_ACTIONS = Symbol('AutomationWorkflowActions');

export interface AutomationWorkflowActions {
  readonly create: ActionDefinition<CreateAutomationWorkflowInput, AutomationWorkflow>;
  readonly addStep: ActionDefinition<
    {
      workflowId: string;
      agentId: string;
      inputTemplate: Readonly<Record<string, string>>;
      systemPrompt?: string;
    },
    AutomationWorkflowStep
  >;
  readonly removeStep: ActionDefinition<
    { workflowId: string; stepId: string; rationale?: string },
    void
  >;
  readonly updateStep: ActionDefinition<
    {
      workflowId: string;
      stepId: string;
      agentId?: string;
      inputTemplate?: Readonly<Record<string, string>>;
      systemPrompt?: string;
    },
    AutomationWorkflowStep
  >;
  readonly getWorkflow: ActionDefinition<
    { workflowId: string },
    { workflow: AutomationWorkflow; steps: readonly AutomationWorkflowStep[] } | undefined
  >;
  readonly listAvailableAgents: ActionDefinition<Record<string, never>, readonly AvailableAgent[]>;
  readonly updateTrigger: ActionDefinition<
    {
      workflowId: string;
      triggerType?: AutomationWorkflowTriggerType;
      eventTopic?: string;
      scheduleCron?: string;
      scheduleTimezone?: string;
      triggerFields?: readonly AutomationWorkflowTriggerField[];
    },
    AutomationWorkflow
  >;
  readonly setEnabled: ActionDefinition<
    { workflowId: string; enabled: boolean },
    AutomationWorkflow
  >;
  readonly testFire: ActionDefinition<
    { workflowId: string; payload: Record<string, unknown>; forceFailAtStep?: number },
    unknown
  >;
}

function resolved(
  name: string,
  field: 'approvalRequired' | 'auditRequired',
  codeDefault: boolean,
  policy: ActionPolicyOverrides,
): boolean {
  return policy[name]?.[field] ?? codeDefault;
}

/** Mirrors automation.actions.ts exactly — same audit-everything, approve-only-the-destructive-op policy. */
export function buildAutomationWorkflowActions(
  useCases: AutomationWorkflowUseCases,
  policy: ActionPolicyOverrides = {},
): AutomationWorkflowActions {
  return {
    create: {
      name: 'automation-workflow.create',
      permission: 'write',
      auditRequired: resolved('automation-workflow.create', 'auditRequired', true, policy),
      approvalRequired: resolved('automation-workflow.create', 'approvalRequired', false, policy),
      mcpTool: {
        name: 'create_workflow',
        description:
          'Create a new multi-step automation workflow (event-triggered or scheduled), with no steps yet.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            trigger_type: { type: 'string', enum: ['EVENT', 'SCHEDULE'] },
            event_topic: { type: 'string' },
            schedule_cron: { type: 'string' },
            schedule_timezone: { type: 'string' },
            trigger_fields: {
              type: 'array',
              description:
                'Declare one typed field per distinct $.trigger.* reference used by steps; type is one of text|number|date|datetime|boolean.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['text', 'number', 'date', 'datetime', 'boolean'] },
                  label: { type: 'string' },
                  required: { type: 'boolean' },
                },
                required: ['name', 'type'],
              },
            },
            organization_id: {
              type: 'string',
              description: 'Omit — filled in automatically. Never ask the user for this.',
            },
            created_by: {
              type: 'string',
              description: 'Omit — filled in automatically. Never ask the user for this.',
            },
          },
          required: ['name', 'trigger_type'],
        },
      },
      run: (input) => useCases.createWorkflow(input),
    },
    addStep: {
      name: 'automation-workflow.addStep',
      permission: 'write',
      auditRequired: resolved('automation-workflow.addStep', 'auditRequired', true, policy),
      approvalRequired: resolved('automation-workflow.addStep', 'approvalRequired', false, policy),
      mcpTool: {
        name: 'add_workflow_step',
        description:
          'Append a step to a workflow’s chain. Propose this via the plan-review flow before calling it, so the human sees the agent and mapping before it’s created.',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'string' },
            agent_id: { type: 'string' },
            input_template: {
              type: 'object',
              description:
                'Map of input field to literal value or "$."-prefixed path, e.g. "$.trigger.bucket" or "$.step1.output".',
            },
            system_prompt: {
              type: 'string',
              description:
                "Optional per-step system prompt/persona override — replaces the agent's default system prompt for just this step, so one agent can play a different role per step.",
            },
          },
          required: ['workflow_id', 'agent_id', 'input_template'],
        },
      },
      run: ({ workflowId, agentId, inputTemplate, systemPrompt }) =>
        useCases.addStep(workflowId, agentId, inputTemplate, systemPrompt),
    },
    removeStep: {
      name: 'automation-workflow.removeStep',
      permission: 'write',
      auditRequired: resolved('automation-workflow.removeStep', 'auditRequired', true, policy),
      approvalRequired: resolved(
        'automation-workflow.removeStep',
        'approvalRequired',
        true,
        policy,
      ),
      mcpTool: {
        name: 'remove_workflow_step',
        description:
          'Propose removing a step from a workflow. Requires human approval — returns a pending-action id rather than removing immediately.',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'string' },
            step_id: { type: 'string' },
            rationale: {
              type: 'string',
              description:
                'Why you are proposing this removal — shown to the human who approves or rejects it.',
            },
          },
          required: ['workflow_id', 'step_id'],
        },
      },
      run: ({ stepId }) => useCases.removeStep(stepId),
    },
    updateStep: {
      name: 'automation-workflow.updateStep',
      permission: 'write',
      auditRequired: resolved('automation-workflow.updateStep', 'auditRequired', true, policy),
      approvalRequired: resolved(
        'automation-workflow.updateStep',
        'approvalRequired',
        false,
        policy,
      ),
      mcpTool: {
        name: 'update_workflow_step',
        description:
          'Edit an existing step’s agent and/or input mapping. Applies immediately — unlike removing a step, this does not require human approval by default.',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'string' },
            step_id: { type: 'string' },
            agent_id: { type: 'string' },
            input_template: {
              type: 'object',
              description:
                'Map of input field to literal value or "$."-prefixed path. Replaces the step’s entire input_template when provided.',
            },
            system_prompt: {
              type: 'string',
              description:
                "Optional per-step system prompt/persona override — replaces the agent's default system prompt for just this step, so one agent can play a different role per step.",
            },
          },
          required: ['workflow_id', 'step_id'],
        },
      },
      run: ({ stepId, agentId, inputTemplate, systemPrompt }) =>
        useCases.updateStep(stepId, { agentId, inputTemplate, systemPrompt }),
    },
    getWorkflow: {
      name: 'automation-workflow.getWorkflow',
      permission: 'read',
      auditRequired: resolved('automation-workflow.getWorkflow', 'auditRequired', false, policy),
      approvalRequired: resolved(
        'automation-workflow.getWorkflow',
        'approvalRequired',
        false,
        policy,
      ),
      mcpTool: {
        name: 'get_workflow',
        description:
          'Get a single automation workflow by id, including its ordered list of steps (id, agent, input mapping). Use this before proposing edits so you know what already exists.',
        inputSchema: {
          type: 'object',
          properties: { workflow_id: { type: 'string' } },
          required: ['workflow_id'],
        },
      },
      run: ({ workflowId }) => useCases.getWorkflow(workflowId),
    },
    listAvailableAgents: {
      name: 'automation-workflow.listAvailableAgents',
      permission: 'read',
      auditRequired: resolved(
        'automation-workflow.listAvailableAgents',
        'auditRequired',
        false,
        policy,
      ),
      approvalRequired: resolved(
        'automation-workflow.listAvailableAgents',
        'approvalRequired',
        false,
        policy,
      ),
      mcpTool: {
        name: 'list_available_agents',
        description:
          'List real, currently registered agents that can run as a workflow step. Only propose a step whose agent_id appears in this list — never invent one.',
        inputSchema: { type: 'object', properties: {} },
      },
      run: () => useCases.listAvailableAgents(),
    },
    updateTrigger: {
      name: 'automation-workflow.updateTrigger',
      permission: 'write',
      auditRequired: resolved('automation-workflow.updateTrigger', 'auditRequired', true, policy),
      approvalRequired: resolved(
        'automation-workflow.updateTrigger',
        'approvalRequired',
        false,
        policy,
      ),
      mcpTool: {
        name: 'update_workflow_trigger',
        description:
          'Change an existing workflow’s trigger — switch between EVENT and SCHEDULE, or update the event topic / cron schedule / timezone. Applies immediately.',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'string' },
            trigger_type: { type: 'string', enum: ['EVENT', 'SCHEDULE'] },
            event_topic: { type: 'string' },
            schedule_cron: { type: 'string' },
            schedule_timezone: { type: 'string' },
            trigger_fields: {
              type: 'array',
              description:
                'Declare one typed field per distinct $.trigger.* reference used by steps; type is one of text|number|date|datetime|boolean.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['text', 'number', 'date', 'datetime', 'boolean'] },
                  label: { type: 'string' },
                  required: { type: 'boolean' },
                },
                required: ['name', 'type'],
              },
            },
          },
          required: ['workflow_id'],
        },
      },
      run: ({
        workflowId,
        triggerType,
        eventTopic,
        scheduleCron,
        scheduleTimezone,
        triggerFields,
      }) =>
        useCases.updateTrigger(workflowId, {
          triggerType,
          eventTopic,
          scheduleCron,
          scheduleTimezone,
          triggerFields,
        }),
    },
    setEnabled: {
      name: 'automation-workflow.setEnabled',
      permission: 'write',
      auditRequired: resolved('automation-workflow.setEnabled', 'auditRequired', true, policy),
      approvalRequired: resolved(
        'automation-workflow.setEnabled',
        'approvalRequired',
        false,
        policy,
      ),
      mcpTool: {
        name: 'enable_workflow',
        description: 'Enable or disable an existing automation workflow.',
        inputSchema: {
          type: 'object',
          properties: { workflow_id: { type: 'string' }, enabled: { type: 'boolean' } },
          required: ['workflow_id', 'enabled'],
        },
      },
      run: ({ workflowId, enabled }) => useCases.setEnabled(workflowId, enabled),
    },
    testFire: {
      name: 'automation-workflow.testFire',
      permission: 'write',
      auditRequired: resolved('automation-workflow.testFire', 'auditRequired', true, policy),
      approvalRequired: resolved('automation-workflow.testFire', 'approvalRequired', false, policy),
      mcpTool: {
        name: 'test_fire_workflow',
        description:
          'Manually run a workflow’s full chain with a sample payload, for real — the same side effects as a production trigger.',
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'string' },
            payload: { type: 'object' },
            force_fail_at_step: {
              type: 'number',
              description:
                'Debug only: make this 1-based step fail without dispatching it, to rehearse the retry path.',
            },
          },
          required: ['workflow_id', 'payload'],
        },
      },
      run: ({ workflowId, payload, forceFailAtStep }) =>
        useCases.testFireWorkflow(workflowId, payload, forceFailAtStep),
    },
  };
}
