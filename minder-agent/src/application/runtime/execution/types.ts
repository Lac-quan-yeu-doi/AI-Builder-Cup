import type {
  ChatMessage,
  DataScope,
} from "@application/shared/ports/index.js";
import type {
  AdmittedGovernancePolicy,
  RedactedGovernancePolicySummary,
} from "@domain/runtime/governance-policy.js";
import type {
  GovernanceEvidenceInput,
  GovernanceEvidencePage,
  GovernanceEvidenceRecord,
} from "@domain/runtime/governance-evidence.js";
import type {
  AgentEvent,
  AskUserRequest,
  ClientToolCallRequest,
  JsonValue,
  ProposedPlan,
  RunMode,
  RunOutcome,
} from "@domain/shared";
import type { RunContext } from "@domain/runtime/run-context.js";

export type RuntimeLoopSnapshot = JsonValue;

export type RuntimeRunStatus =
  | "queued"
  | "running"
  | "awaiting_input"
  | "awaiting_client_tool"
  | "awaiting_plan_confirmation"
  | "awaiting_approval"
  | "backgrounded"
  | "completed"
  | "failed"
  | "interrupted";

export interface RuntimeSession {
  readonly id: string;
  readonly key: string;
  readonly owner: string;
  readonly mode: RunMode;
  readonly history: readonly ChatMessage[];
  readonly pendingQuestion?: AskUserRequest;
  readonly pendingClientTool?: ClientToolCallRequest;
  readonly pendingPlan?: ProposedPlan;
  readonly pendingApproval?: PendingToolApproval;
  readonly turns: number;
}

export interface PendingToolApproval {
  readonly approvalId: string;
  readonly runId: string;
  readonly toolCallId: string;
  readonly action: string;
  readonly argumentsHash: string;
  readonly preview: string;
  readonly expiresAt: string;
}

export interface RuntimeRun {
  readonly id: string;
  readonly sessionId: string;
  readonly status: RuntimeRunStatus;
  readonly mode: RunMode;
  readonly input: string;
  /** Agent manifest selected for this run, if one was used. */
  readonly manifestName?: string;
  /** Organization-scoped owner used for manifest and MCP lookup. */
  readonly manifestOwner?: string;
  readonly dataScope?: DataScope;
  readonly context?: RunContext;
  readonly trigger: { source: string; deliveryId?: string };
  readonly createdAt: string;
  readonly finishedAt?: string;
  /** Complete assistant text accumulated while this run executed. */
  readonly responseText: string;
  /** Immutable, owner-scoped policy selected when the run was admitted. */
  readonly governance?: AdmittedGovernancePolicy;
  readonly error?: string;
}

/**
 * A verified user identity bound to a room run. This is intentionally kept
 * outside {@link RuntimeRun}, which is exposed through the run HTTP surface.
 */
export type RuntimeRoomDelegation =
  | {
      readonly roomId: string;
      readonly callerSubject: string;
      readonly authorizationRunId?: string;
      readonly automationRunId?: never;
      readonly automationOrganizationId?: never;
    }
  | {
      readonly automationRunId: string;
      readonly automationOrganizationId: string;
      readonly roomId?: never;
      readonly callerSubject?: never;
      readonly authorizationRunId?: never;
    };

/** Owner-scoped, redacted governance evidence retained at run admission. */
export interface RuntimeGovernanceAdmission {
  readonly owner: string;
  readonly runId: string;
  readonly policyRevision: string;
  readonly policy: RedactedGovernancePolicySummary;
  readonly admittedAt: string;
}

export interface EventEnvelope {
  readonly runId: string;
  readonly seq: number;
  readonly payload: AgentEvent;
}

export type Admission =
  | { kind: "started"; run: RuntimeRun; session: RuntimeSession }
  | { kind: "rejected"; sessionId: string; activeRunId: string }
  | { kind: "duplicate_delivery" };

export interface RuntimeSessionUpdate {
  readonly history: readonly ChatMessage[];
  readonly pendingQuestion?: AskUserRequest;
  readonly pendingClientTool?: ClientToolCallRequest;
  readonly pendingPlan?: ProposedPlan;
  readonly pendingApproval?: PendingToolApproval;
}

export interface RuntimeRunResult {
  readonly outcome: RunOutcome;
  readonly status: RuntimeRunStatus;
}

export interface RuntimeSubscription {
  next(signal: AbortSignal): Promise<EventEnvelope | "resync" | "closed">;
  close(): void;
}

export type MaybePromise<T> = T | Promise<T>;

export type ApprovalExecutionClaim = "claimed" | "ambiguous";

export interface RuntimeRunStart {
  readonly kind: "started";
  readonly run: RuntimeRun;
  readonly session: RuntimeSession;
}

export interface RuntimeStoreContinuation {
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
  ): MaybePromise<RuntimeRun | undefined>;
}

export interface RuntimeStoreApprovalExecution {
  claimApprovalExecution(input: {
    owner: string;
    runId: string;
    approvalId: string;
  }): MaybePromise<ApprovalExecutionClaim>;
  completeApprovalExecution(input: {
    owner: string;
    runId: string;
    approvalId: string;
  }): MaybePromise<void>;
}

export interface RuntimeStoreSnapshots {
  saveLoopSnapshot(
    sessionId: string,
    snapshot: RuntimeLoopSnapshot,
  ): MaybePromise<void>;
  getLoopSnapshot(
    sessionId: string,
  ): MaybePromise<RuntimeLoopSnapshot | undefined>;
}

export interface RuntimeStoreFinalization {
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
    responseText?: string,
  ): MaybePromise<{ run: RuntimeRun; doneEvent?: EventEnvelope }>;
}

export interface RuntimeStoreLifecycle {
  recoverInterrupted(): MaybePromise<void>;
  close?(): MaybePromise<void>;
}

export interface RuntimeStore
  extends
    RuntimeStoreContinuation,
    RuntimeStoreApprovalExecution,
    RuntimeStoreSnapshots,
    RuntimeStoreFinalization,
    RuntimeStoreLifecycle {
  getOrCreateSession(
    owner: string,
    key: string,
    mode: RunMode,
  ): MaybePromise<RuntimeSession>;
  getSession(id: string): MaybePromise<RuntimeSession | undefined>;
  getSessionByKey(
    owner: string,
    key: string,
  ): MaybePromise<RuntimeSession | undefined>;
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
  ): MaybePromise<RuntimeRun>;
  getRunDelegation(
    runId: string,
  ): MaybePromise<RuntimeRoomDelegation | undefined>;
  getRun(id: string): MaybePromise<RuntimeRun | undefined>;
  getGovernanceAdmission(
    runId: string,
    owner: string,
  ): MaybePromise<RuntimeGovernanceAdmission | undefined>;
  appendGovernanceEvidence(
    owner: string,
    input: GovernanceEvidenceInput,
  ): MaybePromise<GovernanceEvidenceRecord>;
  listGovernanceEvidence(
    owner: string,
    runId: string,
    cursor?: string,
    limit?: number,
  ): MaybePromise<GovernanceEvidencePage>;
  markRunning(runId: string): MaybePromise<boolean>;
  activeRunId(sessionId: string): MaybePromise<string | undefined>;
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
    responseText?: string,
  ): MaybePromise<RuntimeRun>;
  commitSession(
    sessionId: string,
    update: RuntimeSessionUpdate,
  ): MaybePromise<RuntimeSession>;
  appendEvent(runId: string, payload: AgentEvent): MaybePromise<EventEnvelope>;
  replay(
    runId: string,
    afterSeq: number,
    limit: number,
  ): MaybePromise<readonly EventEnvelope[]>;
  claimDelivery(source: string, deliveryId: string): MaybePromise<boolean>;
}
