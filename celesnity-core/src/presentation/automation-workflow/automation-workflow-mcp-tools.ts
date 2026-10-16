import type { ActionActor, ActionDefinition } from '@application/actions/action.types';
import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import type { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import { buildMcpCatalog, type McpToolCatalogEntry } from '@application/actions/mcp-catalog';
import type { AutomationWorkflowActions } from '@application/automation-workflow/automation-workflow.actions';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { approvalOverrideFromRawHeader } from '@presentation/http/action-approval-override';
import { runAction, unwrapCompleted, type RunActionResult } from '@presentation/http/run-action';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { toInputSchema, toolError, toolResult } from '@presentation/mcp/mcp-tool-server';
import {
  AutomationWorkflowResponseDto,
  AutomationWorkflowStepResponseDto,
} from '@presentation/automation-workflow/automation-workflow.dto';

/** Everything one open MCP session needs to dispatch an automation-workflow tool call. */
export interface AutomationWorkflowMcpContext {
  readonly actions: AutomationWorkflowActions;
  readonly auditLog: IActionAuditLog;
  readonly pendingActions: PendingActionUseCases;
  /** Raw `X-Action-Approval-Overrides` header value — see `chart-mcp-tools.ts`'s identical field. */
  readonly approvalOverridesHeader: string | undefined;
  readonly authenticatedContexts: AuthenticatedContextStore;
}

/**
 * MCP tool handlers wrapping `AutomationWorkflowActions`. Unlike `chart-mcp-tools.ts`,
 * there is no `run_action_chain` here — nothing in this domain needs atomic
 * multi-step composition (see the plan's Global Constraints).
 */
export function buildAutomationWorkflowMcpTools(
  context: AutomationWorkflowMcpContext,
): readonly McpToolHandler[] {
  const catalog = buildMcpCatalog(
    context.actions as unknown as Record<string, ActionDefinition<unknown, unknown>>,
  );
  const byAction = new Map(catalog.map((entry) => [entry.action_name, entry]));

  return [
    handler(byAction, 'automation-workflow.create', (args) => handleCreate(args, context)),
    handler(byAction, 'automation-workflow.addStep', (args) => handleAddStep(args, context)),
    handler(byAction, 'automation-workflow.removeStep', (args) => handleRemoveStep(args, context)),
    handler(byAction, 'automation-workflow.updateStep', (args) => handleUpdateStep(args, context)),
    handler(byAction, 'automation-workflow.getWorkflow', (args) =>
      handleGetWorkflow(args, context),
    ),
    handler(byAction, 'automation-workflow.listAvailableAgents', (args) =>
      handleListAvailableAgents(args, context),
    ),
    handler(byAction, 'automation-workflow.updateTrigger', (args) =>
      handleUpdateTrigger(args, context),
    ),
    handler(byAction, 'automation-workflow.setEnabled', (args) => handleSetEnabled(args, context)),
    handler(byAction, 'automation-workflow.testFire', (args) => handleTestFire(args, context)),
  ];
}

function handler(
  byAction: ReadonlyMap<string, McpToolCatalogEntry>,
  actionName: string,
  call: McpToolHandler['call'],
): McpToolHandler {
  const entry = byAction.get(actionName);
  if (entry === undefined) {
    throw new Error(
      `automation-workflow MCP catalog is missing "${actionName}" — actions/catalog drifted.`,
    );
  }
  return {
    tool: {
      name: entry.tool_name,
      description: entry.description,
      inputSchema: toInputSchema(entry.input_schema),
    },
    call,
  };
}

async function handleCreate(
  args: Record<string, unknown>,
  ctx: AutomationWorkflowMcpContext,
): Promise<CallToolResult> {
  const principal = ctx.authenticatedContexts.require();
  const requestedOrganizationId = requireString(args, 'organization_id');
  if (requestedOrganizationId !== undefined && requestedOrganizationId !== principal.organizationId)
    return toolError('ORGANIZATION_ACCESS_DENIED: organization does not match the verified caller');
  const organizationId = principal.organizationId;
  const name = requireString(args, 'name');
  if (name === undefined) return toolError('Missing required argument: name');
  const triggerType = requireString(args, 'trigger_type');
  if (triggerType !== 'EVENT' && triggerType !== 'SCHEDULE') {
    return toolError(
      'Missing or invalid required argument: trigger_type (must be EVENT or SCHEDULE)',
    );
  }
  const createdBy = principal.identityId;

  const result = await runAction(
    ctx.actions.create,
    {
      organizationId,
      name,
      triggerType,
      eventTopic: optionalString(args, 'event_topic'),
      scheduleCron: optionalString(args, 'schedule_cron'),
      scheduleTimezone: optionalString(args, 'schedule_timezone'),
      triggerFields: optionalArray(args, 'trigger_fields') as never,
      createdBy,
    },
    agentActorFrom(args),
    ctx.auditLog,
    ctx.pendingActions,
    undefined,
    approvalOverrideFor(ctx, 'automation-workflow.create'),
  );
  return toolResult(
    mutationResultToJson(result, (value) => AutomationWorkflowResponseDto.from(value, [])),
  );
}

async function handleAddStep(
  args: Record<string, unknown>,
  ctx: AutomationWorkflowMcpContext,
): Promise<CallToolResult> {
  const workflowId = requireString(args, 'workflow_id');
  if (workflowId === undefined) return toolError('Missing required argument: workflow_id');
  const agentId = requireString(args, 'agent_id');
  if (agentId === undefined) return toolError('Missing required argument: agent_id');
  const inputTemplate = args.input_template;
  if (!isPlainObject(inputTemplate)) return toolError('Missing required argument: input_template');
  if (!hasNonEmptyMessage(inputTemplate)) return toolError(MESSAGE_KEY_ERROR);

  const result = await runAction(
    ctx.actions.addStep,
    {
      workflowId,
      agentId,
      inputTemplate: inputTemplate as Record<string, string>,
      systemPrompt: optionalString(args, 'system_prompt'),
    },
    agentActorFrom(args),
    ctx.auditLog,
    ctx.pendingActions,
    undefined,
    approvalOverrideFor(ctx, 'automation-workflow.addStep'),
  );
  return toolResult(
    mutationResultToJson(result, (value) => AutomationWorkflowStepResponseDto.from(value)),
  );
}

async function handleRemoveStep(
  args: Record<string, unknown>,
  ctx: AutomationWorkflowMcpContext,
): Promise<CallToolResult> {
  const workflowId = requireString(args, 'workflow_id');
  if (workflowId === undefined) return toolError('Missing required argument: workflow_id');
  const stepId = requireString(args, 'step_id');
  if (stepId === undefined) return toolError('Missing required argument: step_id');

  const result = await runAction(
    ctx.actions.removeStep,
    { workflowId, stepId },
    agentActorFrom(args),
    ctx.auditLog,
    ctx.pendingActions,
    optionalString(args, 'rationale'),
    approvalOverrideFor(ctx, 'automation-workflow.removeStep'),
  );
  if (result.kind === 'pending_approval') {
    return toolResult(
      `Step ${stepId} removal is pending approval (id: ${result.pendingActionId}).`,
    );
  }
  return toolResult(`Step ${stepId} removed successfully.`);
}

async function handleSetEnabled(
  args: Record<string, unknown>,
  ctx: AutomationWorkflowMcpContext,
): Promise<CallToolResult> {
  const workflowId = requireString(args, 'workflow_id');
  if (workflowId === undefined) return toolError('Missing required argument: workflow_id');
  const enabled = args.enabled;
  if (typeof enabled !== 'boolean') return toolError('Missing required argument: enabled');

  const result = await runAction(
    ctx.actions.setEnabled,
    { workflowId, enabled },
    agentActorFrom(args),
    ctx.auditLog,
    ctx.pendingActions,
    undefined,
    approvalOverrideFor(ctx, 'automation-workflow.setEnabled'),
  );
  // Steps aren't part of what changed here, and the caller already knows
  // them from earlier in the conversation — omitted rather than faked as
  // `[]` through `AutomationWorkflowResponseDto`, which would misrepresent a
  // workflow that already has steps as freshly empty.
  return toolResult(
    mutationResultToJson(result, (value) => ({
      id: value.id,
      name: value.name,
      status: value.status,
      triggerType: value.triggerType,
    })),
  );
}

async function handleTestFire(
  args: Record<string, unknown>,
  ctx: AutomationWorkflowMcpContext,
): Promise<CallToolResult> {
  const workflowId = requireString(args, 'workflow_id');
  if (workflowId === undefined) return toolError('Missing required argument: workflow_id');
  const payload = args.payload;
  if (!isPlainObject(payload)) return toolError('Missing required argument: payload');

  const result = await runAction(
    ctx.actions.testFire,
    {
      workflowId,
      payload,
      forceFailAtStep: optionalInteger(args, 'force_fail_at_step'),
    },
    agentActorFrom(args),
    ctx.auditLog,
    ctx.pendingActions,
    undefined,
    approvalOverrideFor(ctx, 'automation-workflow.testFire'),
  );
  return toolResult(mutationResultToJson(result, (value) => value));
}

async function handleUpdateStep(
  args: Record<string, unknown>,
  ctx: AutomationWorkflowMcpContext,
): Promise<CallToolResult> {
  const workflowId = requireString(args, 'workflow_id');
  if (workflowId === undefined) return toolError('Missing required argument: workflow_id');
  const stepId = requireString(args, 'step_id');
  if (stepId === undefined) return toolError('Missing required argument: step_id');
  const inputTemplate = args.input_template;
  if (inputTemplate !== undefined && !isPlainObject(inputTemplate)) {
    return toolError('input_template must be an object when provided');
  }
  if (inputTemplate !== undefined && !hasNonEmptyMessage(inputTemplate)) {
    return toolError(MESSAGE_KEY_ERROR);
  }

  const result = await runAction(
    ctx.actions.updateStep,
    {
      workflowId,
      stepId,
      agentId: optionalString(args, 'agent_id'),
      inputTemplate: inputTemplate as Record<string, string> | undefined,
      systemPrompt: optionalString(args, 'system_prompt'),
    },
    agentActorFrom(args),
    ctx.auditLog,
    ctx.pendingActions,
    undefined,
    approvalOverrideFor(ctx, 'automation-workflow.updateStep'),
  );
  return toolResult(
    mutationResultToJson(result, (value) => AutomationWorkflowStepResponseDto.from(value)),
  );
}

async function handleGetWorkflow(
  args: Record<string, unknown>,
  ctx: AutomationWorkflowMcpContext,
): Promise<CallToolResult> {
  const workflowId = requireString(args, 'workflow_id');
  if (workflowId === undefined) return toolError('Missing required argument: workflow_id');

  const result = await runAction(
    ctx.actions.getWorkflow,
    { workflowId },
    agentActorFrom(args),
    ctx.auditLog,
    ctx.pendingActions,
  );
  const found = unwrapCompleted(result);
  if (found === undefined) return toolError(`Automation workflow ${workflowId} not found`);
  return toolResult(
    JSON.stringify(AutomationWorkflowResponseDto.from(found.workflow, found.steps), null, 2),
  );
}

async function handleUpdateTrigger(
  args: Record<string, unknown>,
  ctx: AutomationWorkflowMcpContext,
): Promise<CallToolResult> {
  const workflowId = requireString(args, 'workflow_id');
  if (workflowId === undefined) return toolError('Missing required argument: workflow_id');
  const triggerTypeRaw = optionalString(args, 'trigger_type');
  if (triggerTypeRaw !== undefined && triggerTypeRaw !== 'EVENT' && triggerTypeRaw !== 'SCHEDULE') {
    return toolError('trigger_type must be EVENT or SCHEDULE when provided');
  }

  const result = await runAction(
    ctx.actions.updateTrigger,
    {
      workflowId,
      triggerType: triggerTypeRaw,
      eventTopic: optionalString(args, 'event_topic'),
      scheduleCron: optionalString(args, 'schedule_cron'),
      scheduleTimezone: optionalString(args, 'schedule_timezone'),
      triggerFields: optionalArray(args, 'trigger_fields') as never,
    },
    agentActorFrom(args),
    ctx.auditLog,
    ctx.pendingActions,
    undefined,
    approvalOverrideFor(ctx, 'automation-workflow.updateTrigger'),
  );
  // Steps aren't part of what changed here — omitted rather than faked as
  // `[]` through AutomationWorkflowResponseDto, which would misrepresent a
  // workflow that already has steps as freshly empty (same reasoning as
  // handleSetEnabled, just above).
  return toolResult(
    mutationResultToJson(result, (value) => ({
      id: value.id,
      name: value.name,
      status: value.status,
      triggerType: value.triggerType,
      eventTopic: value.eventTopic,
      scheduleCron: value.scheduleCron,
      scheduleTimezone: value.scheduleTimezone,
    })),
  );
}

async function handleListAvailableAgents(
  _args: Record<string, unknown>,
  ctx: AutomationWorkflowMcpContext,
): Promise<CallToolResult> {
  const result = await runAction(
    ctx.actions.listAvailableAgents,
    {},
    agentActorFrom(_args),
    ctx.auditLog,
    ctx.pendingActions,
  );
  return toolResult(mutationResultToJson(result, (value) => value));
}

// --- shared helpers ---

function agentActorFrom(args: Record<string, unknown>): ActionActor {
  // The run ID is a correlation hint only; the authorization boundary is the
  // registered Core context installed by AgentRoomDelegationService.
  return { source: 'agent', runId: optionalString(args, 'run_id') ?? null, identityId: null };
}

function approvalOverrideFor(
  ctx: AutomationWorkflowMcpContext,
  actionName: string,
): boolean | undefined {
  return approvalOverrideFromRawHeader(ctx.approvalOverridesHeader, actionName);
}

function mutationResultToJson<TOutput>(
  result: RunActionResult<TOutput>,
  toJson: (value: TOutput) => unknown,
): string {
  if (result.kind === 'pending_approval') {
    return JSON.stringify(
      { status: 'pending_approval', pending_action_id: result.pendingActionId },
      null,
      2,
    );
  }
  return JSON.stringify(toJson(unwrapCompleted(result)), null, 2);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const MESSAGE_KEY_ERROR =
  'input_template must include a non-empty "message" key — the workflow executor only ever reads that one field from a step\'s input, and silently ignores every other key. Fold the whole task into "message" instead of splitting it across other field names.';

/** The dispatcher only ever reads `input_template.message` — every other key is dead weight, so reject it here instead of letting the step fail silently at run time. */
function hasNonEmptyMessage(inputTemplate: Record<string, unknown>): boolean {
  const message = inputTemplate.message;
  return typeof message === 'string' && message.length > 0;
}

function requireString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  return requireString(args, key);
}

function optionalInteger(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' ? value : undefined;
}

function optionalArray(args: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = args[key];
  return Array.isArray(value) ? value : undefined;
}
