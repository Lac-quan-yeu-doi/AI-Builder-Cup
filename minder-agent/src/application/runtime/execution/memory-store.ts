import type {
  ChatMessage,
  DataScope,
} from "@application/shared/ports/index.js";
import type {
  AgentEvent,
  AskUserRequest,
  ClientToolCallRequest,
  ProposedPlan,
  RunMode,
} from "@domain/shared";
import type {
  EventEnvelope,
  RuntimeRun,
  RuntimeRoomDelegation,
  RuntimeRunStatus,
  RuntimeSession,
  RuntimeSessionUpdate,
  RuntimeLoopSnapshot,
  RuntimeStore,
  ApprovalExecutionClaim,
  RuntimeGovernanceAdmission,
} from "./types.js";
import type { AdmittedGovernancePolicy } from "@domain/runtime/governance-policy.js";
import type { RunContext } from "@domain/runtime/run-context.js";
import {
  type GovernanceEvidenceInput,
  type GovernanceEvidencePage,
  type GovernanceEvidenceRecord,
} from "@domain/runtime/governance-evidence.js";
import { RuntimeStoreError } from "./errors.js";

const TERMINAL_STATUSES = new Set<RuntimeRunStatus>([
  "awaiting_input",
  "awaiting_client_tool",
  "awaiting_plan_confirmation",
  "awaiting_approval",
  "backgrounded",
  "completed",
  "failed",
  "interrupted",
]);

export class InMemoryRuntimeStore implements RuntimeStore {
  private readonly sessions = new Map<string, MutableSession>();
  private readonly sessionKeys = new Map<string, string>();
  private readonly runs = new Map<string, MutableRun>();
  private readonly governanceAdmissions = new Map<
    string,
    RuntimeGovernanceAdmission
  >();
  private readonly governanceEvidence = new Map<
    string,
    GovernanceEvidenceRecord[]
  >();
  private readonly journals = new Map<string, EventEnvelope[]>();
  private readonly loopSnapshots = new Map<string, RuntimeLoopSnapshot>();
  private readonly deliveries = new Set<string>();
  private readonly approvalExecutionClaims = new Map<
    string,
    "claimed" | "completed" | "ambiguous"
  >();

  getOrCreateSession(
    owner: string,
    key: string,
    mode: RunMode,
  ): RuntimeSession {
    const lookup = ownerKey(owner, key);
    const existingId = this.sessionKeys.get(lookup);
    if (existingId !== undefined) {
      const existing = this.sessions.get(existingId)!;
      if (existing.mode !== mode) {
        throw new RuntimeStoreError(
          "mode_conflict",
          `Session ${key} already uses ${existing.mode} mode.`,
        );
      }
      return snapshotSession(existing);
    }
    const session: MutableSession = {
      id: crypto.randomUUID(),
      key,
      owner,
      mode,
      history: [],
      turns: 0,
    };
    this.sessions.set(session.id, session);
    this.sessionKeys.set(lookup, session.id);
    return snapshotSession(session);
  }

  getSession(id: string): RuntimeSession | undefined {
    const session = this.sessions.get(id);
    return session ? snapshotSession(session) : undefined;
  }

  getSessionByKey(owner: string, key: string): RuntimeSession | undefined {
    const id = this.sessionKeys.get(ownerKey(owner, key));
    return id === undefined ? undefined : this.getSession(id);
  }

  createRun(
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
  ): RuntimeRun {
    const session = this.sessions.get(sessionId);
    if (!session)
      throw new RuntimeStoreError(
        "session_not_found",
        `Session ${sessionId} was not found.`,
      );
    const run: MutableRun = {
      id: runId ?? crypto.randomUUID(),
      sessionId,
      mode,
      input,
      trigger: structuredClone(trigger),
      status: "queued",
      createdAt: new Date().toISOString(),
      responseText: "",
      ...(manifestName === undefined ? {} : { manifestName }),
      ...(manifestOwner === undefined ? {} : { manifestOwner }),
      ...(dataScope === undefined
        ? {}
        : { dataScope: structuredClone(dataScope) }),
      ...(context === undefined ? {} : { context: structuredClone(context) }),
      ...(delegation === undefined
        ? {}
        : { delegation: structuredClone(delegation) }),
      ...(governance === undefined
        ? {}
        : { governance: structuredClone(governance) }),
    };
    this.runs.set(run.id, run);
    this.governanceEvidence.set(run.id, []);
    if (governance !== undefined) {
      this.governanceAdmissions.set(run.id, {
        owner: session.owner,
        runId: run.id,
        policyRevision: governance.policyRevision,
        policy: structuredClone(governance.summary),
        admittedAt: governance.admittedAt,
      });
      this.appendGovernanceEvidence(session.owner, {
        runId: run.id,
        at: governance.admittedAt,
        kind: "admission",
        detail: {
          policyRevision: governance.policyRevision,
          summary: structuredClone(governance.summary),
        },
      });
    }
    this.journals.set(run.id, []);
    return snapshotRun(run);
  }

  startRun(
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
  ): RuntimeRun | undefined {
    if (this.activeRunId(sessionId) !== undefined) return undefined;
    const run = this.createRun(
      sessionId,
      input,
      mode,
      trigger,
      governance,
      manifestName,
      dataScope,
      delegation,
      manifestOwner,
      context,
      runId,
    );
    if (!this.markRunning(run.id)) return undefined;
    return this.getRun(run.id);
  }

  getRun(id: string): RuntimeRun | undefined {
    const run = this.runs.get(id);
    return run ? snapshotRun(run) : undefined;
  }

  getRunDelegation(runId: string): RuntimeRoomDelegation | undefined {
    const delegation = this.runs.get(runId)?.delegation;
    return delegation === undefined ? undefined : structuredClone(delegation);
  }

  getGovernanceAdmission(
    runId: string,
    owner: string,
  ): RuntimeGovernanceAdmission | undefined {
    const admission = this.governanceAdmissions.get(runId);
    return admission?.owner === owner ? structuredClone(admission) : undefined;
  }

  appendGovernanceEvidence(
    owner: string,
    input: GovernanceEvidenceInput,
  ): GovernanceEvidenceRecord {
    const run = this.requireRun(input.runId);
    const session = this.sessions.get(run.sessionId)!;
    if (session.owner !== owner)
      throw new RuntimeStoreError(
        "run_not_found",
        `Run ${input.runId} was not found.`,
      );
    const items = this.governanceEvidence.get(input.runId)!;
    const record: GovernanceEvidenceRecord = {
      id: crypto.randomUUID(),
      owner,
      runId: input.runId,
      seq: items.length + 1,
      at: input.at,
      kind: input.kind,
      detail: structuredClone(input.detail),
    };
    items.push(record);
    return structuredClone(record);
  }

  listGovernanceEvidence(
    owner: string,
    runId: string,
    cursor?: string,
    limit = 50,
  ): GovernanceEvidencePage {
    const run = this.runs.get(runId);
    if (!run) return { items: [] };
    const session = this.sessions.get(run.sessionId)!;
    if (session.owner !== owner) return { items: [] };
    const after = cursor === undefined ? 0 : Number.parseInt(cursor, 10);
    const safeAfter = Number.isFinite(after) && after >= 0 ? after : 0;
    const size = Math.max(1, Math.min(limit, 100));
    const values = this.governanceEvidence
      .get(runId)!
      .filter((value) => value.seq > safeAfter)
      .slice(0, size + 1);
    const hasMore = values.length > size;
    const items = values.slice(0, size).map((value) => structuredClone(value));
    return {
      items,
      ...(hasMore && items.length > 0
        ? { nextCursor: String(items[items.length - 1]!.seq) }
        : {}),
    };
  }

  markRunning(runId: string): boolean {
    const run = this.requireRun(runId);
    const session = this.sessions.get(run.sessionId)!;
    if (session.activeRunId !== undefined) return false;
    if (run.status !== "queued")
      throw new RuntimeStoreError(
        "invalid_transition",
        `Run ${runId} is not queued.`,
      );
    run.status = "running";
    session.activeRunId = runId;
    return true;
  }

  activeRunId(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.activeRunId;
  }

  finishRun(
    runId: string,
    status: Extract<
      RuntimeRunStatus,
      | "awaiting_input"
      | "awaiting_client_tool"
      | "awaiting_plan_confirmation"
      | "awaiting_approval"
      | "backgrounded"
      | "completed"
      | "failed"
      | "interrupted"
    >,
    error?: string,
    responseText = "",
  ): RuntimeRun {
    const run = this.requireRun(runId);
    if (!TERMINAL_STATUSES.has(status))
      throw new RuntimeStoreError(
        "invalid_transition",
        `Run ${runId} cannot finish as ${status}.`,
      );
    run.status = status;
    run.finishedAt = new Date().toISOString();
    run.responseText = responseText;
    if (error === undefined) delete run.error;
    else run.error = error;
    const session = this.sessions.get(run.sessionId)!;
    if (session.activeRunId === runId) delete session.activeRunId;
    return snapshotRun(run);
  }

  commitSession(
    sessionId: string,
    update: RuntimeSessionUpdate,
  ): RuntimeSession {
    const session = this.requireSession(sessionId);
    session.history = update.history.map((message) => structuredClone(message));
    session.turns += 1;
    if (update.pendingQuestion === undefined) delete session.pendingQuestion;
    else session.pendingQuestion = structuredClone(update.pendingQuestion);
    if (update.pendingClientTool === undefined)
      delete session.pendingClientTool;
    else session.pendingClientTool = structuredClone(update.pendingClientTool);
    if (update.pendingPlan === undefined) delete session.pendingPlan;
    else session.pendingPlan = structuredClone(update.pendingPlan);
    if (update.pendingApproval === undefined) delete session.pendingApproval;
    else session.pendingApproval = structuredClone(update.pendingApproval);
    return snapshotSession(session);
  }

  appendEvent(runId: string, payload: AgentEvent): EventEnvelope {
    this.requireRun(runId);
    const journal = this.journals.get(runId)!;
    const envelope: EventEnvelope = {
      runId,
      seq: journal.length + 1,
      payload: structuredClone(payload),
    };
    journal.push(envelope);
    return structuredClone(envelope);
  }

  replay(
    runId: string,
    afterSeq: number,
    limit: number,
  ): readonly EventEnvelope[] {
    this.requireRun(runId);
    const journal = this.journals.get(runId)!;
    return journal
      .filter((event) => event.seq > afterSeq)
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }

  claimDelivery(source: string, deliveryId: string): boolean {
    const key = `${source}\u0000${deliveryId}`;
    if (this.deliveries.has(key)) return false;
    this.deliveries.add(key);
    return true;
  }

  claimApprovalExecution(input: {
    owner: string;
    runId: string;
    approvalId: string;
  }): ApprovalExecutionClaim {
    const key = approvalClaimKey(input);
    if (this.approvalExecutionClaims.has(key)) return "ambiguous";
    this.approvalExecutionClaims.set(key, "claimed");
    return "claimed";
  }

  completeApprovalExecution(input: {
    owner: string;
    runId: string;
    approvalId: string;
  }): void {
    const key = approvalClaimKey(input);
    if (this.approvalExecutionClaims.get(key) === "claimed")
      this.approvalExecutionClaims.set(key, "completed");
  }

  recoverInterrupted(): void {
    for (const [key, state] of this.approvalExecutionClaims) {
      if (state === "claimed")
        this.approvalExecutionClaims.set(key, "ambiguous");
    }
    for (const run of this.runs.values()) {
      if (run.status !== "queued" && run.status !== "running") continue;
      const session = this.sessions.get(run.sessionId);
      if (!session || !this.governanceAdmissions.has(run.id)) continue;
      this.appendGovernanceEvidence(session.owner, {
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

  saveLoopSnapshot(sessionId: string, snapshot: RuntimeLoopSnapshot): void {
    this.requireSession(sessionId);
    this.loopSnapshots.set(sessionId, structuredClone(snapshot));
  }

  getLoopSnapshot(sessionId: string): RuntimeLoopSnapshot | undefined {
    this.requireSession(sessionId);
    const snapshot = this.loopSnapshots.get(sessionId);
    return snapshot === undefined ? undefined : structuredClone(snapshot);
  }

  finalizeRun(
    runId: string,
    status: Extract<
      RuntimeRunStatus,
      | "awaiting_input"
      | "awaiting_client_tool"
      | "awaiting_plan_confirmation"
      | "awaiting_approval"
      | "backgrounded"
      | "completed"
      | "failed"
      | "interrupted"
    >,
    update: RuntimeSessionUpdate,
    error?: string,
    doneEvent?: AgentEvent,
    responseText = "",
  ): { run: RuntimeRun; doneEvent?: EventEnvelope } {
    const event =
      doneEvent === undefined ? undefined : this.appendEvent(runId, doneEvent);
    this.commitSession(this.requireRun(runId).sessionId, update);
    return {
      run: this.finishRun(runId, status, error, responseText),
      ...(event === undefined ? {} : { doneEvent: event }),
    };
  }

  private requireSession(id: string): MutableSession {
    const session = this.sessions.get(id);
    if (!session)
      throw new RuntimeStoreError(
        "session_not_found",
        `Session ${id} was not found.`,
      );
    return session;
  }

  private requireRun(id: string): MutableRun {
    const run = this.runs.get(id);
    if (!run)
      throw new RuntimeStoreError("run_not_found", `Run ${id} was not found.`);
    return run;
  }
}

interface MutableSession {
  id: string;
  key: string;
  owner: string;
  mode: RunMode;
  history: ChatMessage[];
  pendingQuestion?: AskUserRequest;
  pendingClientTool?: ClientToolCallRequest;
  pendingPlan?: ProposedPlan;
  pendingApproval?: RuntimeSession["pendingApproval"];
  turns: number;
  activeRunId?: string;
}

interface MutableRun {
  id: string;
  sessionId: string;
  status: RuntimeRunStatus;
  mode: RunMode;
  input: string;
  manifestName?: string;
  manifestOwner?: string;
  dataScope?: DataScope;
  context?: RunContext;
  delegation?: RuntimeRoomDelegation;
  trigger: { source: string; deliveryId?: string };
  createdAt: string;
  finishedAt?: string;
  responseText: string;
  governance?: AdmittedGovernancePolicy;
  error?: string;
}

function ownerKey(owner: string, key: string): string {
  return `${owner}\u0000${key}`;
}

function approvalClaimKey(input: {
  owner: string;
  runId: string;
  approvalId: string;
}): string {
  return `${input.owner}\u0000${input.runId}\u0000${input.approvalId}`;
}

function snapshotSession(session: MutableSession): RuntimeSession {
  const base = {
    id: session.id,
    key: session.key,
    owner: session.owner,
    mode: session.mode,
    history: session.history.map((message) => structuredClone(message)),
    turns: session.turns,
  };
  return {
    ...base,
    ...(session.pendingQuestion === undefined
      ? {}
      : { pendingQuestion: structuredClone(session.pendingQuestion) }),
    ...(session.pendingClientTool === undefined
      ? {}
      : { pendingClientTool: structuredClone(session.pendingClientTool) }),
    ...(session.pendingPlan === undefined
      ? {}
      : { pendingPlan: structuredClone(session.pendingPlan) }),
    ...(session.pendingApproval === undefined
      ? {}
      : { pendingApproval: structuredClone(session.pendingApproval) }),
  };
}

function snapshotRun(run: MutableRun): RuntimeRun {
  const base = {
    id: run.id,
    sessionId: run.sessionId,
    status: run.status,
    mode: run.mode,
    input: run.input,
    ...(run.manifestName === undefined
      ? {}
      : { manifestName: run.manifestName }),
    ...(run.manifestOwner === undefined
      ? {}
      : { manifestOwner: run.manifestOwner }),
    ...(run.dataScope === undefined
      ? {}
      : { dataScope: structuredClone(run.dataScope) }),
    ...(run.context === undefined
      ? {}
      : { context: structuredClone(run.context) }),
    trigger: structuredClone(run.trigger),
    createdAt: run.createdAt,
    responseText: run.responseText,
    ...(run.governance === undefined
      ? {}
      : { governance: structuredClone(run.governance) }),
  };
  if (run.finishedAt !== undefined)
    Object.assign(base, { finishedAt: run.finishedAt });
  if (run.error !== undefined) Object.assign(base, { error: run.error });
  return base;
}
