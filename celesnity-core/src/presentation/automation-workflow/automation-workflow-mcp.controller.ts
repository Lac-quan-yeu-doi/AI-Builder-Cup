import { Controller, Inject, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import { ACTION_AUDIT_LOG } from '@application/actions/tokens';
import { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import {
  AUTOMATION_WORKFLOW_ACTIONS,
  type AutomationWorkflowActions,
} from '@application/automation-workflow/automation-workflow.actions';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { McpAuthenticationGuard } from '@presentation/mcp/mcp-authentication.guard';
import { McpController } from '@presentation/mcp/mcp-controller.base';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { buildAutomationWorkflowMcpTools } from './automation-workflow-mcp-tools';
import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { Permission } from '@application/administration/authorization-policy';
import { MCP_SERVER_FEATURES } from '@application/administration/mcp-operation-policy';

const APPROVAL_OVERRIDE_HEADER = 'x-action-approval-overrides';
const ROOM_ID_META_KEY = 'com.celesnity/room-id';
const CALLER_SUBJECT_META_KEY = 'com.celesnity/caller-subject';

/**
 * MCP-over-HTTP endpoint for automation-workflow editing tools. Agent-only —
 * `@MachineAuthenticated()` skips the global human-auth guards in favor of
 * `McpAuthenticationGuard`, same pattern as `ChartMcpController`.
 */
@Controller('automation-workflow-mcp')
@MachineAuthenticated()
@UseGuards(McpAuthenticationGuard)
export class AutomationWorkflowMcpController extends McpController {
  protected readonly serverName = 'mcp-automation-workflow';
  protected readonly instructions =
    'Automation-workflow editing tools: get_workflow, list_available_agents, add_workflow_step, ' +
    'update_workflow_step, remove_workflow_step (requires human approval), enable_workflow, ' +
    'test_fire_workflow, create_workflow, update_workflow_trigger. A workflow is a linear chain of ' +
    'steps, not a graph. Call get_workflow and list_available_agents first — only propose steps ' +
    'using an agent_id that list_available_agents actually returned.';

  public constructor(
    @Inject(AUTOMATION_WORKFLOW_ACTIONS) private readonly actions: AutomationWorkflowActions,
    @Inject(ACTION_AUDIT_LOG) private readonly auditLog: IActionAuditLog,
    private readonly pendingActions: PendingActionUseCases,
    private readonly authenticatedContexts: AuthenticatedContextStore,
    private readonly delegation: AgentRoomDelegationService,
  ) {
    super();
  }

  protected buildTools(req: Request): readonly McpToolHandler[] {
    return buildAutomationWorkflowMcpTools({
      actions: this.actions,
      auditLog: this.auditLog,
      pendingActions: this.pendingActions,
      approvalOverridesHeader: firstHeader(req.headers[APPROVAL_OVERRIDE_HEADER]),
      authenticatedContexts: this.authenticatedContexts,
    });
  }

  protected override runToolCall(
    meta: RequestMeta | undefined,
    call: () => Promise<CallToolResult>,
    permission: Permission = 'workspace:read',
    requestId?: string,
    workloadEmail?: string,
  ): Promise<CallToolResult> {
    const roomId = meta?.[ROOM_ID_META_KEY];
    const callerSubject = meta?.[CALLER_SUBJECT_META_KEY];
    if (
      typeof roomId !== 'string' ||
      roomId.trim().length === 0 ||
      typeof callerSubject !== 'string' ||
      callerSubject.trim().length === 0
    ) {
      return Promise.reject(new Error('Trusted MCP room delegation metadata is required.'));
    }
    return this.delegation.runForFeature(
      roomId,
      callerSubject,
      MCP_SERVER_FEATURES['mcp-automation-workflow'],
      call,
      permission,
      typeof meta?.['com.minder/agent'] === 'string' ? meta['com.minder/agent'] : undefined,
      typeof meta?.['com.celesnity/authorization-run-id'] === 'string' ? meta['com.celesnity/authorization-run-id'] : undefined,
      requestId,
      workloadEmail,
    );
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
