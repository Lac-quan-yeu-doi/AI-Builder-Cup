import { Controller, Inject, UseGuards } from '@nestjs/common';
import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { Permission } from '@application/administration/authorization-policy';
import { CloudFileUseCases } from '@application/cloud-file/cloud-file.use-cases';
import type { ICloudFileSourceRegistry } from '@application/cloud-file/interfaces/i-cloud-file-source-registry';
import { CLOUD_FILE_SOURCE_REGISTRY } from '@application/cloud-file/tokens';
import { SpreadsheetUseCases } from '@application/spreadsheet/spreadsheet.use-cases';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { McpAuthenticationGuard } from '@presentation/mcp/mcp-authentication.guard';
import { McpController } from '@presentation/mcp/mcp-controller.base';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { buildCloudFileMcpTools } from './cloud-file-mcp-tools';

const ROOM_ID_META_KEY = 'com.celesnity/room-id';
const CALLER_SUBJECT_META_KEY = 'com.celesnity/caller-subject';
const AUTOMATION_RUN_ID_META_KEY = 'com.celesnity/automation-run-id';
const AUTOMATION_ORGANIZATION_ID_META_KEY = 'com.celesnity/automation-organization-id';
const AGENT_META_KEY = 'com.minder/agent';
const AUTHORIZATION_RUN_ID_META_KEY = 'com.celesnity/authorization-run-id';

@Controller('cloud-file-mcp')
@MachineAuthenticated()
@UseGuards(McpAuthenticationGuard)
export class CloudFileMcpController extends McpController {
  protected readonly serverName = 'mcp-cloud-files';
  protected readonly instructions =
    "Read the user's connected cloud files (search_files, get_file) and spreadsheets " +
    '(get_spreadsheet_overview, then read_spreadsheet_range). create_spreadsheet makes a new ' +
    'file, optionally copied from an existing one. Existing files can never be edited or deleted. ' +
    'A NEEDS_REAUTH or NOT_CONNECTED error means the user must sign in to the provider first.';

  public constructor(
    private readonly files: CloudFileUseCases,
    private readonly spreadsheets: SpreadsheetUseCases,
    @Inject(CLOUD_FILE_SOURCE_REGISTRY) private readonly sources: ICloudFileSourceRegistry,
    private readonly delegation: AgentRoomDelegationService,
    private readonly contexts: AuthenticatedContextStore,
  ) {
    super();
  }

  protected buildTools(): readonly McpToolHandler[] {
    return buildCloudFileMcpTools({
      files: this.files,
      spreadsheets: this.spreadsheets,
      providers: this.sources.providers(),
      identityId: () => this.contexts.require().identityId,
    });
  }

  protected override runToolCall(
    meta: RequestMeta | undefined,
    call: () => Promise<CallToolResult>,
    permission: Permission = 'workspace:read',
    requestId?: string,
    workloadEmail?: string,
  ): Promise<CallToolResult> {
    const agentName = stringMeta(meta, AGENT_META_KEY);
    const automationRunId = stringMeta(meta, AUTOMATION_RUN_ID_META_KEY);
    const automationOrganizationId = stringMeta(meta, AUTOMATION_ORGANIZATION_ID_META_KEY);
    if (automationRunId && automationOrganizationId) {
      return this.delegation.runForAutomation(
        automationRunId,
        automationOrganizationId,
        'DOCUMENTS',
        call,
        permission,
        agentName,
        requestId,
        workloadEmail,
      );
    }
    const roomId = stringMeta(meta, ROOM_ID_META_KEY);
    const callerSubject = stringMeta(meta, CALLER_SUBJECT_META_KEY);
    if (!roomId || !callerSubject) {
      return Promise.reject(new Error('Trusted MCP room delegation metadata is required.'));
    }
    return this.delegation.runForFeature(
      roomId,
      callerSubject,
      'DOCUMENTS',
      call,
      permission,
      agentName,
      stringMeta(meta, AUTHORIZATION_RUN_ID_META_KEY),
      requestId,
      workloadEmail,
    );
  }
}

function stringMeta(meta: RequestMeta | undefined, key: string): string | undefined {
  const value = meta?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
