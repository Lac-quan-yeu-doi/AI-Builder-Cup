import {
  EmptyToolRegistry,
  ToolRegistryView,
  type ChatCompletionGateway,
  type LlmConfig,
  type McpAuditEvent,
  type McpServerManager,
  type MinderTool,
  type ToolContext,
  type ToolRegistryPort,
  type WorkspaceProvider,
} from "@application/shared/ports/index.js";
import { runId } from "@domain/index.js";
import type { JsonObject, JsonValue, RunOutcome } from "@domain/shared";
import {
  streamAutonomousTurn,
  streamInteractiveTurn,
  type AgentLoop,
  type InteractiveTurnContinuation,
} from "@application/agent";
import { continueLoopSnapshot, type LoopSnapshot } from "@application/agent";
import { InMemorySessionStore, type SessionStore } from "@application/session";
import { LiveEventHub } from "./live-hub.js";
import { RuntimeStoreError } from "./errors.js";
import {
  writeAgentRunDebug,
  type DebugLog,
} from "../observability/debug-log.js";
import { observeGateway } from "../observability/observed-gateway.js";
import {
  runtimeErrorFields,
  writeRuntimeLog,
} from "../observability/runtime-log.js";
import {
  createRuntimeApprovalGate,
  hashToolArguments,
} from "../governance/approval-gate.js";
import type { ApprovalService } from "../governance/approvals.js";
import {
  admitGovernancePolicy,
  resolveGovernancePolicy,
  type AdmittedGovernancePolicy,
  type RuntimeManifest,
  type RuntimeGovernanceDefaults,
} from "@domain/runtime/governance-policy.js";
import type { RuntimeStore } from "./types.js";
import type { GovernanceEvidencePage } from "@domain/runtime/governance-evidence.js";
import { applyManifestToolPolicy } from "../governance/manifest-tools.js";
import type {
  FileAccessPort,
  Sha256,
  RunEvidencePort,
  TelemetryPort,
} from "@application/shared/ports/index.js";
import { summarizeToolAction } from "@domain/runtime/action-summary.js";
import {
  retryOperation,
  withTransientStreamRetries,
} from "@application/reliability";
import { workspaceChangesForToolResult } from "../governance/tool-observability.js";
import type { MessageBlockPublisher } from "./message-block-publisher.js";
import {
  createRuntimeGovernanceTracker,
  rehydrateGovernancePolicy,
  type RuntimeGovernancePricing,
  type RuntimeGovernanceTracker,
} from "../governance/governed-context.js";
import {
  eventTelemetryData,
  telemetryEvent,
  telemetryFinish,
  telemetryStart,
} from "../observability/telemetry.js";
import type {
  Admission,
  EventEnvelope,
  RuntimeRun,
  RuntimeSession,
  RuntimeSubscription,
  RuntimeLoopSnapshot,
  MaybePromise,
} from "./types.js";
import type {
  ClientToolResultInput,
  RunManager,
  RuntimeClientToolDefinition,
  ApprovalResume,
  PlanResume,
  GovernanceManifestLookup,
  StartTurnInput,
  McpRuntimeTargetResolver,
  RuntimeOptionalToolResolver,
  PlanResumer,
} from "./run-manager.js";
import { appendRunContext } from "@domain/runtime/run-context.js";
import {
  approvalResolutionMessage,
  delay,
  isJsonObject,
  latestGovernanceUsage,
  planToolCallId,
  snapshotToolCall,
  thenMaybe,
  type SnapshotToolCall,
} from "./runtime-run-manager.helpers.js";

export interface RuntimeRunManagerOptions {
  readonly gateway: ChatCompletionGateway;
  readonly config: LlmConfig;
  readonly sha256: Sha256;
  readonly agentLoop?: AgentLoop;
  readonly store: RuntimeStore;
  readonly hub?: LiveEventHub;
  readonly sessionStore?: SessionStore;
  readonly registry?: ToolRegistryPort;
  readonly autonomousRegistry?: ToolRegistryPort;
  readonly clientTools?: readonly RuntimeClientToolDefinition[];
  readonly workspaceRoot?: string;
  readonly workingDirectory?: string;
  readonly workspaceProvider?: WorkspaceProvider;
  readonly debugLog?: DebugLog;
  readonly approvalService?: ApprovalService;
  readonly approvalRedactor?: (arguments_: JsonValue) => string;
  readonly now?: () => string;
  readonly manifestLookup?: GovernanceManifestLookup;
  readonly runtimeGovernanceDefaults?: RuntimeGovernanceDefaults;
  readonly runtimeGovernancePricing?: RuntimeGovernancePricing;
  readonly mcpManager?: McpServerManager;
  readonly mcpTargetResolver?: McpRuntimeTargetResolver;
  readonly optionalToolResolver?: RuntimeOptionalToolResolver;
  readonly evidence?: RunEvidencePort;
  readonly fileAccess?: FileAccessPort;
  readonly telemetry?: TelemetryPort;
  readonly messageBlockPublisher?: MessageBlockPublisher;
  readonly skillIndex?: string;
}

export class RuntimeRunManager implements RunManager, PlanResumer {
  readonly store: RuntimeStore;
  readonly hub: LiveEventHub;
  private readonly gateway: ChatCompletionGateway;
  private readonly config: LlmConfig;
  private readonly sha256: Sha256;
  private readonly agentLoop: AgentLoop | undefined;
  private readonly sessionStore: SessionStore;
  private readonly registry: ToolRegistryPort;
  private readonly autonomousRegistry: ToolRegistryPort;
  private readonly clientTools: readonly RuntimeClientToolDefinition[];
  private readonly toolContext: Omit<ToolContext, "signal">;
  private readonly workspaceProvider: WorkspaceProvider | undefined;
  private readonly debugLog: DebugLog | undefined;
  private readonly approvalService: ApprovalService | undefined;
  private readonly approvalRedactor: (arguments_: JsonValue) => string;
  private readonly now: (() => string) | undefined;
  private readonly manifestLookup: GovernanceManifestLookup | undefined;
  private readonly manifestPrompts = new Map<string, string | undefined>();
  private readonly manifestTools = new Map<string, RuntimeManifest["tools"]>();
  private readonly manifestProfiles = new Map<
    string,
    RuntimeManifest | undefined
  >();
  private readonly queuedRequestIds = new Map<string, string>();
  private readonly runtimeGovernanceDefaults:
    RuntimeGovernanceDefaults | undefined;
  private readonly runtimeGovernancePricing:
    RuntimeGovernancePricing | undefined;
  private readonly mcpManager: McpServerManager | undefined;
  private readonly mcpTargetResolver: McpRuntimeTargetResolver | undefined;
  private readonly optionalToolResolver:
    RuntimeOptionalToolResolver | undefined;
  private readonly evidence: RunEvidencePort | undefined;
  private readonly telemetry: TelemetryPort | undefined;
  private readonly messageBlockPublisher: MessageBlockPublisher | undefined;
  private readonly skillIndex: string | undefined;
  private readonly phase2Sessions = new Map<string, string>();
  private readonly interrupts = new Map<string, () => void>();
  private readonly dispatches = new Map<string, Promise<void>>();
  private readonly resumingApprovals = new Set<string>();
  private readonly resumingPlans = new Set<string>();
  private readonly governanceTrackers = new Map<
    string,
    RuntimeGovernanceTracker
  >();

  constructor(options: RuntimeRunManagerOptions) {
    this.store = options.store;
    this.hub = options.hub ?? new LiveEventHub();
    this.gateway = withTransientStreamRetries(options.gateway);
    this.config = options.config;
    this.sha256 = options.sha256;
    this.agentLoop = options.agentLoop;
    this.sessionStore = options.sessionStore ?? new InMemorySessionStore();
    this.registry = options.registry ?? new EmptyToolRegistry();
    this.autonomousRegistry =
      options.autonomousRegistry ?? new EmptyToolRegistry();
    this.clientTools = options.clientTools ?? [];
    this.debugLog = options.debugLog;
    this.approvalService = options.approvalService;
    this.approvalRedactor =
      options.approvalRedactor ?? (() => "Tool arguments redacted.");
    this.now = options.now;
    this.manifestLookup = options.manifestLookup;
    this.runtimeGovernanceDefaults = options.runtimeGovernanceDefaults;
    this.runtimeGovernancePricing = options.runtimeGovernancePricing;
    this.mcpManager = options.mcpManager;
    this.mcpTargetResolver = options.mcpTargetResolver;
    this.optionalToolResolver = options.optionalToolResolver;
    this.evidence = options.evidence;
    this.telemetry = options.telemetry;
    this.messageBlockPublisher = options.messageBlockPublisher;
    this.skillIndex = options.skillIndex;
    this.mcpManager?.setAuditSink?.((event) => this.recordMcpAudit(event));
    this.workspaceProvider = options.workspaceProvider;
    const workspaceRoot =
      options.workspaceRoot ?? "/tmp/minder-workspace-unconfigured";
    this.toolContext = {
      workspaceRoot,
      workingDirectory: options.workingDirectory ?? workspaceRoot,
      ...(options.fileAccess === undefined
        ? {}
        : { fileAccess: options.fileAccess }),
    };
  }

  async initialize(): Promise<void> {
    const store = this.store as RuntimeStore & {
      migrate?: () => Promise<void>;
    };
    if (store.migrate) await store.migrate();
    await this.store.recoverInterrupted();
  }

  async start(input: StartTurnInput): Promise<Admission> {
    if (!input.key.trim() || !input.input.trim() || !input.owner.trim()) {
      throw new RuntimeStoreError(
        "invalid_transition",
        "Session key, input, and owner must not be empty.",
      );
    }
    if (input.mode === "autonomous" && input.trigger.deliveryId !== undefined) {
      if (
        !(await this.store.claimDelivery(
          input.trigger.source,
          input.trigger.deliveryId,
        ))
      )
        return { kind: "duplicate_delivery" };
    }

    const session = await this.store.getOrCreateSession(
      input.owner,
      input.key,
      input.mode,
    );
    if (input.clientToolResult !== undefined) {
      if (
        input.mode !== "interactive" ||
        session.pendingClientTool?.id !== input.clientToolResult.id
      ) {
        throw new RuntimeStoreError(
          "invalid_transition",
          "Client tool result does not match a pending request for this session.",
        );
      }
    } else if (session.pendingClientTool !== undefined) {
      throw new RuntimeStoreError(
        "invalid_transition",
        "A matching client tool result is required before this session can resume.",
      );
    }
    let activeRunId = await this.store.activeRunId(session.id);
    if (activeRunId !== undefined) {
      if (input.mode !== "interactive")
        return { kind: "rejected", sessionId: session.id, activeRunId };
      this.interrupt(activeRunId);
      for (
        let attempt = 0;
        attempt < 20 &&
        (await this.store.activeRunId(session.id)) !== undefined;
        attempt += 1
      )
        await delay(50);
      activeRunId = await this.store.activeRunId(session.id);
      if (activeRunId !== undefined)
        return { kind: "rejected", sessionId: session.id, activeRunId };
    }

    const manifest = await this.resolveManifest(input);
    const governance = this.resolveAdmissionGovernance(input, manifest);
    const run = await this.store.startRun(
      session.id,
      input.input,
      input.mode,
      input.trigger,
      governance,
      input.manifestName,
      input.dataScope,
      input.delegation,
      input.manifestOwner,
      input.context,
      input.runId,
    );
    if (!run) {
      const current = await this.store.activeRunId(session.id);
      return {
        kind: "rejected",
        sessionId: session.id,
        activeRunId: current ?? "unknown",
      };
    }
    this.manifestPrompts.set(run.id, manifest?.systemPrompt);
    this.manifestTools.set(run.id, manifest?.tools);
    this.manifestProfiles.set(run.id, manifest);
    await this.saveManifestSnapshot(input.owner, run.id, {
      manifestName: input.manifestName ?? null,
      manifestHash: manifest?.manifestHash ?? null,
      manifestSourcePath: manifest?.manifestSourcePath ?? null,
      manifestYaml: manifest?.manifestYaml ?? null,
      systemPrompt: manifest?.systemPrompt ?? null,
      tools: manifest?.tools ?? null,
      governance: manifest?.governance ?? null,
    });
    this.hub.open(run.id);
    const dispatch = this.dispatch(run.id, session, input);
    this.dispatches.set(run.id, dispatch);
    void dispatch.finally(() => this.dispatches.delete(run.id));
    return {
      kind: "started",
      run,
      session: (await this.store.getSession(session.id)) ?? session,
    };
  }

  async admitQueued(input: StartTurnInput): Promise<Admission> {
    if (!input.key.trim() || !input.input.trim() || !input.owner.trim()) {
      throw new RuntimeStoreError(
        "invalid_transition",
        "Session key, input, and owner must not be empty.",
      );
    }
    const session = await this.store.getOrCreateSession(
      input.owner,
      input.key,
      input.mode,
    );
    const activeRunId = await this.store.activeRunId(session.id);
    if (activeRunId !== undefined)
      return { kind: "rejected", sessionId: session.id, activeRunId };
    const manifest = await this.resolveManifest(input);
    const governance = this.resolveAdmissionGovernance(input, manifest);
    const run = await this.store.createRun(
      session.id,
      input.input,
      input.mode,
      input.trigger,
      governance,
      input.manifestName,
      input.dataScope,
      input.delegation,
      input.manifestOwner,
      input.context,
      input.runId,
    );
    this.manifestPrompts.set(run.id, manifest?.systemPrompt);
    this.manifestTools.set(run.id, manifest?.tools);
    this.manifestProfiles.set(run.id, manifest);
    await this.saveManifestSnapshot(input.owner, run.id, {
      manifestName: input.manifestName ?? null,
      systemPrompt: manifest?.systemPrompt ?? null,
      tools: manifest?.tools ?? null,
      governance: manifest?.governance ?? null,
    });
    if (input.requestId !== undefined)
      this.queuedRequestIds.set(run.id, input.requestId);
    return { kind: "started", run, session };
  }

  async dispatchQueued(runId: string, owner: string): Promise<boolean> {
    const run = await this.getAuthorizedRun(runId, owner);
    if (!run || run.status !== "queued") return false;
    const session = await this.store.getSession(run.sessionId);
    if (!session || !(await this.store.markRunning(run.id))) return false;
    this.hub.open(run.id);
    const delegation = await this.store.getRunDelegation(run.id);
    const requestId = this.queuedRequestIds.get(run.id);
    this.queuedRequestIds.delete(run.id);
    const input: StartTurnInput = {
      ...(requestId === undefined ? {} : { requestId }),
      key: session.key,
      input: run.input,
      owner,
      mode: run.mode,
      trigger: run.trigger,
      ...(run.manifestName === undefined
        ? {}
        : { manifestName: run.manifestName }),
      ...(run.manifestOwner === undefined
        ? {}
        : { manifestOwner: run.manifestOwner }),
      ...(run.dataScope === undefined ? {} : { dataScope: run.dataScope }),
      ...(run.context === undefined ? {} : { context: run.context }),
      ...(delegation === undefined ? {} : { delegation }),
    };
    const dispatch = this.dispatch(run.id, session, input);
    this.dispatches.set(run.id, dispatch);
    void dispatch.finally(() => this.dispatches.delete(run.id));
    return true;
  }

  async cancelQueued(runId: string, owner: string): Promise<boolean> {
    const run = await this.getAuthorizedRun(runId, owner);
    if (!run || run.status !== "queued") return false;
    await this.store.finishRun(
      runId,
      "interrupted",
      "Room queue admission was rejected.",
    );
    this.queuedRequestIds.delete(runId);
    return true;
  }

  getSessionByKey(
    key: string,
    owner: string,
  ): MaybePromise<RuntimeSession | undefined> {
    return this.store.getSessionByKey(owner, key);
  }

  getAuthorizedSession(
    sessionId: string,
    owner: string,
  ): MaybePromise<RuntimeSession | undefined> {
    const session = this.store.getSession(sessionId);
    return thenMaybe(session, (value) =>
      value?.owner === owner ? value : undefined,
    );
  }

  getAuthorizedRun(
    runId: string,
    owner: string,
  ): MaybePromise<RuntimeRun | undefined> {
    return thenMaybe(this.store.getRun(runId), (run) => {
      if (!run) return undefined;
      return thenMaybe(this.store.getSession(run.sessionId), (session) =>
        session?.owner === owner ? run : undefined,
      );
    });
  }

  getGovernanceAdmission(runId: string, owner: string) {
    return this.store.getGovernanceAdmission(runId, owner);
  }

  listGovernanceEvidence(
    runId: string,
    owner: string,
    cursor?: string,
    limit?: number,
  ): MaybePromise<GovernanceEvidencePage | undefined> {
    return thenMaybe(this.getAuthorizedRun(runId, owner), (run) =>
      run === undefined
        ? undefined
        : this.store.listGovernanceEvidence(owner, runId, cursor, limit),
    );
  }

  replay(
    runId: string,
    afterSeq: number,
    limit: number,
  ): MaybePromise<readonly EventEnvelope[]> {
    return this.store.replay(
      runId,
      Math.max(0, afterSeq),
      Math.max(1, Math.min(limit, 512)),
    );
  }

  subscribe(runId: string): RuntimeSubscription | undefined {
    return this.hub.subscribe(runId);
  }

  interrupt(runId: string): boolean {
    const interrupt = this.interrupts.get(runId);
    if (!interrupt) return false;
    interrupt();
    return true;
  }

  async resumeApproval(input: {
    owner: string;
    runId: string;
    approvalId: string;
  }): Promise<ApprovalResume> {
    const original = await this.getAuthorizedRun(input.runId, input.owner);
    if (!original || original.mode !== "interactive")
      return { kind: "not_found" };
    const delegation = await this.store.getRunDelegation(original.id);
    const session = await this.store.getSession(original.sessionId);
    const pending = session?.pendingApproval;
    if (
      !session ||
      !pending ||
      pending.approvalId !== input.approvalId ||
      pending.runId !== original.id ||
      !this.approvalService
    )
      return { kind: "not_found" };
    const key = `${session.id}\u0000${pending.approvalId}`;
    if (this.resumingApprovals.has(key)) return { kind: "not_found" };
    this.resumingApprovals.add(key);
    try {
      const approval = await this.approvalService.decide({
        owner: input.owner,
        runId: original.id,
        approvalId: input.approvalId,
        decision: "approved",
      });
      if (!approval) return { kind: "not_found" };
      const snapshot = await this.store.getLoopSnapshot(session.id);
      const call =
        snapshot === undefined
          ? undefined
          : snapshotToolCall(snapshot, pending.toolCallId);
      const mismatch =
        !call ||
        approval.toolCallId !== pending.toolCallId ||
        approval.argumentsHash !== pending.argumentsHash ||
        approval.action !== pending.action ||
        (call !== undefined &&
          hashToolArguments(call.arguments, this.sha256) !==
            pending.argumentsHash);
      if (mismatch) {
        await this.store.appendGovernanceEvidence(input.owner, {
          runId: original.id,
          at: this.now?.() ?? new Date().toISOString(),
          kind: "approval_decided",
          detail: { approvalId: approval.id, status: "hash_mismatch" },
        });
        await this.resolveApproval(session, snapshot, pending, "hash_mismatch");
        return { kind: "resolved", status: "hash_mismatch" };
      }
      if (approval.status === "denied" || approval.status === "expired") {
        await this.store.appendGovernanceEvidence(input.owner, {
          runId: original.id,
          at: approval.decidedAt ?? this.now?.() ?? new Date().toISOString(),
          kind: "approval_decided",
          detail: { approvalId: approval.id, status: approval.status },
        });
        await this.resolveApproval(session, snapshot, pending, approval.status);
        return { kind: "resolved", status: approval.status };
      }
      if (approval.status !== "approved") return { kind: "not_found" };

      const claim = await this.store.claimApprovalExecution({
        owner: input.owner,
        runId: original.id,
        approvalId: input.approvalId,
      });
      if (claim !== "claimed") {
        await this.store.appendGovernanceEvidence(input.owner, {
          runId: original.id,
          at: this.now?.() ?? new Date().toISOString(),
          kind: "approval_decided",
          detail: { approvalId: approval.id, status: "execution_ambiguous" },
        });
        return { kind: "resolved", status: "execution_ambiguous" };
      }

      const governanceTracker = await this.governanceFor(
        original.id,
        input.owner,
      );
      const toolContext = {
        ...(await this.toolContextFor(
          {
            key: session.key,
            input: original.input,
            owner: input.owner,
            mode: "interactive",
            trigger: { source: "approval" },
            ...(original.manifestName === undefined
              ? {}
              : { manifestName: original.manifestName }),
            ...(original.manifestOwner === undefined
              ? {}
              : { manifestOwner: original.manifestOwner }),
            ...(original.dataScope === undefined
              ? {}
              : { dataScope: original.dataScope }),
            ...(original.context === undefined
              ? {}
              : { context: original.context }),
            ...(delegation === undefined ? {} : { delegation }),
          },
          original.id,
        )),
        runId: original.id,
        governance: governanceTracker.approvedContext,
      };
      const registry = await this.registryForRun(
        {
          key: session.key,
          input: original.input,
          owner: input.owner,
          mode: "interactive",
          trigger: { source: "approval" },
          ...(original.manifestName === undefined
            ? {}
            : { manifestName: original.manifestName }),
          ...(original.manifestOwner === undefined
            ? {}
            : { manifestOwner: original.manifestOwner }),
          ...(original.dataScope === undefined
            ? {}
            : { dataScope: original.dataScope }),
          ...(original.context === undefined
            ? {}
            : { context: original.context }),
        },
        this.registry,
        original.id,
      );
      const result = await this.executeApprovedCall(
        call,
        toolContext,
        registry,
      );
      await this.store.completeApprovalExecution({
        owner: input.owner,
        runId: original.id,
        approvalId: input.approvalId,
      });
      await this.store.appendGovernanceEvidence(input.owner, {
        runId: original.id,
        at: approval.decidedAt ?? this.now?.() ?? new Date().toISOString(),
        kind: "approval_decided",
        detail: { approvalId: approval.id, status: "approved" },
      });
      const continuation: InteractiveTurnContinuation = {
        snapshot: snapshot!,
        toolResult: {
          toolCallId: pending.toolCallId,
          content: result.content,
          isError: result.isError,
        },
      };
      await this.store.commitSession(session.id, { history: session.history });
      const successor = await this.store.startRun(
        session.id,
        original.input,
        "interactive",
        { source: "approval" },
        original.governance,
        original.manifestName,
        original.dataScope,
        delegation,
        original.manifestOwner,
        original.context,
      );
      if (!successor) {
        const activeRunId = await this.store.activeRunId(session.id);
        return {
          kind: "rejected",
          sessionId: session.id,
          activeRunId: activeRunId ?? "unknown",
        };
      }
      this.governanceTrackers.set(successor.id, governanceTracker);
      if (this.manifestPrompts.has(original.id))
        this.manifestPrompts.set(
          successor.id,
          this.manifestPrompts.get(original.id),
        );
      if (this.manifestTools.has(original.id))
        this.manifestTools.set(
          successor.id,
          this.manifestTools.get(original.id),
        );
      if (this.manifestProfiles.has(original.id))
        this.manifestProfiles.set(
          successor.id,
          this.manifestProfiles.get(original.id),
        );
      this.hub.open(successor.id);
      const dispatch = this.dispatch(
        successor.id,
        (await this.store.getSession(session.id))!,
        {
          key: session.key,
          input: original.input,
          owner: input.owner,
          mode: "interactive",
          trigger: { source: "approval" },
          ...(original.manifestName === undefined
            ? {}
            : { manifestName: original.manifestName }),
          ...(original.manifestOwner === undefined
            ? {}
            : { manifestOwner: original.manifestOwner }),
        },
        continuation,
      );
      this.dispatches.set(successor.id, dispatch);
      void dispatch.finally(() => this.dispatches.delete(successor.id));
      return {
        kind: "started",
        run: successor,
        session: (await this.store.getSession(session.id))!,
      };
    } finally {
      this.resumingApprovals.delete(key);
    }
  }

  async resumePlan(input: {
    owner: string;
    runId: string;
    decision: "approved" | "denied";
  }): Promise<PlanResume> {
    const original = await this.getAuthorizedRun(input.runId, input.owner);
    if (!original || original.mode !== "interactive")
      return { kind: "not_found" };
    const session = await this.store.getSession(original.sessionId);
    if (!session?.pendingPlan) return { kind: "not_found" };
    const key = `${session.id}\u0000${original.id}`;
    if (this.resumingPlans.has(key)) return { kind: "not_found" };
    this.resumingPlans.add(key);
    try {
      const snapshot = await this.store.getLoopSnapshot(session.id);
      const planCallId =
        snapshot === undefined ? undefined : planToolCallId(snapshot);
      if (planCallId === undefined) {
        await this.store.commitSession(session.id, {
          history: session.history,
        });
        return { kind: "resolved", status: "invalid" };
      }
      if (input.decision === "denied") {
        await this.store.commitSession(session.id, {
          history: session.history,
        });
        return { kind: "resolved", status: "denied" };
      }

      const continuation: InteractiveTurnContinuation = {
        snapshot: snapshot!,
        toolResult: {
          toolCallId: planCallId,
          content: "Plan approved by the user. Execute the proposed plan.",
          isError: false,
        },
      };
      const delegation = await this.store.getRunDelegation(original.id);
      const governanceTracker = await this.governanceFor(
        original.id,
        input.owner,
      );
      await this.store.commitSession(session.id, { history: session.history });
      const successor = await this.store.startRun(
        session.id,
        original.input,
        "interactive",
        { source: "plan" },
        original.governance,
        original.manifestName,
        original.dataScope,
        delegation,
        original.manifestOwner,
        original.context,
      );
      if (!successor) {
        return {
          kind: "rejected",
          sessionId: session.id,
          activeRunId: (await this.store.activeRunId(session.id)) ?? "unknown",
        };
      }
      this.governanceTrackers.set(successor.id, governanceTracker);
      this.manifestPrompts.set(
        successor.id,
        this.manifestPrompts.get(original.id),
      );
      this.manifestTools.set(successor.id, this.manifestTools.get(original.id));
      this.manifestProfiles.set(
        successor.id,
        this.manifestProfiles.get(original.id),
      );
      this.hub.open(successor.id);
      const dispatch = this.dispatch(
        successor.id,
        (await this.store.getSession(session.id))!,
        {
          key: session.key,
          input: original.input,
          owner: input.owner,
          mode: "interactive",
          trigger: { source: "plan" },
          ...(original.manifestName === undefined
            ? {}
            : { manifestName: original.manifestName }),
          ...(original.manifestOwner === undefined
            ? {}
            : { manifestOwner: original.manifestOwner }),
          ...(original.dataScope === undefined
            ? {}
            : { dataScope: original.dataScope }),
          ...(original.context === undefined
            ? {}
            : { context: original.context }),
          ...(delegation === undefined ? {} : { delegation }),
        },
        continuation,
      );
      this.dispatches.set(successor.id, dispatch);
      void dispatch.finally(() => this.dispatches.delete(successor.id));
      return {
        kind: "started",
        run: successor,
        session: (await this.store.getSession(session.id))!,
      };
    } finally {
      this.resumingPlans.delete(key);
    }
  }

  async shutdown(): Promise<void> {
    for (const interrupt of this.interrupts.values()) interrupt();
    await Promise.allSettled(this.dispatches.values());
    await this.store.close?.();
  }

  private resolveAdmissionGovernance(
    input: StartTurnInput,
    manifest: RuntimeManifest | undefined,
  ): AdmittedGovernancePolicy {
    return admitGovernancePolicy(
      resolveGovernancePolicy({
        owner: input.owner,
        sha256: this.sha256,
        ...(manifest === undefined ? {} : { manifest }),
        ...(this.runtimeGovernanceDefaults === undefined
          ? {}
          : { runtimeDefaults: this.runtimeGovernanceDefaults }),
      }),
      this.now?.() ?? new Date().toISOString(),
    );
  }

  private async dispatch(
    runId: string,
    runtimeSession: RuntimeSession,
    input: StartTurnInput,
    continuation?: InteractiveTurnContinuation,
  ): Promise<void> {
    const controller = new AbortController();
    const startedAt = performance.now();
    const logContext = {
      runId,
      sessionId: runtimeSession.id,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      ...(input.delegation?.roomId === undefined
        ? {}
        : { roomId: input.delegation.roomId }),
    };
    const gateway = observeGateway(this.gateway, this.debugLog, logContext, [
      this.config.apiKey,
    ]);
    let failureStage = "preparation";
    let caughtError: unknown;
    telemetryStart(this.telemetry, {
      runId: runId as never,
      name: "agent-run",
    });
    this.interrupts.set(runId, () => controller.abort());
    let sawDone = false;
    let awaitingQuestion: RuntimeSession["pendingQuestion"];
    let awaitingClientTool: RuntimeSession["pendingClientTool"];
    let awaitingPlan: RuntimeSession["pendingPlan"];
    let awaitingApproval: RuntimeSession["pendingApproval"];
    const eventCounts = new Map<string, number>();
    let selectedConfig = this.config;
    let outcome: RunOutcome = {
      status: "failed",
      text: "",
      error: { code: "transport", message: "Run failed." },
    };
    try {
      const governanceTracker = await this.governanceFor(runId, input.owner);
      const manifestProfile = this.manifestProfiles.has(runId)
        ? this.manifestProfiles.get(runId)
        : input.trigger.source === "approval"
          ? undefined
          : await this.resolveManifest(input);
      if (
        input.manifestName !== undefined &&
        this.manifestLookup !== undefined &&
        manifestProfile === undefined &&
        input.trigger.source !== "approval"
      ) {
        const message = `Agent manifest "${input.manifestName}" was not found for this owner.`;
        writeRuntimeLog(
          this.debugLog,
          "agent_manifest_missing",
          {
            ...logContext,
            manifestName: input.manifestName,
          },
          "warn",
        );
        outcome = {
          status: "failed",
          text: message,
          error: { code: "configuration", message },
        };
        return;
      }
      if (!this.manifestProfiles.has(runId)) {
        this.manifestProfiles.set(runId, manifestProfile);
        this.manifestTools.set(runId, manifestProfile?.tools);
        this.manifestPrompts.set(runId, manifestProfile?.systemPrompt);
      }
      const registry = await this.registryForRun(
        input,
        input.mode === "interactive" ? this.registry : this.autonomousRegistry,
        runId,
      );
      const toolContext = {
        ...(await this.toolContextFor(input, runId)),
        runId,
        governance: governanceTracker.context,
        progress: {
          report: async (message: string, data?: JsonValue): Promise<void> => {
            const envelope = await this.store.appendEvent(runId, {
              type: "tool_progress",
              data: {
                id: crypto.randomUUID(),
                kind: "progress",
                payload: { message, data: data ?? null },
              },
            });
            this.hub.publish(envelope);
          },
        },
        diagnostics: {
          record: async (name: string, data: JsonValue): Promise<void> => {
            const envelope = await this.store.appendEvent(runId, {
              type: "tool_progress",
              data: {
                id: crypto.randomUUID(),
                kind: "diagnostic",
                payload: { name, data },
              },
            });
            this.hub.publish(envelope);
          },
        },
        onToolResult: async (
          value: Parameters<NonNullable<ToolContext["onToolResult"]>>[0],
        ) => {
          const summary = summarizeToolAction(
            {
              name: value.name,
              arguments: value.arguments,
              readOnly: value.readOnly,
              destructive: value.destructive,
            },
            value.result,
          );
          writeRuntimeLog(
            this.debugLog,
            "agent_tool_finished",
            {
              ...logContext,
              tool: summary.tool,
              status: summary.status,
              readOnly: summary.readOnly,
              destructive: summary.destructive,
              resultSize: summary.resultSize,
              ...(summary.durationMs === undefined
                ? {}
                : { durationMs: summary.durationMs }),
            },
            summary.status === "error" ? "warn" : "info",
          );
          await this.store.appendGovernanceEvidence(input.owner, {
            runId,
            at: this.now?.() ?? new Date().toISOString(),
            kind: "action_summary",
            detail: {
              tool: summary.tool,
              status: summary.status,
              readOnly: summary.readOnly,
              destructive: summary.destructive,
              argumentKeys: Object.keys(value.arguments),
              resultSize: summary.resultSize,
              ...(summary.durationMs === undefined
                ? {}
                : { durationMs: summary.durationMs }),
            },
          });
          const changes = workspaceChangesForToolResult(value);
          if (changes.length > 0) {
            const envelope = await this.store.appendEvent(runId, {
              type: "workspace_changed",
              data: { changes },
            });
            this.hub.publish(envelope);
          }
          await this.publishMessageBlock(
            input,
            runId,
            value.result.success,
            value.result.metadata,
          );
        },
      };
      const loopSnapshot = await this.store.getLoopSnapshot(runtimeSession.id);
      const approvalGate = this.approvalGateFor(
        input.owner,
        runId,
        governanceTracker.autoApprovals,
        governanceTracker.actionApprovals,
        (value) => {
          awaitingApproval = value;
        },
      );
      const manifestPrompt = this.manifestPrompts.get(runId);
      const basePrompt = input.systemPrompt ?? manifestPrompt;
      const promptWithSkills =
        basePrompt !== undefined && this.skillIndex !== undefined
          ? `${basePrompt}\n\n${this.skillIndex}`
          : basePrompt;
      const systemPrompt = appendRunContext(promptWithSkills, input.context);
      const effectiveConfig = this.effectiveConfig(manifestProfile);
      selectedConfig = effectiveConfig;
      writeRuntimeLog(this.debugLog, "agent_run_started", {
        ...logContext,
        mode: input.mode,
        trigger: input.trigger.source,
        ...(input.manifestName === undefined
          ? {}
          : {
              manifestName: input.manifestName,
              manifestResolved: manifestProfile !== undefined,
              manifestToolsMode: manifestProfile?.tools?.mode ?? null,
              manifestDeclaredToolCount:
                manifestProfile?.tools?.names.length ?? 0,
              manifestClientToolCount:
                manifestProfile?.clientTools?.length ?? 0,
              manifestMaxIterations:
                manifestProfile?.execution?.maxIterations ?? null,
            }),
        ...(effectiveConfig.provider === undefined
          ? {}
          : { provider: effectiveConfig.provider }),
        model: effectiveConfig.model,
      });
      failureStage = "execution";
      const generator =
        input.mode === "interactive"
          ? this.interactiveGenerator(
              runtimeSession,
              input.input,
              controller.signal,
              input.clientToolResult,
              loopSnapshot,
              toolContext,
              registry,
              approvalGate,
              continuation,
              systemPrompt,
              effectiveConfig,
              gateway,
              undefined,
              manifestProfile?.clientTools ?? this.clientTools,
              manifestProfile?.execution?.maxIterations,
              manifestProfile?.execution?.planReview,
            )
          : streamAutonomousTurn({
              config: effectiveConfig,
              gateway,
              prompt: input.input,
              signal: controller.signal,
              checkpointThreadId: runtimeSession.id,
              registry,
              context: toolContext,
              ...(systemPrompt === undefined ? {} : { systemPrompt }),
              ...(loopSnapshot === undefined ? {} : { loopSnapshot }),
              ...(manifestProfile?.execution?.maxIterations === undefined
                ? {}
                : { maxIterations: manifestProfile.execution.maxIterations }),
              ...(this.agentLoop === undefined ? {} : { loop: this.agentLoop }),
            });
      while (true) {
        const next = await generator.next();
        if (next.done) {
          outcome = next.value;
          break;
        }
        const event = next.value;
        eventCounts.set(event.type, (eventCounts.get(event.type) ?? 0) + 1);
        if (event.type === "token_usage")
          governanceTracker.addUsage(event.data);
        if (event.type === "done") sawDone = true;
        if (event.type === "awaiting_input") awaitingQuestion = event.data;
        if (event.type === "awaiting_client_tool")
          awaitingClientTool = event.data;
        if (event.type === "awaiting_plan") awaitingPlan = event.data;
        const envelope = await this.store.appendEvent(runId, event);
        this.hub.publish(envelope);
        telemetryEvent(this.telemetry, {
          name: event.type,
          runId: runId as never,
          data: eventTelemetryData(envelope),
        });
      }
    } catch (error) {
      caughtError = error;
      outcome = {
        status: controller.signal.aborted ? "interrupted" : "failed",
        text: "",
        error: {
          code: controller.signal.aborted ? "interrupted" : "transport",
          message: error instanceof Error ? error.message : "Run failed.",
        },
      };
    } finally {
      if (outcome.loopSnapshot !== undefined) {
        await this.store.saveLoopSnapshot(
          runtimeSession.id,
          outcome.loopSnapshot,
        );
      }
      const phase2SessionId = this.phase2Sessions.get(runtimeSession.id);
      const phase2Session =
        phase2SessionId === undefined
          ? undefined
          : this.sessionStore.get(phase2SessionId);
      const status =
        awaitingQuestion !== undefined
          ? "awaiting_input"
          : awaitingClientTool !== undefined
            ? "awaiting_client_tool"
            : awaitingPlan !== undefined
              ? "awaiting_plan_confirmation"
              : awaitingApproval !== undefined
                ? "awaiting_approval"
                : outcome.status;
      const update = {
        history:
          awaitingApproval === undefined
            ? (phase2Session?.history ?? runtimeSession.history)
            : runtimeSession.history,
        ...(awaitingQuestion === undefined
          ? {}
          : { pendingQuestion: awaitingQuestion }),
        ...(awaitingClientTool === undefined
          ? {}
          : { pendingClientTool: awaitingClientTool }),
        ...(awaitingPlan === undefined ? {} : { pendingPlan: awaitingPlan }),
        ...(awaitingApproval === undefined
          ? {}
          : { pendingApproval: awaitingApproval }),
      };
      const finalization = await this.store.finalizeRun(
        runId,
        status,
        update,
        outcome.error?.message,
        sawDone
          ? undefined
          : { type: "done", data: { response_text: outcome.text } },
        outcome.text,
      );
      if (finalization.doneEvent) {
        this.hub.publish(finalization.doneEvent);
        telemetryEvent(this.telemetry, {
          name: finalization.doneEvent.payload.type,
          runId: runId as never,
          data: eventTelemetryData(finalization.doneEvent),
        });
      }
      writeAgentRunDebug(
        this.debugLog,
        {
          ...logContext,
          mode: input.mode,
          trigger: input.trigger.source,
          ...(input.manifestName === undefined
            ? {}
            : { manifestName: input.manifestName }),
          ...(selectedConfig.provider === undefined
            ? {}
            : { provider: selectedConfig.provider }),
          model: selectedConfig.model,
          status,
          sawDone,
          responseChars: outcome.text.length,
          eventCounts: Object.fromEntries(
            [...eventCounts.entries()].sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
          durationMs: Math.round(performance.now() - startedAt),
          ...(status === "failed"
            ? {
                failureStage,
                ...runtimeErrorFields(
                  caughtError ??
                    new Error(outcome.error?.message ?? "Run failed."),
                ),
                ...(outcome.error?.code === undefined
                  ? {}
                  : { errorCode: outcome.error.code }),
              }
            : {}),
        },
        [selectedConfig.apiKey],
      );
      this.interrupts.delete(runId);
      this.hub.close(runId);
      telemetryFinish(this.telemetry, {
        runId: runId as never,
        success: status === "completed",
      });
    }
  }

  private async publishMessageBlock(
    input: StartTurnInput,
    runId: string,
    success: boolean,
    metadata: JsonObject,
  ): Promise<void> {
    if (!success || this.messageBlockPublisher === undefined) return;
    const roomId = input.delegation?.roomId;
    const block = metadata.message_block;
    if (roomId === undefined || !isJsonObject(block)) return;
    try {
      await this.messageBlockPublisher.publish({ roomId, runId, block });
    } catch (error) {
      writeRuntimeLog(
        this.debugLog,
        "message_block_publish_failed",
        {
          runId,
          roomId,
          ...runtimeErrorFields(error),
        },
        "error",
      );
    }
  }

  private interactiveGenerator(
    runtimeSession: RuntimeSession,
    prompt: string,
    signal: AbortSignal,
    resumeToolResult: ClientToolResultInput | undefined,
    loopSnapshot: JsonValue | undefined,
    toolContext: Omit<ToolContext, "signal">,
    registry: ToolRegistryPort,
    approvalGate: Parameters<typeof streamInteractiveTurn>[0]["approvalGate"],
    continuation: InteractiveTurnContinuation | undefined,
    systemPrompt: string | undefined,
    config: LlmConfig,
    gateway: ChatCompletionGateway,
    agentLoop: AgentLoop | undefined,
    clientTools: readonly RuntimeClientToolDefinition[],
    maxIterations: number | undefined,
    planReview: boolean | undefined,
  ) {
    let phase2Id = this.phase2Sessions.get(runtimeSession.id);
    if (phase2Id === undefined) {
      const created = this.sessionStore.create();
      this.sessionStore.appendTurn(
        created.id,
        runtimeSession.history,
        runtimeSession.pendingQuestion ?? null,
      );
      phase2Id = created.id;
      this.phase2Sessions.set(runtimeSession.id, phase2Id);
    }
    const session = this.sessionStore.get(phase2Id)!;
    return streamInteractiveTurn({
      config,
      gateway,
      session,
      sessionStore: this.sessionStore,
      registry,
      context: { ...toolContext, signal },
      prompt,
      signal,
      clientTools,
      ...(maxIterations === undefined ? {} : { maxIterations }),
      ...(planReview === undefined ? {} : { planReview }),
      ...(systemPrompt === undefined ? {} : { systemPrompt }),
      ...(loopSnapshot === undefined ? {} : { loopSnapshot }),
      ...(resumeToolResult === undefined ? {} : { resumeToolResult }),
      ...(approvalGate === undefined ? {} : { approvalGate }),
      ...(continuation === undefined ? {} : { continuation }),
      ...(agentLoop === undefined ? {} : { loop: agentLoop }),
    });
  }

  private async resolveManifest(
    input: StartTurnInput,
  ): Promise<RuntimeManifest | undefined> {
    if (input.manifestName === undefined) return undefined;
    if (
      input.manifestOwner === undefined &&
      process.env.NODE_ENV === "production"
    ) {
      throw new Error("manifest owner is required");
    }
    if (this.manifestLookup === undefined) return undefined;
    const manifestOwner = input.manifestOwner;
    return this.manifestLookup.get({
      owner: input.owner,
      name: input.manifestName,
      ...(manifestOwner === undefined ? {} : { manifestOwner }),
    });
  }

  private effectiveConfig(profile: RuntimeManifest | undefined): LlmConfig {
    return {
      ...this.config,
      ...(profile?.model?.name === undefined
        ? {}
        : { model: profile.model.name }),
      ...(profile?.model?.provider === undefined
        ? {}
        : { provider: profile.model.provider }),
      ...(profile?.model?.temperature === undefined
        ? {}
        : { temperature: profile.model.temperature }),
      ...(profile?.model?.maxTokens === undefined
        ? {}
        : { maxTokens: profile.model.maxTokens }),
    };
  }

  private async resolveApproval(
    session: RuntimeSession,
    snapshot: RuntimeLoopSnapshot | undefined,
    pending: NonNullable<RuntimeSession["pendingApproval"]>,
    status: "denied" | "expired" | "hash_mismatch",
  ): Promise<void> {
    if (snapshot !== undefined) {
      try {
        await this.store.saveLoopSnapshot(
          session.id,
          continueLoopSnapshot({
            snapshot: snapshot as unknown as LoopSnapshot,
            toolResult: {
              toolCallId: pending.toolCallId,
              content: approvalResolutionMessage(status),
              isError: true,
            },
          }) as unknown as RuntimeLoopSnapshot,
        );
      } catch {
        // A malformed snapshot fails closed below by clearing the pending state.
      }
    }
    await this.store.commitSession(session.id, { history: session.history });
  }

  private async executeApprovedCall(
    call: SnapshotToolCall,
    context: Omit<ToolContext, "signal">,
    registry: ToolRegistryPort,
  ): Promise<{ readonly content: string; readonly isError: boolean }> {
    const tool = registry
      .all()
      .find(
        (candidate) =>
          candidate.name === call.name ||
          candidate.aliases?.includes(call.name),
      );
    if (!tool)
      return { content: `Tool ${call.name} not found.`, isError: true };
    const result = await registry.execute(tool.name, call.arguments, {
      ...context,
      signal: new AbortController().signal,
    });
    if (result.success && !tool.readOnly && context.syncWorkspace) {
      try {
        await context.syncWorkspace();
      } catch (error) {
        return {
          content:
            error instanceof Error
              ? `Workspace synchronization failed: ${error.message}`
              : "Workspace synchronization failed.",
          isError: true,
        };
      }
    }
    return { content: result.output, isError: !result.success };
  }

  private async registryForRun(
    input: StartTurnInput,
    base: ToolRegistryPort = this.registry,
    runId?: string,
  ): Promise<ToolRegistryPort> {
    let composed = base;
    if (
      input.manifestName !== undefined &&
      this.mcpManager !== undefined &&
      this.mcpTargetResolver !== undefined
    ) {
      const targets = await this.mcpTargetResolver({
        owner: input.manifestOwner ?? input.owner,
        agent: input.manifestName,
        ...(input.dataScope === undefined
          ? {}
          : { dataScope: input.dataScope }),
      });
      const settled = await Promise.allSettled(
        targets.map((target) =>
          retryOperation(
            () =>
              this.mcpManager!.toolsForAgent(
                target,
                runId === undefined ? {} : { runId },
              ),
            { maxAttempts: 3, baseDelayMs: 100 },
          ),
        ),
      );
      for (const [i, result] of settled.entries()) {
        if (result.status === "rejected") {
          const server = targets[i]?.server.name ?? `index-${i}`;
          const reason = result.reason;
          this.debugLog?.(
            `MCP discovery failed for ${server}: ${reason instanceof Error ? reason.message : String(reason)}`,
          );
        }
      }
      const mounted = settled
        .filter(
          (result): result is PromiseFulfilledResult<readonly MinderTool[]> =>
            result.status === "fulfilled",
        )
        .flatMap((result) => result.value);
      if (mounted.length > 0)
        composed = new ToolRegistryView(base, [...base.all(), ...mounted]);
    }
    const manifestTools =
      runId === undefined
        ? undefined
        : this.manifestTools.has(runId)
          ? this.manifestTools.get(runId)
          : input.trigger.source === "approval"
            ? undefined
            : (await this.resolveManifest(input))?.tools;
    if (this.optionalToolResolver !== undefined && runId !== undefined) {
      const optional = await this.optionalToolResolver({
        owner: input.owner,
        runId,
        skills: this.manifestProfiles.get(runId)?.skills ?? [],
      });
      if (optional.length > 0)
        composed = new ToolRegistryView(composed, [
          ...composed.all(),
          ...optional,
        ]);
    }
    return applyManifestToolPolicy(composed, manifestTools);
  }

  private async recordMcpAudit(event: McpAuditEvent): Promise<void> {
    if (event.runId === undefined) return;
    if (event.kind === "discovery") {
      await this.store.appendGovernanceEvidence(event.owner, {
        runId: event.runId,
        at: this.now?.() ?? new Date().toISOString(),
        kind: "mcp_discovery",
        detail: {
          server: event.server,
          agent: event.agent,
          toolCount: event.toolCount,
        },
      });
      return;
    }
    if (event.kind === "call") {
      await this.store.appendGovernanceEvidence(event.owner, {
        runId: event.runId,
        at: this.now?.() ?? new Date().toISOString(),
        kind: "mcp_call",
        detail: {
          server: event.server,
          agent: event.agent,
          tool: event.tool,
          status: event.status,
          ...(event.code === undefined ? {} : { code: event.code }),
        },
      });
      return;
    }
    await this.store.appendGovernanceEvidence(event.owner, {
      runId: event.runId,
      at: this.now?.() ?? new Date().toISOString(),
      kind: "mcp_reconnect",
      detail: {
        server: event.server,
        agent: event.agent,
        status: event.status,
      },
    });
  }

  private approvalGateFor(
    owner: string,
    runId: string,
    autoApprovals: readonly string[],
    actionApprovals: Readonly<Record<string, boolean>>,
    onPause: (value: NonNullable<RuntimeSession["pendingApproval"]>) => void,
  ): Parameters<typeof streamInteractiveTurn>[0]["approvalGate"] {
    if (!this.approvalService) return undefined;
    const gate = createRuntimeApprovalGate({
      owner,
      runId,
      approvalService: this.approvalService,
      sha256: this.sha256,
      redactor: this.approvalRedactor,
      autoApprovals,
      actionApprovals,
      ...(this.now === undefined ? {} : { now: this.now }),
    });
    return async (value) => {
      const decision = await gate(value);
      if (decision.kind === "pause") {
        await this.store.appendGovernanceEvidence(owner, {
          runId,
          at: this.now?.() ?? new Date().toISOString(),
          kind: "approval_requested",
          detail: {
            approvalId: decision.request.approvalId,
            toolCallId: decision.request.toolCallId,
            action: decision.request.action,
            expiresAt: decision.request.expiresAt,
          },
        });
        await this.store.appendGovernanceEvidence(owner, {
          runId,
          at: this.now?.() ?? new Date().toISOString(),
          kind: "redaction",
          detail: {
            fields: ["arguments", "preview"],
            reason: "approval evidence stores a hash and redacted preview only",
          },
        });
        onPause({
          approvalId: decision.request.approvalId,
          runId,
          toolCallId: decision.request.toolCallId,
          action: decision.request.action,
          argumentsHash: decision.request.argumentsHash,
          preview: decision.request.preview,
          expiresAt: decision.request.expiresAt,
        });
      }
      return decision;
    };
  }

  private async toolContextFor(
    input: StartTurnInput,
    runId?: string,
  ): Promise<Omit<ToolContext, "signal">> {
    if (!this.workspaceProvider)
      return {
        ...this.toolContext,
        ...(input.delegation === undefined
          ? {}
          : {
              ...(input.delegation.roomId === undefined
                ? {}
                : { roomId: input.delegation.roomId }),
              ...(input.delegation.callerSubject === undefined
                ? {}
                : { callerSubject: input.delegation.callerSubject }),
              ...(input.delegation.authorizationRunId === undefined
                ? {}
                : { authorizationRunId: input.delegation.authorizationRunId }),
              ...(input.delegation.automationRunId === undefined
                ? {}
                : { automationRunId: input.delegation.automationRunId }),
              ...(input.delegation.automationOrganizationId === undefined
                ? {}
                : {
                    automationOrganizationId:
                      input.delegation.automationOrganizationId,
                  }),
            }),
        ...(runId === undefined ? {} : { runId }),
        ...(runId === undefined ? {} : { automationRunId: runId }),
        ...(input.context?.organizationId === undefined
          ? {}
          : { automationOrganizationId: input.context.organizationId }),
      };
    const workspace = await this.workspaceProvider.resolve(
      input.owner,
      input.key,
    );
    const manifest =
      runId !== undefined && this.manifestProfiles.has(runId)
        ? this.manifestProfiles.get(runId)
        : await this.resolveManifest(input);
    const workingDirectory =
      manifest?.workingDirectory === undefined
        ? workspace.root
        : ((await this.workspaceProvider.resolvePath?.(
            workspace.root,
            manifest.workingDirectory,
          )) ?? workspace.root);
    return {
      workspaceRoot: workspace.root,
      workingDirectory,
      ...(this.toolContext.fileAccess === undefined
        ? {}
        : { fileAccess: this.toolContext.fileAccess }),
      ...(input.delegation === undefined
        ? {}
        : {
            ...(input.delegation.roomId === undefined
              ? {}
              : { roomId: input.delegation.roomId }),
            ...(input.delegation.callerSubject === undefined
              ? {}
              : { callerSubject: input.delegation.callerSubject }),
            ...(input.delegation.authorizationRunId === undefined
              ? {}
              : { authorizationRunId: input.delegation.authorizationRunId }),
            ...(input.delegation.automationRunId === undefined
              ? {}
              : { automationRunId: input.delegation.automationRunId }),
            ...(input.delegation.automationOrganizationId === undefined
              ? {}
              : {
                  automationOrganizationId:
                    input.delegation.automationOrganizationId,
                }),
          }),
      ...(runId === undefined ? {} : { runId }),
      ...(runId === undefined ? {} : { automationRunId: runId }),
      ...(input.context?.organizationId === undefined
        ? {}
        : { automationOrganizationId: input.context.organizationId }),
      syncWorkspace: () => this.workspaceProvider!.sync(workspace),
    };
  }

  private async governanceFor(
    runId: string,
    owner: string,
  ): Promise<RuntimeGovernanceTracker> {
    const existing = this.governanceTrackers.get(runId);
    if (existing) return existing;
    const run = await this.store.getRun(runId);
    const evidence = await this.store.listGovernanceEvidence(
      owner,
      runId,
      undefined,
      1_000,
    );
    const initialUsage = latestGovernanceUsage(evidence);
    const governance = await rehydrateGovernancePolicy({
      governance: run?.governance,
      owner,
      sha256: this.sha256,
      ...(run?.manifestName === undefined
        ? {}
        : { manifestName: run.manifestName }),
      ...(run?.manifestOwner === undefined
        ? {}
        : { manifestOwner: run.manifestOwner }),
      ...(this.manifestLookup === undefined
        ? {}
        : {
            resolveManifest: this.manifestLookup.get.bind(this.manifestLookup),
          }),
      ...(this.runtimeGovernanceDefaults === undefined
        ? {}
        : { runtimeGovernanceDefaults: this.runtimeGovernanceDefaults }),
    });
    const tracker = createRuntimeGovernanceTracker({
      owner,
      runId,
      governance,
      store: this.store,
      ...(this.now === undefined ? {} : { now: this.now }),
      ...(this.runtimeGovernancePricing === undefined
        ? {}
        : { pricing: this.runtimeGovernancePricing }),
      ...(initialUsage === undefined ? {} : { initialUsage }),
    });
    this.governanceTrackers.set(runId, tracker);
    return tracker;
  }

  private async saveManifestSnapshot(
    owner: string,
    id: string,
    manifest: unknown,
  ): Promise<void> {
    if (this.evidence === undefined) return;
    const contentHash = manifestField(manifest, "manifestHash");
    const manifestName = manifestField(manifest, "manifestName");
    const sourcePath = manifestField(manifest, "manifestSourcePath");
    const yaml = manifestField(manifest, "manifestYaml");
    try {
      await this.evidence.saveManifest(owner, {
        runId: runId(id),
        manifest,
        ...(contentHash === undefined ? {} : { contentHash }),
        ...(manifestName === undefined ? {} : { manifestName }),
        ...(sourcePath === undefined ? {} : { sourcePath }),
        ...(yaml === undefined ? {} : { yaml }),
        createdAt: this.now?.() ?? new Date().toISOString(),
      });
    } catch (error) {
      writeRuntimeLog(
        this.debugLog,
        "agent_evidence_persistence_failed",
        {
          runId: String(runId(id)),
          ...runtimeErrorFields(error),
        },
        "error",
      );
    }
  }
}

function manifestField(manifest: unknown, field: string): string | undefined {
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    Array.isArray(manifest)
  )
    return undefined;
  const value = (manifest as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}
