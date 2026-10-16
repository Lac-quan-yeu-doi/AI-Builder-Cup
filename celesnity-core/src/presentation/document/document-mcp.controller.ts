import { Controller, Inject, Optional, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';
import { ACTION_AUDIT_LOG } from '@application/actions/tokens';
import { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import { DOCUMENT_ACTIONS, type DocumentActions } from '@application/document/document.actions';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { McpAuthenticationGuard } from '@presentation/mcp/mcp-authentication.guard';
import { McpController } from '@presentation/mcp/mcp-controller.base';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { buildDocumentMcpTools } from './document-mcp-tools';
import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { AutomationChartPreviewStore } from '@application/chart/automation-chart-preview.store';
import type { Permission } from '@application/administration/authorization-policy';
import { MCP_SERVER_FEATURES } from '@application/administration/mcp-operation-policy';

const APPROVAL_OVERRIDE_HEADER = 'x-action-approval-overrides';
const ROOM_ID_META_KEY = 'com.celesnity/room-id';
const CALLER_SUBJECT_META_KEY = 'com.celesnity/caller-subject';
const AUTOMATION_RUN_ID_META_KEY = 'com.celesnity/automation-run-id';
const AUTOMATION_ORGANIZATION_ID_META_KEY = 'com.celesnity/automation-organization-id';

/**
 * MCP-over-HTTP endpoint for document tools — replaces the `mcp-document`
 * Rust binary. Agent-only (no human caller), so `@MachineAuthenticated()`
 * skips the global human-auth guards entirely in favor of
 * `McpAuthenticationGuard`, same pattern `ChartAgentAuthGuard` documents for
 * `MessageBlockController`.
 */
@Controller('document-mcp')
@MachineAuthenticated()
@UseGuards(McpAuthenticationGuard)
export class DocumentMcpController extends McpController {
  protected readonly serverName = 'mcp-document';
  protected readonly instructions =
    'Read a human-uploaded document with list_documents / get_document_text, or save a ' +
    'written report or sandbox PDF with create_document.';

  public constructor(
    @Inject(DOCUMENT_ACTIONS) private readonly actions: DocumentActions,
    @Inject(ACTION_AUDIT_LOG) private readonly auditLog: IActionAuditLog,
    private readonly pendingActions: PendingActionUseCases,
    private readonly delegation: AgentRoomDelegationService,
    private readonly authenticatedContexts: AuthenticatedContextStore,
    @Optional() private readonly chartPreviews?: AutomationChartPreviewStore,
  ) {
    super();
  }

  protected buildTools(req: Request): readonly McpToolHandler[] {
    return buildDocumentMcpTools({
      actions: this.actions,
      auditLog: this.auditLog,
      pendingActions: this.pendingActions,
      approvalOverridesHeader: firstHeader(req.headers[APPROVAL_OVERRIDE_HEADER]),
      authenticatedContexts: this.authenticatedContexts,
      chartPreviews: this.chartPreviews,
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
    const automationRunId = meta?.[AUTOMATION_RUN_ID_META_KEY];
    const automationOrganizationId = meta?.[AUTOMATION_ORGANIZATION_ID_META_KEY];
    if (
      typeof automationRunId === 'string' &&
      automationRunId.trim().length > 0 &&
      typeof automationOrganizationId === 'string' &&
      automationOrganizationId.trim().length > 0
    ) {
      return this.delegation.runForAutomation(
        automationRunId,
        automationOrganizationId,
        MCP_SERVER_FEATURES['mcp-document'],
        call,
        permission,
        typeof meta?.['com.minder/agent'] === 'string' ? meta['com.minder/agent'] : undefined,
        requestId,
        workloadEmail,
      );
    }
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
      MCP_SERVER_FEATURES['mcp-document'],
      call,
      permission,
      typeof meta?.['com.minder/agent'] === 'string' ? meta['com.minder/agent'] : undefined,
      typeof meta?.['com.celesnity/authorization-run-id'] === 'string'
        ? meta['com.celesnity/authorization-run-id']
        : undefined,
      requestId,
      workloadEmail,
    );
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
