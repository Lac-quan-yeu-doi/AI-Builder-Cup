import {
  EmptyToolRegistry,
  type DataScope,
  type McpManagerTarget,
  type MinderTool,
  type ToolRegistryPort,
} from "@application/shared/ports/index.js";
import type { JsonObject, RunMode } from "@domain/shared";
import type { RunContext } from "@domain/runtime/run-context.js";
import type { RuntimeManifest } from "@domain/runtime/governance-policy.js";
import type { GovernanceEvidencePage } from "@domain/runtime/governance-evidence.js";
import { InMemoryRuntimeStore } from "./memory-store.js";
import {
  RuntimeRunManager,
  type RuntimeRunManagerOptions,
} from "./runtime-run-manager.js";
import type {
  Admission,
  EventEnvelope,
  MaybePromise,
  RuntimeGovernanceAdmission,
  RuntimeRoomDelegation,
  RuntimeRun,
  RuntimeSession,
  RuntimeSubscription,
} from "./types.js";

export interface StartTurnInput {
  /** Pre-registered UUID supplied by the human Web client for room runs. */
  runId?: string;
  /** Correlation only; never persisted with the run. */
  requestId?: string;
  key: string;
  input: string;
  owner: string;
  mode: RunMode;
  trigger: { source: string; deliveryId?: string };
  manifestName?: string;
  /** Organization-scoped owner used only for manifest and MCP lookup. */
  manifestOwner?: string;
  dataScope?: DataScope;
  context?: RunContext;
  /** Trusted per-step system prompt supplied by the internal automation caller. */
  systemPrompt?: string;
  /** Verified room delegation supplied by the authenticated HTTP boundary. */
  delegation?: RuntimeRoomDelegation;
  clientToolResult?: ClientToolResultInput;
}

export interface GovernanceManifestLookup {
  get(input: {
    readonly owner: string;
    readonly name: string;
    readonly manifestOwner?: string;
  }): RuntimeManifest | undefined | Promise<RuntimeManifest | undefined>;
}

/** Resolves the owner-scoped MCP servers for one agent manifest. */
export type McpRuntimeTargetResolver = (input: {
  readonly owner: string;
  readonly agent: string;
  readonly dataScope?: DataScope;
}) => MaybePromise<readonly McpManagerTarget[]>;

export type RuntimeOptionalToolResolver = (input: {
  readonly owner: string;
  readonly runId: string;
  readonly skills: readonly string[];
}) => MaybePromise<readonly MinderTool[]>;

export interface ClientToolResultInput {
  readonly id: string;
  readonly content: string;
  readonly isError: boolean;
}

export interface RuntimeClientToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonObject;
}

export interface RunManagerToolRegistries {
  readonly interactive: ToolRegistryPort;
  readonly autonomous: ToolRegistryPort;
}

export interface RunManager {
  start(input: StartTurnInput): Promise<Admission>;
  admitQueued(input: StartTurnInput): Promise<Admission>;
  dispatchQueued(runId: string, owner: string): Promise<boolean>;
  cancelQueued(runId: string, owner: string): Promise<boolean>;
  getAuthorizedSession(
    sessionId: string,
    owner: string,
  ): MaybePromise<RuntimeSession | undefined>;
  getSessionByKey(
    key: string,
    owner: string,
  ): MaybePromise<RuntimeSession | undefined>;
  getAuthorizedRun(
    runId: string,
    owner: string,
  ): MaybePromise<RuntimeRun | undefined>;
  getGovernanceAdmission(
    runId: string,
    owner: string,
  ): MaybePromise<RuntimeGovernanceAdmission | undefined>;
  listGovernanceEvidence(
    runId: string,
    owner: string,
    cursor?: string,
    limit?: number,
  ): MaybePromise<GovernanceEvidencePage | undefined>;
  replay(
    runId: string,
    afterSeq: number,
    limit: number,
  ): MaybePromise<readonly EventEnvelope[]>;
  subscribe(runId: string): MaybePromise<RuntimeSubscription | undefined>;
  interrupt(runId: string): MaybePromise<boolean>;
  resumeApproval(input: {
    owner: string;
    runId: string;
    approvalId: string;
  }): Promise<ApprovalResume>;
}

export interface PlanResumer {
  resumePlan(input: {
    owner: string;
    runId: string;
    decision: "approved" | "denied";
  }): Promise<PlanResume>;
}

export type ApprovalResume =
  | Admission
  | { readonly kind: "not_found" }
  | {
      readonly kind: "resolved";
      readonly status:
        "denied" | "expired" | "hash_mismatch" | "execution_ambiguous";
    };

export type PlanResume =
  | Admission
  | { readonly kind: "not_found" }
  | { readonly kind: "resolved"; readonly status: "denied" | "invalid" };

export interface InMemoryRunManagerOptions extends Omit<
  RuntimeRunManagerOptions,
  "store" | "registry" | "autonomousRegistry"
> {
  store?: InMemoryRuntimeStore;
  registry?: ToolRegistryPort;
  autonomousRegistry?: ToolRegistryPort;
  defaultToolRegistries?: RunManagerToolRegistries;
}

/** Compatibility facade for local callers using the in-memory store. */
export class InMemoryRunManager
  extends RuntimeRunManager
  implements RunManager
{
  declare readonly store: InMemoryRuntimeStore;

  constructor(options: InMemoryRunManagerOptions) {
    const defaults = options.defaultToolRegistries ?? {
      interactive: new EmptyToolRegistry(),
      autonomous: new EmptyToolRegistry(),
    };
    super({
      ...options,
      store: options.store ?? new InMemoryRuntimeStore(),
      registry: options.registry ?? defaults.interactive,
      autonomousRegistry: options.autonomousRegistry ?? defaults.autonomous,
    });
  }

  override getSessionByKey(
    key: string,
    owner: string,
  ): RuntimeSession | undefined {
    return this.store.getSessionByKey(owner, key);
  }

  override getAuthorizedSession(
    sessionId: string,
    owner: string,
  ): RuntimeSession | undefined {
    const session = this.store.getSession(sessionId);
    return session?.owner === owner ? session : undefined;
  }

  override getAuthorizedRun(
    runId: string,
    owner: string,
  ): RuntimeRun | undefined {
    const run = this.store.getRun(runId);
    if (!run) return undefined;
    const session = this.store.getSession(run.sessionId);
    return session?.owner === owner ? run : undefined;
  }

  override getGovernanceAdmission(runId: string, owner: string) {
    return this.store.getGovernanceAdmission(runId, owner);
  }

  override listGovernanceEvidence(
    runId: string,
    owner: string,
    cursor?: string,
    limit?: number,
  ) {
    return this.getAuthorizedRun(runId, owner) === undefined
      ? undefined
      : this.store.listGovernanceEvidence(owner, runId, cursor, limit);
  }

  override replay(
    runId: string,
    afterSeq: number,
    limit: number,
  ): readonly EventEnvelope[] {
    return this.store.replay(
      runId,
      Math.max(0, afterSeq),
      Math.max(1, Math.min(limit, 512)),
    );
  }
}
