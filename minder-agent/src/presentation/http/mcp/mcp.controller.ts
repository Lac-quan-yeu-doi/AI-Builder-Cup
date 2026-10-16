import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  HttpCode,
  HttpStatus,
  Query,
  ServiceUnavailableException,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import type {
  McpManagerTarget,
  HttpMcpManager,
} from "@application/shared/ports/index.js";
import { MCP_MANAGER, MCP_TARGET_RESOLVER } from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";

type TargetResolver = (input: {
  readonly owner: string;
  readonly agent: string;
  readonly server: string;
}) => McpManagerTarget | undefined | Promise<McpManagerTarget | undefined>;

@UseGuards(OwnerAuthGuard)
@Controller({ path: "mcp/servers", version: ["1", "2"] })
export class McpNestController {
  constructor(
    @Optional()
    @Inject(MCP_MANAGER)
    private readonly manager: HttpMcpManager | undefined,
    @Optional()
    @Inject(MCP_TARGET_RESOLVER)
    private readonly targetResolver: TargetResolver | undefined,
  ) {}

  @Get()
  async status(@CurrentOwner() owner: OwnerContext): Promise<object[]> {
    return (await this.requireManager().status(owner.owner)).map(statusBody);
  }

  @Get(":server/tools")
  async tools(
    @CurrentOwner() owner: OwnerContext,
    @Param("server") server: string,
    @Query("agent") agent?: string,
  ): Promise<object[]> {
    const target = await this.target(owner, server, agent);
    try {
      return (await this.requireManager().discover(target)).map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      }));
    } catch {
      throw new ServiceUnavailableException({
        error: "mcp_server_unavailable",
      });
    }
  }

  @Post(":server/reconnect")
  @HttpCode(HttpStatus.OK)
  async reconnect(
    @CurrentOwner() owner: OwnerContext,
    @Param("server") server: string,
    @Query("agent") agent?: string,
  ): Promise<object> {
    const target = await this.target(owner, server, agent);
    try {
      return statusBody(await this.requireManager().reconnect(target));
    } catch {
      throw new ServiceUnavailableException({
        error: "mcp_server_unavailable",
      });
    }
  }

  private requireManager(): HttpMcpManager {
    if (this.manager === undefined)
      throw new ServiceUnavailableException({
        error: "mcp_manager_not_configured",
      });
    return this.manager;
  }

  private async target(
    owner: OwnerContext,
    server: string,
    agent: string | undefined,
  ): Promise<McpManagerTarget> {
    const normalizedAgent = agent?.trim();
    if (!normalizedAgent)
      throw new BadRequestException({ error: "agent_required" });
    if (this.targetResolver === undefined)
      throw new ServiceUnavailableException({
        error: "mcp_target_resolver_not_configured",
      });
    const manifestOwner = owner.manifestOwner ?? owner.resourceOwner;
    const target = await this.targetResolver({
      owner: manifestOwner,
      agent: normalizedAgent,
      server,
    });
    if (
      !target ||
      target.owner !== manifestOwner ||
      target.agent !== normalizedAgent ||
      target.server.name !== server
    )
      throw new NotFoundException({ error: "mcp_server_not_found" });
    return target;
  }
}

function statusBody(
  value: Awaited<ReturnType<HttpMcpManager["status"]>>[number],
): object {
  return {
    agent: value.agent,
    attempts: value.attempts,
    kind: value.kind,
    server: value.server,
    state: value.state,
    tool_count: value.toolCount,
  };
}
