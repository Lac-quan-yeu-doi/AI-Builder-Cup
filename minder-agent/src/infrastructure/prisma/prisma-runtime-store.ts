import { randomUUID } from "node:crypto";
import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import type { AgentEvent, RunMode } from "@domain/shared";
import type {
  AdmittedGovernancePolicy,
  RedactedGovernancePolicySummary,
} from "@domain/runtime/governance-policy.js";
import type {
  GovernanceEvidenceInput,
  GovernanceEvidencePage,
  GovernanceEvidenceRecord,
} from "@domain/runtime/governance-evidence.js";
import type { RunContext } from "@domain/runtime/run-context.js";
import type { DataScope } from "@infrastructure/mcp";
import type {
  ApprovalExecutionClaim,
  EventEnvelope,
  RuntimeLoopSnapshot,
  RuntimeRoomDelegation,
  RuntimeRun,
  RuntimeRunStatus,
  RuntimeSession,
  RuntimeSessionUpdate,
  RuntimeStore,
} from "@application/runtime/execution/types.js";
import { RuntimeStoreError } from "@application/runtime/execution/errors.js";
import {
  governanceAdmissionFromRow,
  governanceEvidenceFromRow,
  runFromPrisma,
  sessionFromPrisma,
  type GovernanceEvidenceRow,
} from "./mappers/runtime.js";
import { migratePrismaSchema } from "./schema/migrate.js";
import { PrismaService } from "./prisma.service.js";
import { serializable } from "./transactions.js";

export interface PrismaRuntimeStoreOptions {
  readonly prisma?: PrismaService;
  readonly schema?: string;
}

export class PrismaRuntimeStore implements RuntimeStore {
  readonly prisma: PrismaService;
  private readonly ownsPrisma: boolean;
  private readonly schema: string | undefined;

  constructor(input: PrismaService | PrismaRuntimeStoreOptions = {}) {
    const options = isPrismaService(input) ? {} : input;
    const prisma = isPrismaService(input) ? input : input.prisma;
    this.prisma = prisma ?? new PrismaService();
    this.ownsPrisma = prisma === undefined;
    this.schema = options.schema ?? process.env.MINDER_DATABASE_SCHEMA;
  }

  async migrate(): Promise<void> {
    await migratePrismaSchema(this.prisma, this.schema);
  }

  async close(): Promise<void> {
    if (this.ownsPrisma) await this.prisma.$disconnect();
  }

  async getOrCreateSession(
    owner: string,
    key: string,
    mode: RunMode,
  ): Promise<RuntimeSession> {
    return serializable(this.prisma, async (tx) => {
      const row = await tx.session.upsert({
        where: { owner_key: { owner, key } },
        create: { id: randomUUID(), key, mode, owner, history: [] },
        update: {},
      });
      if (row.mode !== mode)
        throw new RuntimeStoreError(
          "mode_conflict",
          `Session ${key} already uses ${row.mode} mode.`,
        );
      return sessionFromPrisma(row);
    });
  }

  async getSession(id: string): Promise<RuntimeSession | undefined> {
    const row = await this.prisma.session.findUnique({ where: { id } });
    return row === null ? undefined : sessionFromPrisma(row);
  }

  async getSessionByKey(
    owner: string,
    key: string,
  ): Promise<RuntimeSession | undefined> {
    const row = await this.prisma.session.findFirst({ where: { owner, key } });
    return row === null ? undefined : sessionFromPrisma(row);
  }

  async createRun(
    sessionId: string,
    input: string,
    mode: RunMode,
    trigger: { source: string; deliveryId?: string },
    governance?: AdmittedGovernancePolicy,
    manifestName?: string,
    dataScope?: DataScope,
    delegation?: RuntimeRoomDelegation,
    manifestOwner?: string,
    context?: RunContext,
    runId?: string,
  ): Promise<RuntimeRun> {
    return this.insertRun(
      sessionId,
      input,
      mode,
      trigger,
      "queued",
      governance,
      manifestName,
      dataScope,
      delegation,
      manifestOwner,
      context,
      runId,
    );
  }

  async startRun(
    sessionId: string,
    input: string,
    mode: RunMode,
    trigger: { source: string; deliveryId?: string },
    governance?: AdmittedGovernancePolicy,
    manifestName?: string,
    dataScope?: DataScope,
    delegation?: RuntimeRoomDelegation,
    manifestOwner?: string,
    context?: RunContext,
    runId?: string,
  ): Promise<RuntimeRun | undefined> {
    try {
      return await this.insertRun(
        sessionId,
        input,
        mode,
        trigger,
        "running",
        governance,
        manifestName,
        dataScope,
        delegation,
        manifestOwner,
        context,
        runId,
      );
    } catch (error) {
      if (isUniqueViolation(error)) return undefined;
      throw error;
    }
  }

  async getRun(id: string): Promise<RuntimeRun | undefined> {
    const row = await this.prisma.run.findUnique({ where: { id } });
    if (row === null) return undefined;
    const governance = await this.prisma.runGovernancePolicy.findUnique({
      where: { runId: id },
    });
    return runFromPrisma(
      row,
      governance === null
        ? null
        : {
            owner: governance.owner,
            revisionHash: governance.revisionHash,
            policy: governance.policy,
            summary:
              governance.summary as unknown as RedactedGovernancePolicySummary,
            admittedAt: governance.admittedAt,
          },
    );
  }

  async getRunDelegation(
    runId: string,
  ): Promise<RuntimeRoomDelegation | undefined> {
    const row = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { delegation: true },
    });
    return row?.delegation == null
      ? undefined
      : (structuredClone(row.delegation) as unknown as RuntimeRoomDelegation);
  }

  async getGovernanceAdmission(runId: string, owner: string) {
    const row = await this.prisma.runGovernancePolicy.findFirst({
      where: { runId, owner },
    });
    return row === null
      ? undefined
      : governanceAdmissionFromRow({
          run_id: row.runId,
          owner: row.owner,
          revision_hash: row.revisionHash,
          policy: row.summary as unknown as RedactedGovernancePolicySummary,
          admitted_at: row.admittedAt,
        });
  }

  async appendGovernanceEvidence(
    owner: string,
    input: GovernanceEvidenceInput,
  ): Promise<GovernanceEvidenceRecord> {
    return serializable(this.prisma, (tx) =>
      this.appendGovernanceEvidenceTx(tx, owner, input),
    );
  }

  async listGovernanceEvidence(
    owner: string,
    runId: string,
    cursor?: string,
    limit = 50,
  ): Promise<GovernanceEvidencePage> {
    const after = Number.parseInt(cursor ?? "0", 10);
    const size = Math.max(1, Math.min(limit, 100));
    if (!(await this.ownsRun(owner, runId))) return { items: [] };
    const rows = await this.prisma.runGovernanceEvidence.findMany({
      where: {
        runId,
        seq: { gt: BigInt(Number.isFinite(after) && after >= 0 ? after : 0) },
      },
      orderBy: { seq: "asc" },
      take: size + 1,
    });
    const values = rows.map((row) =>
      governanceEvidenceFromRow({
        id: row.id,
        run_id: row.runId,
        owner: row.owner,
        seq: row.seq,
        kind: row.kind as GovernanceEvidenceRecord["kind"],
        detail: row.detail as GovernanceEvidenceRecord["detail"],
        at: row.at,
      } satisfies GovernanceEvidenceRow),
    );
    const items = values.slice(0, size);
    return {
      items,
      ...(values.length > size && items.length > 0
        ? { nextCursor: String(items[items.length - 1]!.seq) }
        : {}),
    };
  }

  async markRunning(runId: string): Promise<boolean> {
    return (
      (
        await this.prisma.run.updateMany({
          where: { id: runId, status: "queued" },
          data: { status: "running" },
        })
      ).count === 1
    );
  }

  async activeRunId(sessionId: string): Promise<string | undefined> {
    const row = await this.prisma.run.findFirst({
      where: { sessionId, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return row?.id;
  }

  async finishRun(
    runId: string,
    status: Exclude<RuntimeRunStatus, "queued" | "running">,
    error?: string,
    responseText = "",
  ): Promise<RuntimeRun> {
    const count = (
      await this.prisma.run.updateMany({
        where: { id: runId },
        data: {
          status,
          error: error ?? null,
          responseText,
          finishedAt: new Date(),
        },
      })
    ).count;
    if (count !== 1)
      throw new RuntimeStoreError(
        "run_not_found",
        `Run ${runId} was not found.`,
      );
    return (await this.getRun(runId))!;
  }

  async commitSession(
    sessionId: string,
    update: RuntimeSessionUpdate,
  ): Promise<RuntimeSession> {
    const count = (
      await this.prisma.session.updateMany({
        where: { id: sessionId },
        data: {
          history: jsonInput(update.history),
          pendingQuestion: jsonOrNull(update.pendingQuestion),
          pendingClientTool: jsonOrNull(update.pendingClientTool),
          pendingPlan: jsonOrNull(update.pendingPlan),
          pendingApproval: jsonOrNull(update.pendingApproval),
          turns: { increment: 1 },
          updatedAt: new Date(),
        },
      })
    ).count;
    if (count !== 1)
      throw new RuntimeStoreError(
        "session_not_found",
        `Session ${sessionId} was not found.`,
      );
    return (await this.getSession(sessionId))!;
  }

  async saveLoopSnapshot(
    sessionId: string,
    snapshot: RuntimeLoopSnapshot,
  ): Promise<void> {
    if (
      (
        await this.prisma.session.updateMany({
          where: { id: sessionId },
          data: { loopSnapshot: jsonInput(snapshot), updatedAt: new Date() },
        })
      ).count !== 1
    )
      throw new RuntimeStoreError(
        "session_not_found",
        `Session ${sessionId} was not found.`,
      );
  }

  async getLoopSnapshot(
    sessionId: string,
  ): Promise<RuntimeLoopSnapshot | undefined> {
    const row = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { loopSnapshot: true },
    });
    if (row === null)
      throw new RuntimeStoreError(
        "session_not_found",
        `Session ${sessionId} was not found.`,
      );
    return row.loopSnapshot == null
      ? undefined
      : (structuredClone(row.loopSnapshot) as RuntimeLoopSnapshot);
  }

  async appendEvent(
    runId: string,
    payload: AgentEvent,
  ): Promise<EventEnvelope> {
    return serializable(this.prisma, async (tx) => {
      if (
        (await tx.run.findUnique({
          where: { id: runId },
          select: { id: true },
        })) === null
      )
        throw new RuntimeStoreError(
          "run_not_found",
          `Run ${runId} was not found.`,
        );
      const previous = await tx.runEvent.findFirst({
        where: { runId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      const seq = (previous?.seq ?? 0) + 1;
      await tx.runEvent.create({
        data: { runId, seq, event: jsonInput(payload) },
      });
      return { runId, seq, payload: structuredClone(payload) };
    });
  }

  async replay(
    runId: string,
    afterSeq: number,
    limit: number,
  ): Promise<readonly EventEnvelope[]> {
    const rows = await this.prisma.runEvent.findMany({
      where: { runId, seq: { gt: afterSeq } },
      orderBy: { seq: "asc" },
      take: limit,
    });
    return rows.map((row) => ({
      runId: row.runId,
      seq: row.seq,
      payload: structuredClone(row.event) as AgentEvent,
    }));
  }

  async claimDelivery(source: string, deliveryId: string): Promise<boolean> {
    try {
      await this.prisma.triggerDelivery.create({
        data: { source, deliveryId },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  async claimApprovalExecution(input: {
    owner: string;
    runId: string;
    approvalId: string;
  }): Promise<ApprovalExecutionClaim> {
    try {
      await this.prisma.runApprovalExecutionClaim.create({
        data: {
          approvalId: input.approvalId,
          owner: input.owner,
          runId: input.runId,
          state: "claimed",
        },
      });
      return "claimed";
    } catch (error) {
      if (isUniqueViolation(error)) return "ambiguous";
      throw error;
    }
  }

  async completeApprovalExecution(input: {
    owner: string;
    runId: string;
    approvalId: string;
  }): Promise<void> {
    await this.prisma.runApprovalExecutionClaim.updateMany({
      where: {
        approvalId: input.approvalId,
        owner: input.owner,
        runId: input.runId,
        state: "claimed",
      },
      data: { state: "completed", completedAt: new Date() },
    });
  }

  async finalizeRun(
    runId: string,
    status: Exclude<RuntimeRunStatus, "queued" | "running">,
    update: RuntimeSessionUpdate,
    error?: string,
    doneEvent?: AgentEvent,
    responseText = "",
  ): Promise<{ run: RuntimeRun; doneEvent?: EventEnvelope }> {
    return serializable(this.prisma, async (tx) => {
      const run = await tx.run.findUnique({ where: { id: runId } });
      if (run === null)
        throw new RuntimeStoreError(
          "run_not_found",
          `Run ${runId} was not found.`,
        );
      let finalEvent: EventEnvelope | undefined;
      if (doneEvent !== undefined) {
        const previous = await tx.runEvent.findFirst({
          where: { runId },
          orderBy: { seq: "desc" },
          select: { seq: true },
        });
        const seq = (previous?.seq ?? 0) + 1;
        await tx.runEvent.create({
          data: { runId, seq, event: jsonInput(doneEvent) },
        });
        finalEvent = { runId, seq, payload: structuredClone(doneEvent) };
      }
      await tx.session.update({
        where: { id: run.sessionId },
        data: {
          history: jsonInput(update.history),
          pendingQuestion: jsonOrNull(update.pendingQuestion),
          pendingClientTool: jsonOrNull(update.pendingClientTool),
          pendingPlan: jsonOrNull(update.pendingPlan),
          pendingApproval: jsonOrNull(update.pendingApproval),
          turns: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      const updated = await tx.run.update({
        where: { id: runId },
        data: {
          status,
          error: error ?? null,
          responseText,
          finishedAt: new Date(),
        },
      });
      return {
        run: runFromPrisma(updated),
        ...(finalEvent === undefined ? {} : { doneEvent: finalEvent }),
      };
    });
  }

  async recoverInterrupted(): Promise<void> {
    await serializable(this.prisma, async (tx) => {
      await tx.runApprovalExecutionClaim.updateMany({
        where: { state: "claimed" },
        data: { state: "ambiguous" },
      });
      const active = await tx.run.findMany({
        where: { status: { in: ["queued", "running"] } },
        orderBy: { createdAt: "asc" },
      });
      for (const run of active) {
        if (
          run.status === "queued" &&
          (await tx.roomRun.findFirst({
            where: { runId: run.id },
            select: { runId: true },
          })) !== null
        )
          continue;
        const session = await tx.session.findUnique({
          where: { id: run.sessionId },
          select: { owner: true },
        });
        if (session === null) continue;
        const previous = await tx.runEvent.findFirst({
          where: { runId: run.id },
          orderBy: { seq: "desc" },
          select: { seq: true },
        });
        await tx.runEvent.create({
          data: {
            runId: run.id,
            seq: (previous?.seq ?? 0) + 1,
            event: jsonInput({
              type: "done",
              data: { response_text: run.responseText },
            }),
          },
        });
        await tx.run.update({
          where: { id: run.id },
          data: {
            status: "interrupted",
            error: run.error ?? "Run interrupted by process restart",
            finishedAt: run.finishedAt ?? new Date(),
          },
        });
        if (
          (await tx.runGovernancePolicy.findUnique({
            where: { runId: run.id },
            select: { runId: true },
          })) !== null
        ) {
          await this.appendGovernanceEvidenceTx(tx, session.owner, {
            runId: run.id,
            at: new Date().toISOString(),
            kind: "recovery",
            detail: {
              phase: "startup_recovery",
              reason: "run was active when the runtime restarted",
            },
          });
        }
      }
    });
  }

  private async insertRun(
    sessionId: string,
    input: string,
    mode: RunMode,
    trigger: { source: string; deliveryId?: string },
    status: "queued" | "running",
    governance?: AdmittedGovernancePolicy,
    manifestName?: string,
    dataScope?: DataScope,
    delegation?: RuntimeRoomDelegation,
    manifestOwner?: string,
    context?: RunContext,
    runId?: string,
  ): Promise<RuntimeRun> {
    return serializable(this.prisma, async (tx) => {
      const row = await tx.run.create({
        data: {
          id: runId ?? randomUUID(),
          sessionId,
          status,
          mode,
          triggerSource: trigger.source,
          deliveryId: trigger.deliveryId ?? null,
          input,
          manifestName: manifestName ?? null,
          manifestOwner: manifestOwner ?? null,
          dataScope: jsonOrNull(dataScope),
          context: jsonOrNull(context),
          delegation: jsonOrNull(delegation),
        },
      });
      if (governance === undefined) return runFromPrisma(row);
      await tx.runGovernancePolicy.create({
        data: {
          runId: row.id,
          owner: governance.owner,
          revisionHash: governance.policyRevision,
          policy: jsonOrNull(governance.policy),
          summary: jsonInput(governance.summary),
          admittedAt: new Date(governance.admittedAt),
        },
      });
      await this.appendGovernanceEvidenceTx(tx, governance.owner, {
        runId: row.id,
        at: governance.admittedAt,
        kind: "admission",
        detail: {
          policyRevision: governance.policyRevision,
          summary: structuredClone(governance.summary),
        },
      });
      return runFromPrisma(row, {
        owner: governance.owner,
        revisionHash: governance.policyRevision,
        policy: governance.policy ?? null,
        summary: governance.summary,
        admittedAt: new Date(governance.admittedAt),
      });
    });
  }

  private async ownsRun(owner: string, runId: string): Promise<boolean> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { sessionId: true },
    });
    return (
      run !== null &&
      (await this.prisma.session.findFirst({
        where: { id: run.sessionId, owner },
        select: { id: true },
      })) !== null
    );
  }

  private async appendGovernanceEvidenceTx(
    tx: PrismaTypes.TransactionClient,
    owner: string,
    input: GovernanceEvidenceInput,
  ): Promise<GovernanceEvidenceRecord> {
    const run = await tx.run.findUnique({
      where: { id: input.runId },
      select: { sessionId: true },
    });
    const owned =
      run !== null &&
      (await tx.session.findFirst({
        where: { id: run.sessionId, owner },
        select: { id: true },
      })) !== null;
    if (!owned)
      throw new RuntimeStoreError(
        "run_not_found",
        `Run ${input.runId} was not found.`,
      );
    const previous = await tx.runGovernanceEvidence.findFirst({
      where: { runId: input.runId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    const row = await tx.runGovernanceEvidence.create({
      data: {
        id: randomUUID(),
        runId: input.runId,
        owner,
        seq: (previous?.seq ?? 0n) + 1n,
        kind: input.kind,
        detail: jsonInput(input.detail),
        at: new Date(input.at),
      },
    });
    return governanceEvidenceFromRow({
      id: row.id,
      run_id: row.runId,
      owner: row.owner,
      seq: row.seq,
      kind: row.kind as GovernanceEvidenceRecord["kind"],
      detail: row.detail as GovernanceEvidenceRecord["detail"],
      at: row.at,
    } satisfies GovernanceEvidenceRow);
  }
}

function jsonInput(value: unknown): PrismaTypes.InputJsonValue {
  return value as PrismaTypes.InputJsonValue;
}

function jsonOrNull(
  value: unknown,
): PrismaTypes.InputJsonValue | PrismaTypes.NullableJsonNullValueInput {
  return value === undefined || value === null
    ? Prisma.JsonNull
    : jsonInput(value);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function isPrismaService(
  value: PrismaService | PrismaRuntimeStoreOptions,
): value is PrismaService {
  return "$transaction" in value && "$disconnect" in value;
}
