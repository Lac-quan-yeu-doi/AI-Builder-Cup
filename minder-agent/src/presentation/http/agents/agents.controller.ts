import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
  Version,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type {
  AgentConfigurationRecord,
  AgentConfigurationService,
} from "@application/agent";
import type { AgentDefinition } from "@domain/index.js";
import { AGENT_CONFIGURATION_SERVICE } from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import {
  CreateAgentDto,
  CreateAgentV2Dto,
  RollbackAgentDto,
  UpdateAgentDto,
  UpdateAgentV2Dto,
} from "@presentation/http/contracts/validation.js";
import {
  ApiErrorV2Response,
  AgentV2DiffResponse,
  AgentV2Response,
} from "@presentation/http/v2/openapi-dtos.js";

@UseGuards(OwnerAuthGuard)
@ApiTags("Agents")
@Controller({ path: "agents", version: ["1", "2"] })
export class AgentsController {
  constructor(
    @Optional()
    @Inject(AGENT_CONFIGURATION_SERVICE)
    private readonly serviceForOwner:
      ((owner: string) => AgentConfigurationService) | undefined,
  ) {}

  @Get()
  @Version("1")
  async list(@CurrentOwner() owner: OwnerContext): Promise<AgentResponse[]> {
    const records = await this.service(owner).list();
    return records.map(responseBody);
  }

  @Get(":id")
  @Version("1")
  async get(
    @CurrentOwner() owner: OwnerContext,
    @Param("id") id: string,
  ): Promise<AgentResponse> {
    const record = await this.service(owner).get(id);
    if (!record) throw new NotFoundException({ error: "agent_not_found" });
    return responseBody(record);
  }

  @Post()
  @Version("1")
  async create(
    @CurrentOwner() owner: OwnerContext,
    @Body() body: CreateAgentDto,
  ): Promise<AgentResponse> {
    try {
      return responseBody(await this.service(owner).create(body));
    } catch (error) {
      throw agentError(error, true);
    }
  }

  @Patch(":id")
  @Version("1")
  async update(
    @CurrentOwner() owner: OwnerContext,
    @Param("id") id: string,
    @Body() body: UpdateAgentDto,
  ): Promise<AgentResponse> {
    try {
      return responseBody(await this.service(owner).update(id, body));
    } catch (error) {
      throw agentError(error, true);
    }
  }

  @Get(":id/history")
  @Version("1")
  async history(
    @CurrentOwner() owner: OwnerContext,
    @Param("id") id: string,
  ): Promise<AgentResponse[]> {
    try {
      return (await this.service(owner).history(id)).map(responseBody);
    } catch (error) {
      throw agentError(error);
    }
  }

  @Get(":id/diff")
  @Version("1")
  async diff(
    @CurrentOwner() owner: OwnerContext,
    @Param("id") id: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
  ): Promise<readonly AgentConfigurationDiff[]> {
    const fromVersion = parseRevision(from);
    const toVersion = parseRevision(to);
    if (fromVersion === undefined || toVersion === undefined)
      throw new BadRequestException({ error: "agent_revision_invalid" });
    try {
      return await this.service(owner).diff(id, fromVersion, toVersion);
    } catch (error) {
      throw agentError(error);
    }
  }

  @Post(":id/rollback")
  @Version("1")
  @ApiOperation({ deprecated: true })
  @HttpCode(HttpStatus.OK)
  async rollback(
    @CurrentOwner() owner: OwnerContext,
    @Param("id") id: string,
    @Body() body: RollbackAgentDto,
  ): Promise<AgentResponse> {
    const version =
      typeof body?.version === "number" ? body.version : Number.NaN;
    if (!Number.isInteger(version))
      throw new BadRequestException({ error: "agent_revision_invalid" });
    try {
      return responseBody(await this.service(owner).rollback(id, version));
    } catch (error) {
      throw agentError(error);
    }
  }

  @Post(":agentId/rollback")
  @Version("2")
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RollbackAgentDto })
  @ApiResponse({ status: 200, type: AgentV2Response })
  rollbackV2(
    @CurrentOwner() owner: OwnerContext,
    @Param("agentId") agentId: string,
    @Body() body: RollbackAgentDto,
  ): Promise<AgentV2Response> {
    return this.rollback(owner, agentId, body).then(agentV2Response);
  }

  @Post(":id/archive")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentOwner() owner: OwnerContext,
    @Param("id") id: string,
  ): Promise<AgentResponse> {
    try {
      return responseBody(await this.service(owner).archive(id));
    } catch (error) {
      throw agentError(error);
    }
  }

  private service(owner: OwnerContext) {
    if (this.serviceForOwner === undefined)
      throw new ServiceUnavailableException({
        error: "agent_store_not_configured",
      });
    return this.serviceForOwner(owner.owner);
  }

  @Get()
  @Version("2")
  @ApiResponse({ status: 200, type: [AgentV2Response] })
  async listV2(
    @CurrentOwner() owner: OwnerContext,
  ): Promise<AgentV2Response[]> {
    return (await this.service(owner).list()).map(agentV2Response);
  }

  @Get(":agentId")
  @Version("2")
  @ApiResponse({ status: 200, type: AgentV2Response })
  @ApiResponse({ status: 404, type: ApiErrorV2Response })
  async getV2(
    @CurrentOwner() owner: OwnerContext,
    @Param("agentId") agentId: string,
  ): Promise<AgentV2Response> {
    const record = await this.service(owner).get(agentId);
    if (!record) throw new NotFoundException({ error: "agent_not_found" });
    return agentV2Response(record);
  }

  @Post()
  @Version("2")
  @ApiBody({ type: CreateAgentV2Dto })
  @ApiResponse({ status: 201, type: AgentV2Response })
  async createV2(
    @CurrentOwner() owner: OwnerContext,
    @Body() body: CreateAgentV2Dto,
  ): Promise<AgentV2Response> {
    return agentV2Response(
      await this.create(owner, createAgentInputFromV2(body)),
    );
  }

  @Patch(":agentId")
  @Version("2")
  @ApiBody({ type: UpdateAgentV2Dto })
  @ApiResponse({ status: 200, type: AgentV2Response })
  async updateV2(
    @CurrentOwner() owner: OwnerContext,
    @Param("agentId") agentId: string,
    @Body() body: UpdateAgentV2Dto,
  ): Promise<AgentV2Response> {
    return agentV2Response(
      await this.update(owner, agentId, updateAgentInputFromV2(body)),
    );
  }

  @Get(":agentId/history")
  @Version("2")
  @ApiResponse({ status: 200, type: [AgentV2Response] })
  async historyV2(
    @CurrentOwner() owner: OwnerContext,
    @Param("agentId") agentId: string,
  ): Promise<AgentV2Response[]> {
    return (await this.history(owner, agentId)).map(agentV2Response);
  }

  @Get(":agentId/diff")
  @Version("2")
  @ApiQuery({ name: "from", required: true, type: Number })
  @ApiQuery({ name: "to", required: true, type: Number })
  @ApiResponse({ status: 200, type: [AgentV2DiffResponse] })
  async diffV2(
    @CurrentOwner() owner: OwnerContext,
    @Param("agentId") agentId: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
  ): Promise<readonly AgentV2DiffResponse[]> {
    const values = await this.diff(owner, agentId, from, to);
    return values.map((value) => ({
      ...value,
      path: value.path.replace(
        /[A-Z]/gu,
        (letter) => `_${letter.toLowerCase()}`,
      ),
    }));
  }

  @Post(":agentId/archive")
  @Version("2")
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: AgentV2Response })
  archiveV2(
    @CurrentOwner() owner: OwnerContext,
    @Param("agentId") agentId: string,
  ): Promise<AgentV2Response> {
    return this.archive(owner, agentId).then(agentV2Response);
  }
}

function parseRevision(value: string | undefined): number | undefined {
  if (value === undefined || !/^[1-9]\d*$/u.test(value)) return undefined;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : undefined;
}

function agentError(error: unknown, allowValidation = false): Error {
  const message = error instanceof Error ? error.message : undefined;
  if (message === "agent_not_found")
    return new NotFoundException({ error: "agent_not_found" });
  if (message === "agent_revision_not_found")
    return new NotFoundException({ error: "agent_revision_not_found" });
  if (message === "agent_name_conflict")
    return new ConflictException({ error: "agent_name_conflict" });
  if (allowValidation && isAgentValidationMessage(message))
    return new BadRequestException({ error: "agent_configuration_invalid" });
  return error instanceof Error ? error : new Error("agent operation failed");
}

function isAgentValidationMessage(message: string | undefined): boolean {
  return (
    message === "id must be lowercase kebab-case" ||
    message === "name must be lowercase kebab-case" ||
    message === "maxSteps must be a positive integer" ||
    message?.startsWith("toolAllowlist ") === true ||
    message?.startsWith("skills ") === true
  );
}

type AgentResponse = AgentDefinition & { readonly version: number };
type AgentConfigurationDiff = Awaited<
  ReturnType<AgentConfigurationService["diff"]>
>[number];

function responseBody(record: AgentConfigurationRecord): AgentResponse {
  return { ...record.agent, version: record.version };
}

function agentV2Response(
  value: AgentResponse | AgentConfigurationRecord,
): AgentV2Response {
  const agent = "agent" in value ? value.agent : value;
  return {
    id: agent.id,
    name: agent.name,
    ...(agent.displayName === undefined
      ? {}
      : { display_name: agent.displayName }),
    ...(agent.systemPrompt === undefined
      ? {}
      : { system_prompt: agent.systemPrompt }),
    ...(agent.model === undefined ? {} : { model: agent.model }),
    tool_allowlist: agent.toolAllowlist,
    skills: agent.skills,
    ...(agent.maxSteps === undefined ? {} : { max_steps: agent.maxSteps }),
    execution_strategy: agent.executionStrategy,
    ...(agent.archivedAt === undefined
      ? {}
      : { archived_at: agent.archivedAt }),
    version: value.version,
  };
}

function createAgentInputFromV2(input: CreateAgentV2Dto): CreateAgentDto {
  return {
    id: input.id,
    name: input.name,
    ...(input.display_name === undefined
      ? {}
      : { displayName: input.display_name }),
    ...(input.system_prompt === undefined
      ? {}
      : { systemPrompt: input.system_prompt }),
    ...(input.model === undefined ? {} : { model: input.model }),
    toolAllowlist: input.tool_allowlist,
    skills: input.skills,
    ...(input.max_steps === undefined ? {} : { maxSteps: input.max_steps }),
    executionStrategy: input.execution_strategy,
  };
}

function updateAgentInputFromV2(input: UpdateAgentV2Dto): UpdateAgentDto {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.display_name === undefined
      ? {}
      : { displayName: input.display_name }),
    ...(input.system_prompt === undefined
      ? {}
      : { systemPrompt: input.system_prompt }),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.tool_allowlist === undefined
      ? {}
      : { toolAllowlist: input.tool_allowlist }),
    ...(input.skills === undefined ? {} : { skills: input.skills }),
    ...(input.max_steps === undefined ? {} : { maxSteps: input.max_steps }),
    ...(input.execution_strategy === undefined
      ? {}
      : { executionStrategy: input.execution_strategy }),
  };
}
