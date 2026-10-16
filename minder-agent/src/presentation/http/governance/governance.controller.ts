import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
  Req,
  Version,
} from "@nestjs/common";
import { ApiOperation } from "@nestjs/swagger";
import type { ManifestLoader, ResolvedAgentManifest } from "@application/agent";
import type { Sha256 } from "@application/shared/ports/index.js";
import {
  admitGovernancePolicy,
  resolveGovernancePolicy,
  type GovernanceEvidenceRecord,
  type RunManager,
} from "@application/runtime";
import { MANIFEST_LOADER, RUN_MANAGER, SHA256 } from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { GovernanceValidationDto } from "@presentation/http/contracts/validation.js";
import { requireV2Pagination } from "@presentation/http/v2/contracts.js";

@UseGuards(OwnerAuthGuard)
@Controller({ version: ["1", "2"] })
export class GovernanceController {
  constructor(
    @Optional()
    @Inject(RUN_MANAGER)
    private readonly runtime: RunManager | undefined,
    @Optional()
    @Inject(MANIFEST_LOADER)
    private readonly loader: ManifestLoader | undefined,
    @Inject(SHA256)
    private readonly sha256: Sha256,
  ) {}

  @Get("agent-manifests/:name/governance")
  async manifest(
    @CurrentOwner() owner: OwnerContext,
    @Param("name") name: string,
  ): Promise<object> {
    const loaded = await this.requireLoader().get({
      owner: owner.owner,
      name,
    });
    if (!loaded)
      throw new NotFoundException({ error: "agent_manifest_not_found" });
    return manifestGovernance(owner.owner, loaded.manifest, this.sha256);
  }

  @Post("agent-manifests/validate/governance")
  @Version("1")
  @ApiOperation({ deprecated: true })
  async validateManifest(
    @CurrentOwner() owner: OwnerContext,
    @Body() input: GovernanceValidationDto,
  ): Promise<object> {
    if (typeof input?.yaml !== "string")
      throw new BadRequestException({ error: "agent_manifest_invalid" });
    try {
      const loaded = await this.requireLoader().validate({
        owner: owner.owner,
        yaml: input.yaml,
      });
      return {
        valid: true,
        ...manifestGovernance(owner.owner, loaded.manifest, this.sha256),
      };
    } catch (error) {
      if (!isManifestValidationError(error)) throw error;
      throw new BadRequestException({
        valid: false,
        error: "agent_manifest_invalid",
        detail: error instanceof Error ? error.message : "invalid manifest",
      });
    }
  }

  @Get("runs/:runId/governance")
  async run(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runId: string,
  ): Promise<object> {
    const runtime = this.requireRuntime();
    const run = await runtime.getAuthorizedRun(runId, owner.owner);
    if (!run) throw new NotFoundException({ error: "run_not_found" });
    const admission = await runtime.getGovernanceAdmission(runId, owner.owner);
    if (!admission) throw new NotFoundException({ error: "run_not_found" });
    return {
      owner: admission.owner,
      run_id: admission.runId,
      policy_revision: admission.policyRevision,
      admitted_at: admission.admittedAt,
      policy: admission.policy,
      data_scope: run.dataScope ?? null,
    };
  }

  @Get("runs/:runId/governance/evidence")
  async evidence(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Req() request?: object,
    @Query() query?: Record<string, unknown>,
  ): Promise<object> {
    if (request !== undefined) requireV2Pagination(request, query ?? {});
    const runtime = this.requireRuntime();
    const run = await runtime.getAuthorizedRun(runId, owner.owner);
    if (!run) throw new NotFoundException({ error: "run_not_found" });
    const page = await runtime.listGovernanceEvidence(
      runId,
      owner.owner,
      cursor,
      limit === undefined ? undefined : Number.parseInt(limit, 10),
    );
    if (!page) throw new NotFoundException({ error: "run_not_found" });
    return {
      items: page.items.map(governanceEvidenceBody),
      ...(page.nextCursor === undefined
        ? {}
        : { next_cursor: page.nextCursor }),
    };
  }

  private requireRuntime(): RunManager {
    if (this.runtime === undefined)
      throw new ServiceUnavailableException({
        error: "runtime_not_configured",
      });
    return this.runtime;
  }

  private requireLoader(): ManifestLoader {
    if (this.loader === undefined)
      throw new ServiceUnavailableException({
        error: "manifest_store_not_configured",
      });
    return this.loader;
  }
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

function manifestGovernance(
  owner: string,
  manifest: ResolvedAgentManifest,
  sha256: Sha256,
): object {
  const resolvedInput =
    manifest.governance === undefined
      ? { owner }
      : { owner, manifest: { owner, governance: manifest.governance } };
  const resolved = admitGovernancePolicy(
    resolveGovernancePolicy({ ...resolvedInput, sha256 }),
    new Date().toISOString(),
  );
  return {
    policy_revision: resolved.policyRevision,
    admitted_at: resolved.admittedAt,
    policy: resolved.summary,
  };
}

function governanceEvidenceBody(record: GovernanceEvidenceRecord): object {
  return {
    id: record.id,
    owner: record.owner,
    run_id: record.runId,
    seq: record.seq,
    at: record.at,
    kind: record.kind,
    detail: record.detail,
  };
}
