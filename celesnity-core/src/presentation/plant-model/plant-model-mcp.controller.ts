import { Controller, UseGuards } from '@nestjs/common';
import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { roleAllows, type Permission } from '@application/administration/authorization-policy';
import { MCP_SERVER_FEATURES } from '@application/administration/mcp-operation-policy';
import { PlantModelUseCases } from '@application/plant-model/plant-model.use-cases';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { McpAuthenticationGuard } from '@presentation/mcp/mcp-authentication.guard';
import { McpController } from '@presentation/mcp/mcp-controller.base';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { buildPlantModelMcpTools } from './plant-model-mcp-tools';

const ROOM_ID_META_KEY = 'com.celesnity/room-id';
const CALLER_SUBJECT_META_KEY = 'com.celesnity/caller-subject';

@Controller('plant-model-mcp')
@MachineAuthenticated()
@UseGuards(McpAuthenticationGuard)
export class PlantModelMcpController extends McpController {
  protected readonly serverName = 'mcp-plant-model';
  protected readonly instructions =
    'Read-only, tenant-scoped Plant Model discovery. Search nodes, inspect one node, and traverse bounded route neighborhoods.';

  public constructor(
    private readonly useCases: PlantModelUseCases,
    private readonly delegation: AgentRoomDelegationService,
    private readonly contexts: AuthenticatedContextStore,
  ) {
    super();
  }

  protected buildTools(): readonly McpToolHandler[] {
    return buildPlantModelMcpTools(this.useCases);
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
      roomId.trim() === '' ||
      typeof callerSubject !== 'string' ||
      callerSubject.trim() === ''
    ) {
      return Promise.reject(new Error('Trusted MCP room delegation metadata is required.'));
    }
    return this.delegation.runForFeature(
      roomId,
      callerSubject,
      MCP_SERVER_FEATURES['mcp-plant-model'],
      async () => {
        if (!roleAllows(this.contexts.require().role, 'workspace:read')) {
          throw new Error('Permission workspace:read is required.');
        }
        return call();
      },
      permission,
      typeof meta?.['com.minder/agent'] === 'string' ? meta['com.minder/agent'] : undefined,
      typeof meta?.['com.celesnity/authorization-run-id'] === 'string' ? meta['com.celesnity/authorization-run-id'] : undefined,
      requestId,
      workloadEmail,
    );
  }
}
