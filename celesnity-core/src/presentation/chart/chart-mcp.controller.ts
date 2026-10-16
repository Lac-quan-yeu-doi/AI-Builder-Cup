import { Controller, Optional, UseGuards } from '@nestjs/common';
import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import type { Permission } from '@application/administration/authorization-policy';
import { MCP_SERVER_FEATURES } from '@application/administration/mcp-operation-policy';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { AutomationChartPreviewStore } from '@application/chart/automation-chart-preview.store';
import { ChatChartCreationUseCases } from '@application/chart/chat-chart-creation.use-cases';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { McpController } from '@presentation/mcp/mcp-controller.base';
import { McpAuthenticationGuard } from '@presentation/mcp/mcp-authentication.guard';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { buildChartMcpTools } from './chart-mcp-tools';

const ROOM_ID_META_KEY = 'com.celesnity/room-id';
const CALLER_SUBJECT_META_KEY = 'com.celesnity/caller-subject';
const AUTOMATION_RUN_ID_META_KEY = 'com.celesnity/automation-run-id';
const AUTOMATION_ORGANIZATION_ID_META_KEY = 'com.celesnity/automation-organization-id';

@Controller('chart-mcp')
@MachineAuthenticated()
@UseGuards(McpAuthenticationGuard)
export class ChartMcpController extends McpController {
  protected readonly serverName = 'mcp-chart';
  protected readonly instructions =
    'Build transient chart previews from canonical definitions. Prefer VISUAL queries when the builder can express the request; use NATIVE for user-provided SQL or unsupported constructs. preview_chart never saves a chart.';

  public constructor(
    private readonly chatCharts: ChatChartCreationUseCases,
    private readonly delegation: AgentRoomDelegationService,
    private readonly authenticatedContexts: AuthenticatedContextStore,
    @Optional() private readonly chartPreviews?: AutomationChartPreviewStore,
  ) {
    super();
  }

  protected buildTools(): readonly McpToolHandler[] {
    return buildChartMcpTools({
      chatCharts: this.chatCharts,
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
    if (typeof automationRunId === 'string' && typeof automationOrganizationId === 'string') {
      return this.delegation.runForAutomation(
        automationRunId,
        automationOrganizationId,
        MCP_SERVER_FEATURES['mcp-chart'],
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
      MCP_SERVER_FEATURES['mcp-chart'],
      call,
      permission,
      typeof meta?.['com.minder/agent'] === 'string' ? meta['com.minder/agent'] : undefined,
      typeof meta?.['com.celesnity/authorization-run-id'] === 'string' ? meta['com.celesnity/authorization-run-id'] : undefined,
      requestId,
      workloadEmail,
    );
  }
}
