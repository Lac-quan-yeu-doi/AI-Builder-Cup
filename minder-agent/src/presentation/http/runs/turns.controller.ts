import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  NotFoundException,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import {
  type Admission,
  type RunManager,
  type RuntimeRoomDelegation,
} from "@application/runtime";
import { RUN_MANAGER } from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { RunAdmissionService } from "@presentation/http/runs/run-admission.service.js";
import { normalizeDataScope } from "@application/shared/ports/index.js";
import {
  parseRunContext,
  type RunContext,
} from "@domain/runtime/run-context.js";
import {
  ClientToolResultDto,
  TurnDto,
} from "@presentation/http/contracts/validation.js";

interface ResponseHeaders {
  statusCode: number;
  setHeader(name: string, value: string): void;
}

@UseGuards(OwnerAuthGuard)
@Controller()
export class TurnsNestController {
  constructor(
    @Optional()
    @Inject(RUN_MANAGER)
    private readonly runtime: RunManager | undefined,
    private readonly runAdmission: RunAdmissionService,
  ) {}

  @Post("turns")
  @HttpCode(HttpStatus.ACCEPTED)
  async turn(
    @CurrentOwner() owner: OwnerContext,
    @Body() input: TurnDto,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ): Promise<object> {
    this.requireRuntime();
    const value = parseTurn(input);
    if (!value) throw new BadRequestException({ error: "invalid_turn" });
    const admission = await this.start({
      key: value.session_key,
      input: value.input,
      owner,
      mode: "interactive",
      trigger: { source: "chat" },
      ...(value.manifestName === undefined
        ? {}
        : {
            manifestName: value.manifestName,
            manifestOwner: owner.manifestOwner ?? owner.resourceOwner,
          }),
      ...(value.dataScope === undefined ? {} : { dataScope: value.dataScope }),
      ...(value.context === undefined ? {} : { context: value.context }),
      ...(value.systemPrompt === undefined
        ? {}
        : { systemPrompt: value.systemPrompt }),
    });
    return this.admission(admission, response);
  }

  @Post("turns/blocking")
  @HttpCode(HttpStatus.ACCEPTED)
  async blocking(
    @CurrentOwner() owner: OwnerContext,
    @Body() input: TurnDto,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ): Promise<object> {
    this.requireRuntime();
    const value = parseTurn(input);
    if (!value) throw new BadRequestException({ error: "invalid_turn" });
    const waitMs = blockingWait(input);
    if (waitMs === undefined)
      throw new BadRequestException({ error: "invalid_blocking_wait" });
    const admission = await this.start({
      key: value.session_key,
      input: value.input,
      owner,
      mode: "interactive",
      trigger: { source: "chat" },
      ...(value.manifestName === undefined
        ? {}
        : {
            manifestName: value.manifestName,
            manifestOwner: owner.manifestOwner ?? owner.resourceOwner,
          }),
      ...(value.dataScope === undefined ? {} : { dataScope: value.dataScope }),
      ...(value.context === undefined ? {} : { context: value.context }),
      ...(value.systemPrompt === undefined
        ? {}
        : { systemPrompt: value.systemPrompt }),
    });
    if (admission.kind !== "started")
      return this.admission(admission, response);
    const run = await this.requireRuntime().getAuthorizedRun(
      admission.run.id,
      owner.owner,
    );
    const deadline = Date.now() + waitMs;
    let current = run;
    while (current && isActive(current) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      current = await this.requireRuntime().getAuthorizedRun(
        admission.run.id,
        owner.owner,
      );
    }
    if (!current) throw new NotFoundException({ error: "run_not_found" });
    if (isActive(current)) return this.admission(admission, response);
    response.statusCode = HttpStatus.OK;
    return {
      error: current.error ?? null,
      response_text: current.responseText,
      data_scope: current.dataScope ?? null,
      run_id: current.id,
      session_id: current.sessionId,
      status: current.status,
    };
  }

  @Post("client-tool-results")
  @HttpCode(HttpStatus.ACCEPTED)
  async clientToolResult(
    @CurrentOwner() owner: OwnerContext,
    @Body() input: ClientToolResultDto,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ): Promise<object> {
    const value = parseClientToolResult(input);
    if (!value)
      throw new BadRequestException({ error: "invalid_client_tool_result" });
    const runtime = this.requireRuntime();
    if (!(await runtime.getSessionByKey(value.session_key, owner.owner)))
      throw new NotFoundException({
        error: "session_not_found",
        detail: "Session was not found.",
      });
    const admission = await this.start({
      key: value.session_key,
      input: "Client tool completed. Continue the task.",
      owner,
      mode: "interactive",
      trigger: { source: "client_tool" },
      clientToolResult: {
        id: value.tool_call_id,
        content: value.content,
        isError: value.is_error,
      },
    });
    return this.admission(admission, response);
  }

  @Post("webhooks/:source")
  @HttpCode(HttpStatus.ACCEPTED)
  async webhook(
    @CurrentOwner() owner: OwnerContext,
    @Headers("x-delivery-id") deliveryId: string | undefined,
    @Param("source") source: string,
    @Body() input: TurnDto,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ): Promise<object> {
    const value = parseTurn(input);
    if (!value) throw new BadRequestException({ error: "invalid_turn" });
    if (
      source === "automation-workflow" &&
      (owner.role !== "SERVICE_ACCOUNT" ||
        owner.organizationId === undefined ||
        value.run_id === undefined)
    )
      throw new ForbiddenException({
        error: "verified_automation_run_required",
      });
    if (source !== "automation-workflow" && value.run_id !== undefined)
      throw new BadRequestException({ error: "automation_run_id_not_allowed" });
    const admission = await this.start({
      ...(value.run_id === undefined ? {} : { runId: value.run_id }),
      key: value.session_key,
      input: value.input,
      owner,
      mode: "autonomous",
      trigger: {
        source: `webhook:${source}`,
        ...(deliveryId?.trim() ? { deliveryId: deliveryId.trim() } : {}),
      },
      ...(value.manifestName === undefined
        ? {}
        : {
            manifestName: value.manifestName,
            manifestOwner: owner.manifestOwner ?? owner.resourceOwner,
          }),
      ...(value.dataScope === undefined ? {} : { dataScope: value.dataScope }),
      ...(source !== "automation-workflow" || value.context === undefined
        ? {}
        : { context: value.context }),
      ...(source !== "automation-workflow" ||
      owner.organizationId === undefined ||
      value.run_id === undefined
        ? {}
        : {
            delegation: {
              automationRunId: value.run_id,
              automationOrganizationId: owner.organizationId,
            },
          }),
    });
    return this.admission(admission, response);
  }

  private async start(input: {
    runId?: string;
    key: string;
    input: string;
    owner: OwnerContext;
    mode: "interactive" | "autonomous";
    trigger: { source: string; deliveryId?: string };
    manifestName?: string;
    manifestOwner?: string;
    dataScope?: ReturnType<typeof normalizeDataScope>;
    context?: RunContext;
    systemPrompt?: string;
    delegation?: RuntimeRoomDelegation;
    clientToolResult?: { id: string; content: string; isError: boolean };
  }): Promise<Admission> {
    try {
      return await this.runAdmission.start({
        ...(input.runId === undefined ? {} : { runId: input.runId }),
        key: input.key,
        input: input.input,
        owner: input.owner,
        mode: input.mode,
        trigger: input.trigger,
        ...(input.manifestName === undefined
          ? {}
          : { manifestName: input.manifestName }),
        ...(input.manifestOwner === undefined
          ? {}
          : { manifestOwner: input.manifestOwner }),
        ...(input.dataScope === undefined
          ? {}
          : { dataScope: input.dataScope }),
        ...(input.context === undefined ? {} : { context: input.context }),
        ...(input.systemPrompt === undefined
          ? {}
          : { systemPrompt: input.systemPrompt }),
        ...(input.delegation === undefined
          ? {}
          : { delegation: input.delegation }),
        ...(input.clientToolResult === undefined
          ? {}
          : { clientToolResult: input.clientToolResult }),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "RuntimeStoreError" &&
        "code" in error &&
        error.code === "mode_conflict"
      )
        throw new ConflictException({
          error: "session_mode_conflict",
          detail: error.message,
        });
      if (
        input.clientToolResult !== undefined &&
        error instanceof Error &&
        error.name === "RuntimeStoreError" &&
        "code" in error &&
        error.code === "invalid_transition"
      )
        throw new ConflictException({ error: "invalid_client_tool_result" });
      throw error;
    }
  }

  private requireRuntime(): RunManager {
    if (this.runtime === undefined)
      throw new ServiceUnavailableException({
        error: "runtime_not_configured",
      });
    return this.runtime;
  }

  private admission(admission: Admission, response: ResponseHeaders): object {
    if (admission.kind === "duplicate_delivery") {
      response.statusCode = HttpStatus.OK;
      return { status: "duplicate_delivery" };
    }
    if (admission.kind === "rejected")
      throw new ConflictException({
        error: "session_busy",
        detail: "Session has an active run.",
        active_run_id: admission.activeRunId,
      });
    response.setHeader("content-location", `/api/v1/runs/${admission.run.id}`);
    return {
      run_id: admission.run.id,
      session_id: admission.session.id,
      events_url: `/api/v1/runs/${admission.run.id}/events`,
    };
  }
}

function parseTurn(value: unknown):
  | {
      session_key: string;
      run_id?: string;
      input: string;
      manifestName?: string;
      dataScope?: ReturnType<typeof normalizeDataScope>;
      context?: RunContext;
      systemPrompt?: string;
    }
  | undefined {
  if (
    !isRecord(value) ||
    typeof value.session_key !== "string" ||
    typeof value.input !== "string"
  )
    return undefined;
  const session_key = value.session_key.trim();
  const input = value.input.trim();
  if (
    !session_key ||
    !input ||
    (value.agent !== undefined && typeof value.agent !== "string")
  )
    return undefined;
  const agent = typeof value.agent === "string" ? value.agent.trim() : "";
  const dataScope = normalizeDataScope(value.data_scope);
  const context = parseRunContext(value.automation_context);
  if (context === null) return undefined;
  const systemPrompt =
    typeof value.system_prompt === "string" && value.system_prompt.trim()
      ? value.system_prompt.trim()
      : undefined;
  const runId = value.run_id;
  if (
    runId !== undefined &&
    (typeof runId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        runId,
      ))
  )
    return undefined;
  return {
    session_key,
    ...(runId === undefined ? {} : { run_id: runId }),
    input,
    ...(agent ? { manifestName: agent } : {}),
    ...(dataScope === undefined ? {} : { dataScope }),
    ...(context === undefined ? {} : { context }),
    ...(systemPrompt === undefined ? {} : { systemPrompt }),
  };
}

function blockingWait(value: unknown): number | undefined {
  if (!isRecord(value) || value.wait_ms === undefined) return 30_000;
  return typeof value.wait_ms === "number" &&
    Number.isInteger(value.wait_ms) &&
    value.wait_ms >= 0 &&
    value.wait_ms <= 60_000
    ? value.wait_ms
    : undefined;
}

function parseClientToolResult(value: unknown):
  | {
      session_key: string;
      tool_call_id: string;
      content: string;
      is_error: boolean;
    }
  | undefined {
  if (
    !isRecord(value) ||
    typeof value.session_key !== "string" ||
    typeof value.tool_call_id !== "string" ||
    typeof value.content !== "string" ||
    (value.is_error !== undefined && typeof value.is_error !== "boolean")
  )
    return undefined;
  const session_key = value.session_key.trim();
  const tool_call_id = value.tool_call_id.trim();
  return session_key && tool_call_id
    ? {
        session_key,
        tool_call_id,
        content: value.content,
        is_error: value.is_error ?? false,
      }
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActive(run: { status: string }): boolean {
  return run.status === "queued" || run.status === "running";
}
