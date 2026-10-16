import { Controller, Inject, UseGuards } from '@nestjs/common';
import type { CallToolResult, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

import { SKILL_CLIENT, type ISkillClient } from '@application/skill/interfaces/i-skill-client';
import { AgentRoomDelegationService } from '@application/administration/agent-room-delegation.service';
import type { Permission } from '@application/administration/authorization-policy';
import { MCP_SERVER_FEATURES } from '@application/administration/mcp-operation-policy';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { McpAuthenticationGuard } from '@presentation/mcp/mcp-authentication.guard';
import { McpController } from '@presentation/mcp/mcp-controller.base';
import type { McpToolHandler } from '@presentation/mcp/mcp-tool-server';
import { buildSkillMcpTools } from './skill-mcp-tools';

const ROOM_ID_META_KEY = 'com.celesnity/room-id';
const CALLER_SUBJECT_META_KEY = 'com.celesnity/caller-subject';

/**
 * MCP-over-HTTP endpoint for skill authoring tools — list_skills, get_skill,
 * create_skill, update_skill, delete_skill. Agent-only, so
 * `@MachineAuthenticated()` skips the global human-auth guards in favor of
 * `McpAuthenticationGuard`, the same pattern as `DocumentMcpController` and
 * `AutomationWorkflowMcpController`. Reachable only from the skill page's
 * chat panel (the `skill-creator` agent), not the general chat assistant.
 */
@Controller('skill-mcp')
@MachineAuthenticated()
@UseGuards(McpAuthenticationGuard)
export class SkillMcpController extends McpController {
  protected readonly serverName = 'mcp-skill';
  protected readonly instructions =
    'Skill authoring tools: list_skills, get_skill, create_skill, update_skill, delete_skill. ' +
    'A skill is a named, reusable set of markdown instructions the agent can invoke later. ' +
    'Call list_skills first to avoid a name collision and to match the house style, and read a ' +
    'similar skill with get_skill as a template before writing a new one. Only project skills ' +
    'are writable; global skills are read-only.';

  public constructor(
    @Inject(SKILL_CLIENT) private readonly client: ISkillClient,
    private readonly delegation: AgentRoomDelegationService,
  ) {
    super();
  }

  protected buildTools(): readonly McpToolHandler[] {
    return buildSkillMcpTools({ client: this.client });
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
      MCP_SERVER_FEATURES['mcp-skill'],
      call,
      permission,
      typeof meta?.['com.minder/agent'] === 'string' ? meta['com.minder/agent'] : undefined,
      typeof meta?.['com.celesnity/authorization-run-id'] === 'string' ? meta['com.celesnity/authorization-run-id'] : undefined,
      requestId,
      workloadEmail,
    );
  }
}
