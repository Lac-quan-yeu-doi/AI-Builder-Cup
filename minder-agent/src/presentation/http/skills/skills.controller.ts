import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
  Version,
} from "@nestjs/common";
import { ApiBody, ApiResponse } from "@nestjs/swagger";
import type { SkillDefinition } from "@domain/index.js";
import type { SkillService } from "@application/skill";
import { SKILL_SERVICE_FOR_OWNER } from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { SkillDto } from "@presentation/http/contracts/validation.js";
import {
  ApiErrorV2Response,
  SkillResponse,
  SkillSummaryResponse,
} from "@presentation/http/v2/openapi-dtos.js";

type SkillServiceForOwner = (owner: string) => SkillService;

@UseGuards(OwnerAuthGuard)
@Controller({ path: "skills", version: ["1", "2"] })
export class SkillsNestController {
  constructor(
    @Optional()
    @Inject(SKILL_SERVICE_FOR_OWNER)
    private readonly serviceForOwner: SkillServiceForOwner | undefined,
  ) {}

  @Get()
  @ApiResponse({ status: 200, type: [SkillSummaryResponse] })
  async list(@CurrentOwner() owner: OwnerContext): Promise<object[]> {
    return (await this.service(owner).list()).map(summaryBody);
  }

  @Post()
  @Version("1")
  @ApiBody({ type: SkillDto })
  @ApiResponse({ status: 201, type: SkillResponse })
  async create(
    @CurrentOwner() owner: OwnerContext,
    @Body() input: SkillDto,
  ): Promise<object> {
    return this.save(owner, input, undefined, false);
  }

  @Post()
  @Version("2")
  @ApiBody({ type: SkillDto })
  @ApiResponse({ status: 201, type: SkillResponse })
  @ApiResponse({ status: 409, type: ApiErrorV2Response })
  async createV2(
    @CurrentOwner() owner: OwnerContext,
    @Body() input: SkillDto,
  ): Promise<object> {
    return this.save(owner, input, undefined, true);
  }

  @Get(":name")
  @ApiResponse({ status: 200, type: SkillResponse })
  async get(
    @CurrentOwner() owner: OwnerContext,
    @Param("name") name: string,
  ): Promise<object> {
    const skill = await this.service(owner).resolve({ name });
    if (!skill) throw new NotFoundException({ error: "skill_not_found" });
    return skillBody(skill);
  }

  @Put(":name")
  @ApiBody({ type: SkillDto })
  @ApiResponse({ status: 200, type: SkillResponse })
  async update(
    @CurrentOwner() owner: OwnerContext,
    @Param("name") name: string,
    @Body() input: SkillDto,
  ): Promise<object> {
    return this.save(owner, input, name, false);
  }

  @Delete(":name")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentOwner() owner: OwnerContext,
    @Param("name") name: string,
  ): Promise<void> {
    const service = this.service(owner);
    const skill = await service.resolve({ name });
    if (!skill) throw new NotFoundException({ error: "skill_not_found" });
    try {
      await service.deleteProject(name);
    } catch (error) {
      throw invalidSkill(error);
    }
  }

  private async save(
    owner: OwnerContext,
    input: SkillDto,
    routeName: string | undefined,
    createOnly: boolean,
  ): Promise<object> {
    const name = routeName ?? stringValue(input?.name);
    const namespace =
      input?.namespace === undefined || input.namespace === ""
        ? ""
        : stringValue(input.namespace);
    const skillBodyValue = stringValue(input?.body);
    const description =
      input?.description === undefined
        ? undefined
        : stringValue(input.description);
    if (
      !name ||
      namespace === undefined ||
      !skillBodyValue ||
      (input?.description !== undefined && !description)
    )
      throw new BadRequestException({ error: "skill_invalid" });
    if (
      routeName !== undefined &&
      input?.name !== undefined &&
      input.name !== name
    )
      throw new BadRequestException({ error: "skill_name_mismatch" });
    try {
      const service = this.service(owner);
      const projectSkill = {
        name,
        namespace,
        body: skillBodyValue,
        ...(description === undefined ? {} : { description }),
      };
      const skill = createOnly
        ? await service.createProject(projectSkill)
        : await service.saveProject(projectSkill);
      return skillBody(skill);
    } catch (error) {
      throw invalidSkill(error);
    }
  }

  private service(owner: OwnerContext): SkillService {
    if (this.serviceForOwner === undefined)
      throw new ServiceUnavailableException({
        error: "skill_store_not_configured",
      });
    return this.serviceForOwner(owner.owner);
  }
}

function summaryBody(
  value: Awaited<ReturnType<SkillService["list"]>>[number],
): object {
  return {
    ...(value.description === undefined
      ? {}
      : { description: value.description }),
    name: value.name,
    namespace: value.namespace,
    read_only: value.readOnly,
    source: value.source,
  };
}

function skillBody(value: SkillDefinition): object {
  return {
    body: value.body,
    created_at: value.createdAt,
    ...(value.description === undefined
      ? {}
      : { description: value.description }),
    hash: value.hash,
    name: value.name,
    namespace: value.namespace,
    read_only: value.readOnly,
    source: value.source,
    updated_at: value.updatedAt,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function invalidSkill(error: unknown): BadRequestException {
  if (error instanceof Error && error.message === "skill_name_conflict")
    throw new ConflictException({ error: "skill_name_conflict" });
  if (!isSkillValidationError(error)) throw error;
  return new BadRequestException({
    error: "skill_invalid",
    detail: error instanceof Error ? error.message : "invalid skill",
  });
}

function isSkillValidationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.startsWith("skill ") || message === "global skills are read-only"
  );
}
