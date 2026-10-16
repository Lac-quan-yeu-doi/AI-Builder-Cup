import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type {
  ApprovalRecord,
  ApprovalService,
  PlanResumer,
  RunManager,
} from "@application/runtime";
import { APPROVAL_SERVICE, RUN_MANAGER } from "@modules/tokens.js";
import { CurrentOwner } from "@presentation/http/common/auth/current-owner.decorator.js";
import { OwnerAuthGuard } from "@presentation/http/common/auth/owner-auth.guard.js";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { ApprovalDecisionDto } from "@presentation/http/contracts/validation.js";

@UseGuards(OwnerAuthGuard)
@Controller({ path: "runs", version: ["1", "2"] })
export class ApprovalsNestController {
  constructor(
    @Optional()
    @Inject(RUN_MANAGER)
    private readonly runtime: RunManager | undefined,
    @Optional()
    @Inject(APPROVAL_SERVICE)
    private readonly approvals: ApprovalService | undefined,
  ) {}

  @Get(":runId/approvals")
  async list(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runId: string,
  ): Promise<object[]> {
    const runtime = this.requireRuntime();
    this.requireApprovals();
    const run = await runtime.getAuthorizedRun(runId, owner.owner);
    if (!run) throw new NotFoundException({ error: "run_not_found" });
    return (await this.approvals!.list({ owner: owner.owner, runId })).map(
      body,
    );
  }

  @Post(":runId/approvals/:approvalId/decision")
  @HttpCode(HttpStatus.OK)
  async decide(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runId: string,
    @Param("approvalId") approvalId: string,
    @Body() input: ApprovalDecisionDto,
  ): Promise<object> {
    const runtime = this.requireRuntime();
    const approvals = this.requireApprovals();
    const run = await runtime.getAuthorizedRun(runId, owner.owner);
    if (!run) throw new NotFoundException({ error: "run_not_found" });
    const decision = input?.decision;
    if (decision !== "approved" && decision !== "denied")
      throw new BadRequestException({ error: "approval_decision_invalid" });
    const approval = await approvals.decide({
      owner: owner.owner,
      runId,
      approvalId,
      decision,
    });
    if (!approval) throw new NotFoundException({ error: "approval_not_found" });
    const resumed = await runtime.resumeApproval({
      owner: owner.owner,
      runId,
      approvalId,
    });
    return {
      ...body(approval),
      continuation_run_id: resumed.kind === "started" ? resumed.run.id : null,
    };
  }

  @Post(":runId/plan/decision")
  @HttpCode(HttpStatus.OK)
  async decidePlan(
    @CurrentOwner() owner: OwnerContext,
    @Param("runId") runId: string,
    @Body() input: ApprovalDecisionDto,
  ): Promise<object> {
    const runtime = this.requireRuntime();
    const run = await runtime.getAuthorizedRun(runId, owner.owner);
    if (!run) throw new NotFoundException({ error: "run_not_found" });
    const planner = planResumer(runtime);
    if (!planner)
      throw new ServiceUnavailableException({
        error: "plan_resume_not_configured",
      });
    const decision = input?.decision;
    if (decision !== "approved" && decision !== "denied")
      throw new BadRequestException({ error: "plan_decision_invalid" });
    const resumed = await planner.resumePlan({
      owner: owner.owner,
      runId,
      decision,
    });
    if (resumed.kind === "not_found")
      throw new NotFoundException({ error: "plan_not_found" });
    if (resumed.kind === "resolved")
      return { status: resumed.status, continuation_run_id: null };
    if (resumed.kind === "started")
      return { status: "approved", continuation_run_id: resumed.run.id };
    throw new ConflictException({ error: "plan_resume_rejected" });
  }

  private requireRuntime(): RunManager {
    if (this.runtime === undefined)
      throw new ServiceUnavailableException({
        error: "runtime_not_configured",
      });
    return this.runtime;
  }

  private requireApprovals(): ApprovalService {
    if (this.approvals === undefined)
      throw new ServiceUnavailableException({
        error: "approval_store_not_configured",
      });
    return this.approvals;
  }
}

function planResumer(
  runtime: RunManager,
): (RunManager & PlanResumer) | undefined {
  return "resumePlan" in runtime && typeof runtime.resumePlan === "function"
    ? (runtime as RunManager & PlanResumer)
    : undefined;
}

function body(value: ApprovalRecord): object {
  return {
    action: value.action,
    arguments_hash: value.argumentsHash,
    created_at: value.createdAt,
    ...(value.decidedAt === undefined ? {} : { decided_at: value.decidedAt }),
    expires_at: value.expiresAt,
    id: value.id,
    preview: value.preview,
    status: value.status,
    tool_call_id: value.toolCallId,
  };
}
