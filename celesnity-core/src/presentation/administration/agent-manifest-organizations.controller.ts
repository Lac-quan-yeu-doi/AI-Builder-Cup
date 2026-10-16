import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AgentManifestOrganizationInventory, type AgentManifestOrganization } from '@application/administration/agent-manifest-organizations';
import { MachineAuthenticated } from '@presentation/http/machine-authenticated.decorator';
import { McpAuthenticationGuard, type VerifiedMcpRequest } from '@presentation/mcp/mcp-authentication.guard';

@Controller('internal/agent-manifest-organizations')
@MachineAuthenticated()
@UseGuards(McpAuthenticationGuard)
export class AgentManifestOrganizationsController {
  public constructor(private readonly inventory: AgentManifestOrganizationInventory) {}

  @Get()
  public list(@Req() request: VerifiedMcpRequest): Promise<readonly AgentManifestOrganization[]> {
    return this.inventory.list(request.verifiedAgentWorkload?.email ?? 'local-development', request.get('X-Request-Id'));
  }
}
