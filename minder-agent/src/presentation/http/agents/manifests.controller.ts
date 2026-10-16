import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { stringify } from "yaml";
import type { LoadedAgentManifest, ManifestLoader } from "@application/agent";
import { AUTH_OPTIONS, MANIFEST_LOADER } from "@modules/tokens.js";
import type { OwnerResolverOptions } from "@presentation/http/guards/authentication.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";

@UseGuards(OwnerAuthGuard)
@Controller({ path: "agent-manifests", version: ["1", "2"] })
export class ManifestsController {
  constructor(
    @Optional()
    @Inject(MANIFEST_LOADER)
    private readonly loader: ManifestLoader | undefined,
    @Optional()
    @Inject(AUTH_OPTIONS)
    private readonly authOptions: OwnerResolverOptions | undefined,
  ) {}

  @Get()
  async list(@CurrentOwner() owner: OwnerContext): Promise<object[]> {
    return (await this.requireLoader().list(this.manifestOwner(owner))).map(
      body,
    );
  }

  @Get(":name")
  async get(
    @CurrentOwner() owner: OwnerContext,
    @Param("name") name: string,
  ): Promise<object> {
    const manifest = await this.requireLoader().get({
      owner: this.manifestOwner(owner),
      name,
    });
    if (!manifest)
      throw new NotFoundException({ error: "agent_manifest_not_found" });
    return body(manifest);
  }

  @Put(":name")
  @HttpCode(HttpStatus.CREATED)
  async save(
    @CurrentOwner() owner: OwnerContext,
    @Param("name") name: string,
    @Body() input: Record<string, unknown>,
    @Headers("x-request-id") requestId?: string,
  ): Promise<object> {
    this.assertMutationAllowed(owner, name, "PUT", requestId);
    const yaml = manifestYaml(input);
    if (yaml === undefined)
      throw new BadRequestException({ error: "agent_manifest_invalid" });
    try {
      const manifest = await this.requireLoader().save({
        owner: this.manifestOwner(owner),
        name,
        yaml,
      });
      auditMutation(owner, name, "PUT", "allowed", requestId);
      return body(manifest);
    } catch (error) {
      throw invalidManifest(error);
    }
  }

  @Delete(":name")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentOwner() owner: OwnerContext,
    @Param("name") name: string,
    @Headers("x-request-id") requestId?: string,
  ): Promise<void> {
    this.assertMutationAllowed(owner, name, "DELETE", requestId);
    try {
      await this.requireLoader().remove({
        owner: this.manifestOwner(owner),
        name,
      });
      auditMutation(owner, name, "DELETE", "allowed", requestId);
    } catch (error) {
      throw invalidManifest(error);
    }
  }

  @Post("validate")
  @HttpCode(HttpStatus.OK)
  async validate(
    @CurrentOwner() owner: OwnerContext,
    @Body() input: Record<string, unknown>,
  ): Promise<object> {
    const yaml = manifestYaml(input);
    if (yaml === undefined)
      throw new BadRequestException({ error: "agent_manifest_invalid" });
    try {
      const manifest = await this.requireLoader().validate({
        owner: this.manifestOwner(owner),
        yaml,
      });
      return { valid: true, ...body(manifest) };
    } catch (error) {
      throw invalidManifest(error);
    }
  }

  private requireLoader(): ManifestLoader {
    if (this.loader === undefined)
      throw new ServiceUnavailableException({
        error: "manifest_store_not_configured",
      });
    return this.loader;
  }

  private manifestOwner(owner: OwnerContext): string {
    return owner.manifestOwner ?? owner.resourceOwner;
  }

  private assertMutationAllowed(
    owner: OwnerContext,
    name: string,
    operation: string,
    requestId: string | undefined,
  ): void {
    if (
      this.authOptions?.authenticator !== undefined &&
      owner.role !== "ORG_OWNER" &&
      owner.role !== "ORG_ADMIN"
    ) {
      auditMutation(owner, name, operation, "denied", requestId);
      throw new ForbiddenException({ error: "agent_manifest_forbidden" });
    }
  }
}

function body(value: LoadedAgentManifest): object {
  return {
    content_hash: value.contentHash,
    description: value.manifest.description,
    name: value.name,
    skills: value.manifest.skills,
    source_path: value.sourcePath,
    system_prompt: value.prompt,
    yaml: value.yaml,
  };
}

function manifestYaml(
  value: Record<string, unknown> | undefined,
): string | undefined {
  if (!value) return undefined;
  if (typeof value.yaml === "string" && value.yaml.trim() !== "")
    return value.yaml;
  const yaml = stringify(value);
  return yaml.trim() === "" ? undefined : yaml;
}

function invalidManifest(error: unknown): BadRequestException {
  if (!isManifestValidationError(error)) throw error;
  return new BadRequestException({
    error: "agent_manifest_invalid",
    detail: error instanceof Error ? error.message : "invalid manifest",
  });
}

function isManifestValidationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.startsWith("invalid YAML manifest") ||
    message.startsWith("invalid manifest") ||
    message.startsWith("manifest ") ||
    message.startsWith("manifest environment variable")
  );
}

function auditMutation(
  owner: OwnerContext,
  name: string,
  operation: string,
  outcome: "allowed" | "denied",
  requestId: string | undefined,
): void {
  console.info(
    JSON.stringify({
      event: "agent_manifest_mutation",
      organizationId: owner.organizationId,
      actorIdentityId: owner.identityId,
      actorSubject: owner.callerSubject,
      manifestName: name,
      operation,
      outcome,
      requestId,
    }),
  );
}
