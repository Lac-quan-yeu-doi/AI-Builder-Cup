import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Query,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  BadRequestException,
  UseGuards,
  PayloadTooLargeException,
  Req,
  Version,
} from "@nestjs/common";
import { ApiOperation } from "@nestjs/swagger";
import type {
  FileAccessPort,
  RunEvidencePort,
  WorkspaceProvider,
} from "@application/shared/ports/index.js";
import type { RunManager } from "@application/runtime";
import { runId } from "@domain/index.js";
import {
  EVIDENCE,
  FILE_ACCESS,
  RUN_MANAGER,
  WORKSPACE_PROVIDER,
} from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { requireV2Pagination } from "@presentation/http/v2/contracts.js";

interface ResponseHeaders {
  setHeader(name: string, value: string): void;
}

@UseGuards(OwnerAuthGuard)
@Controller({ version: ["1", "2"] })
export class RunsNestController {
  constructor(
    @Optional()
    @Inject(RUN_MANAGER)
    private readonly runtime: RunManager | undefined,
    @Optional()
    @Inject(EVIDENCE)
    private readonly evidence: RunEvidencePort | undefined,
    @Optional()
    @Inject(FILE_ACCESS)
    private readonly fileAccess: FileAccessPort | undefined,
    @Optional()
    @Inject(WORKSPACE_PROVIDER)
    private readonly workspace: WorkspaceProvider | undefined,
  ) {}

  @Get("sessions")
  @Version("1")
  @ApiOperation({ deprecated: true })
  async session(
    @CurrentOwner() owner: OwnerContext,
    @Query("key") key?: string,
  ): Promise<object> {
    const value = key?.trim();
    if (!value) throw new BadRequestException({ error: "invalid_session" });
    const session = await this.requireRuntime().getSessionByKey(
      value,
      owner.owner,
    );
    if (!session)
      throw new NotFoundException({
        error: "session_not_found",
        detail: "Session was not found.",
      });
    return sessionBody(session);
  }

  @Get("runs/:runId/status")
  async status(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runIdValue: string,
  ): Promise<object> {
    const run = await this.authorizedRun(owner, runIdValue, true);
    return {
      run_id: run.id,
      status: run.status,
      session_id: run.sessionId,
      finished_at: run.finishedAt ?? null,
      response_text: run.responseText,
      data_scope: run.dataScope ?? null,
      error: run.error ?? null,
    };
  }

  @Get("runs/:runId/manifest")
  async manifest(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runIdValue: string,
  ): Promise<object> {
    const run = await this.authorizedRun(owner, runIdValue);
    void run;
    const record = await this.requireEvidence().getManifest(
      owner.owner,
      runId(runIdValue),
    );
    if (!record)
      throw new NotFoundException({ error: "run_manifest_not_found" });
    return {
      run_id: record.runId,
      manifest: record.manifest,
      ...(record.contentHash === undefined
        ? {}
        : { content_hash: record.contentHash }),
      ...(record.manifestName === undefined
        ? {}
        : { manifest_name: record.manifestName }),
      ...(record.sourcePath === undefined
        ? {}
        : { source_path: record.sourcePath }),
      ...(record.yaml === undefined ? {} : { yaml: record.yaml }),
      created_at: record.createdAt,
    };
  }

  @Get("runs/:runId/trace")
  async trace(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runIdValue: string,
    @Query("cursor") cursor?: string,
    @Query("after_seq") afterSeq?: string,
    @Query("limit") limit?: string,
    @Req() request?: object,
    @Query() query?: Record<string, unknown>,
  ): Promise<object> {
    if (request !== undefined) requireV2Pagination(request, query ?? {});
    await this.authorizedRun(owner, runIdValue);
    const page = parsePage(cursor ?? afterSeq, limit);
    if (!page) throw new BadRequestException({ error: "invalid_pagination" });
    const records = await this.requireEvidence().listTrace(
      owner.owner,
      runId(runIdValue),
      String(page.after),
      page.limit,
    );
    const visible = records
      .filter((record) => record.seq > page.after)
      .slice(0, page.limit);
    return {
      run_id: runIdValue,
      events: visible.map((record) => ({
        seq: record.seq,
        event: record.event,
        created_at: record.createdAt,
      })),
      ...(visible.length === page.limit && records.length > visible.length
        ? { next_cursor: String(visible.at(-1)!.seq) }
        : {}),
    };
  }

  @Get("runs/:runId/validation")
  async validation(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runIdValue: string,
  ): Promise<object> {
    await this.authorizedRun(owner, runIdValue);
    const records = await this.requireEvidence().listValidations(
      owner.owner,
      runId(runIdValue),
    );
    return {
      run_id: runIdValue,
      validations: records.map((record) => ({
        name: record.name,
        passed: record.passed,
        details: record.details,
        created_at: record.createdAt,
      })),
    };
  }

  @Get("runs/:runId/report")
  async report(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runIdValue: string,
  ): Promise<object> {
    await this.authorizedRun(owner, runIdValue);
    const report = await this.requireEvidence().getReport(
      owner.owner,
      runId(runIdValue),
    );
    if (!report) throw new NotFoundException({ error: "run_report_not_found" });
    return {
      run_id: report.runId,
      markdown: report.markdown,
      ...(report.artifactId === undefined
        ? {}
        : { artifact_id: report.artifactId }),
      ...(report.byteSize === undefined ? {} : { byte_size: report.byteSize }),
      created_at: report.createdAt,
    };
  }

  @Get("runs/:runId/files")
  async files(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runIdValue: string,
    @Query("cursor") cursor?: string,
    @Query("after_seq") afterSeq?: string,
    @Query("limit") limit?: string,
    @Req() request?: object,
    @Query() query?: Record<string, unknown>,
  ): Promise<object> {
    if (request !== undefined) requireV2Pagination(request, query ?? {});
    await this.authorizedRun(owner, runIdValue);
    const page = parsePage(cursor ?? afterSeq, limit);
    if (!page) throw new BadRequestException({ error: "invalid_pagination" });
    const allRecords = await this.requireFileAccess().list(runId(runIdValue));
    const records = allRecords.slice(page.after, page.after + page.limit);
    return {
      run_id: runIdValue,
      files: records.map((record) => ({
        path: record.path,
        operation: record.operation,
        at: record.at,
      })),
      ...(page.after + records.length < allRecords.length
        ? { next_cursor: String(page.after + records.length) }
        : {}),
    };
  }

  @Get("runs/:runId/files/content")
  async fileContent(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runIdValue: string,
    @Query("path") path: string | undefined,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ): Promise<StreamableFile> {
    const run = await this.authorizedRun(owner, runIdValue);
    const requested = path?.trim();
    if (!requested)
      throw new BadRequestException({ error: "invalid_file_path" });
    const workspace = this.requireWorkspace();
    try {
      const session = await this.requireRuntime().getAuthorizedSession(
        run.sessionId,
        owner.owner,
      );
      if (!session) throw new NotFoundException({ error: "session_not_found" });
      const file = await workspace.readSession(
        owner.owner,
        session.key,
        requested,
        10 * 1_024 * 1_024,
      );
      if (!file) throw new NotFoundException({ error: "file_not_found" });
      if (file.content.byteLength > 10 * 1_024 * 1_024)
        throw new PayloadTooLargeException({ error: "file_too_large" });
      response.setHeader(
        "content-disposition",
        `inline; filename="${file.fileName}"`,
      );
      return new StreamableFile(file.content, { type: file.contentType });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof PayloadTooLargeException
      )
        throw error;
      const code =
        error instanceof Error && "code" in error ? error.code : undefined;
      if (code === "ENOENT")
        throw new NotFoundException({ error: "file_not_found" });
      if (
        error instanceof Error &&
        error.message === "Workspace file is too large."
      )
        throw new PayloadTooLargeException({ error: "file_too_large" });
      if (
        error instanceof Error &&
        (error.message === "Workspace file path is required." ||
          error.message === "Workspace path is outside the workspace.")
      )
        throw new BadRequestException({ error: "invalid_file_path" });
      throw error;
    }
  }

  private async authorizedRun(
    owner: OwnerContext,
    value: string,
    detailedNotFound = false,
  ) {
    const run = await this.requireRuntime().getAuthorizedRun(
      value,
      owner.owner,
    );
    if (!run)
      throw new NotFoundException({
        error: "run_not_found",
        ...(detailedNotFound ? { detail: "Run was not found." } : {}),
      });
    return run;
  }

  private requireRuntime(): RunManager {
    if (this.runtime === undefined)
      throw new ServiceUnavailableException({
        error: "runtime_not_configured",
      });
    return this.runtime;
  }

  private requireEvidence(): RunEvidencePort {
    if (this.evidence === undefined)
      throw new ServiceUnavailableException({
        error: "evidence_not_configured",
      });
    return this.evidence;
  }

  private requireFileAccess(): FileAccessPort {
    if (this.fileAccess === undefined)
      throw new ServiceUnavailableException({
        error: "file_access_not_configured",
      });
    return this.fileAccess;
  }

  private requireWorkspace(): WorkspaceProvider {
    if (this.workspace === undefined)
      throw new ServiceUnavailableException({
        error: "workspace_not_configured",
      });
    return this.workspace;
  }
}

function sessionBody(
  session: Awaited<ReturnType<RunManager["getSessionByKey"]>>,
): object {
  if (!session) return {};
  return {
    id: session.id,
    key: session.key,
    mode: session.mode,
    turns: session.turns,
    pending_question: session.pendingQuestion ?? null,
    pending_client_tool: session.pendingClientTool ?? null,
    pending_plan: session.pendingPlan ?? null,
    pending_approval:
      session.pendingApproval === undefined
        ? null
        : {
            approval_id: session.pendingApproval.approvalId,
            run_id: session.pendingApproval.runId,
            tool_call_id: session.pendingApproval.toolCallId,
            action: session.pendingApproval.action,
            arguments_hash: session.pendingApproval.argumentsHash,
            preview: session.pendingApproval.preview,
            expires_at: session.pendingApproval.expiresAt,
          },
  };
}

function parsePage(
  rawAfter: string | undefined,
  rawLimit: string | undefined,
): { after: number; limit: number } | undefined {
  const after = rawAfter === undefined ? 0 : Number.parseInt(rawAfter, 10);
  const limit = rawLimit === undefined ? 100 : Number.parseInt(rawLimit, 10);
  if (
    !Number.isInteger(after) ||
    after < 0 ||
    !Number.isInteger(limit) ||
    limit < 1
  )
    return undefined;
  return { after, limit: Math.min(limit, 500) };
}
