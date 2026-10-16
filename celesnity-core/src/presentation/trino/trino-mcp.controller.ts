import { Controller, UseGuards } from '@nestjs/common';
import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';
import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { McpAuthenticationGuard } from '@presentation/mcp/mcp-authentication.guard';
import { McpController } from '@presentation/mcp/mcp-controller.base';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { buildTrinoMcpTools } from './trino-mcp-tools';
import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import type { Permission } from '@application/administration/authorization-policy';
import { MCP_SERVER_FEATURES } from '@application/administration/mcp-operation-policy';

const ROOM_ID_META_KEY = 'com.celesnity/room-id';
const CALLER_SUBJECT_META_KEY = 'com.celesnity/caller-subject';
const AUTOMATION_RUN_ID_META_KEY = 'com.celesnity/automation-run-id';
const AUTOMATION_ORGANIZATION_ID_META_KEY = 'com.celesnity/automation-organization-id';

/**
 * MCP-over-HTTP endpoint for Trino query/browse tools — replaces the
 * locally-spawned `mcp-trino` binary, so credentials and catalog
 * authorization live only in celesnity-core (same move already made for
 * chart/document). Agent-only, so `@MachineAuthenticated()` skips the
 * global human-auth guards in favor of `McpAuthenticationGuard`.
 */
@Controller('trino-mcp')
@MachineAuthenticated()
@UseGuards(McpAuthenticationGuard)
export class TrinoMcpController extends McpController {
  protected readonly serverName = 'mcp-trino';
  protected readonly instructions =
    'Query and browse the data warehouse: run_query executes read-only SQL; ' +
    'list_catalogs, list_schemas, list_tables, and describe_table browse its structure.';

  public constructor(
    private readonly queryWorkbench: QueryWorkbenchUseCases,
    private readonly catalogExploration: CatalogExplorationUseCases,
    private readonly delegation: AgentRoomDelegationService,
  ) {
    super();
  }

  protected buildTools(): readonly McpToolHandler[] {
    return buildTrinoMcpTools({
      queryWorkbench: this.queryWorkbench,
      catalogExploration: this.catalogExploration,
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
        MCP_SERVER_FEATURES['mcp-trino'],
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
      MCP_SERVER_FEATURES['mcp-trino'],
      call,
      permission,
      typeof meta?.['com.minder/agent'] === 'string' ? meta['com.minder/agent'] : undefined,
      typeof meta?.['com.celesnity/authorization-run-id'] === 'string' ? meta['com.celesnity/authorization-run-id'] : undefined,
      requestId,
      workloadEmail,
    );
  }
}
