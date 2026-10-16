import type { ToolGovernanceContext } from "@application/shared/ports/index.js";
import type { JsonObject } from "@domain/shared";
import {
  decideToolAction,
  type GovernanceUsage,
} from "@domain/runtime/governance-enforcer.js";
import type { AdmittedGovernancePolicy } from "@domain/runtime/governance-policy.js";
import {
  resolveGovernancePolicy,
  type RuntimeGovernanceDefaults,
  type RuntimeManifest,
} from "@domain/runtime/governance-policy.js";
import { decisionEvidence } from "@domain/runtime/governance-evidence.js";
import type { RuntimeStore } from "../execution/types.js";
import type { Sha256 } from "@application/shared/ports/index.js";

export interface RuntimeGovernanceTracker {
  readonly context: ToolGovernanceContext;
  readonly approvedContext: ToolGovernanceContext;
  readonly autoApprovals: readonly string[];
  readonly actionApprovals: Readonly<Record<string, boolean>>;
  addUsage(delta: { readonly input: number; readonly output: number }): void;
  getUsage(): GovernanceUsage;
}

export interface RuntimeGovernancePricing {
  readonly inputCostPer1kUsd: number;
  readonly outputCostPer1kUsd: number;
}

/**
 * Reconstructs the executable policy for a persisted run whose database row
 * contains only the redacted governance summary. The manifest is resolved
 * owner-scoped so a restart cannot borrow another tenant's policy.
 */
export async function rehydrateGovernancePolicy(input: {
  readonly governance: AdmittedGovernancePolicy | undefined;
  readonly owner: string;
  readonly manifestName?: string;
  readonly manifestOwner?: string;
  readonly resolveManifest?: (input: {
    readonly owner: string;
    readonly name: string;
    readonly manifestOwner?: string;
  }) => RuntimeManifest | undefined | Promise<RuntimeManifest | undefined>;
  readonly runtimeGovernanceDefaults?: RuntimeGovernanceDefaults;
  readonly sha256: Sha256;
}): Promise<AdmittedGovernancePolicy | undefined> {
  const { governance } = input;
  if (
    governance === undefined ||
    governance.policy !== undefined ||
    input.manifestName === undefined ||
    input.resolveManifest === undefined
  )
    return governance;

  const manifest = await input.resolveManifest({
    owner: input.owner,
    name: input.manifestName,
    ...(input.manifestOwner === undefined
      ? {}
      : { manifestOwner: input.manifestOwner }),
  });
  if (manifest === undefined) return governance;

  const resolved = resolveGovernancePolicy({
    owner: input.owner,
    sha256: input.sha256,
    manifest,
    ...(input.runtimeGovernanceDefaults === undefined
      ? {}
      : { runtimeDefaults: input.runtimeGovernanceDefaults }),
  });
  return { ...governance, policy: resolved.policy };
}

export function createRuntimeGovernanceTracker(input: {
  readonly owner: string;
  readonly runId: string;
  readonly governance: AdmittedGovernancePolicy | undefined;
  readonly store: RuntimeStore;
  readonly now?: () => string;
  readonly pricing?: RuntimeGovernancePricing;
  readonly initialUsage?: GovernanceUsage;
}): RuntimeGovernanceTracker {
  const usage: MutableGovernanceUsage = {
    toolCalls: input.initialUsage?.toolCalls ?? 0,
    inputTokens: input.initialUsage?.inputTokens ?? 0,
    outputTokens: input.initialUsage?.outputTokens ?? 0,
    costUsd: input.initialUsage?.costUsd ?? 0,
  };
  const makeContext = (approvalGranted: boolean): ToolGovernanceContext => ({
    ...(approvalGranted ? { approvalGranted: true } : {}),
    async check(value) {
      const decision = decide(
        input.governance?.policy,
        value,
        usage,
        approvalGranted,
      );
      const evidenceDecision =
        decision.kind === "approval_required" && approvalGranted
          ? { kind: "allow" as const }
          : decision;
      await input.store.appendGovernanceEvidence(input.owner, {
        runId: input.runId,
        at: input.now?.() ?? new Date().toISOString(),
        kind: "tool_decision",
        detail: decisionEvidence({
          action: value.name,
          readOnly: value.readOnly,
          decision: evidenceDecision,
          usage,
        }),
      });
      if (evidenceDecision.kind === "allow") {
        usage.toolCalls += 1;
        return { allowed: true };
      }
      if (
        evidenceDecision.kind === "deny" &&
        evidenceDecision.code === "budget"
      ) {
        await input.store.appendGovernanceEvidence(input.owner, {
          runId: input.runId,
          at: input.now?.() ?? new Date().toISOString(),
          kind: "budget_exhausted",
          detail: {
            reason: evidenceDecision.reason,
            usage: { ...usage },
          },
        });
      }
      return {
        allowed: false,
        reason: evidenceDecision.reason,
        ...(evidenceDecision.kind === "deny"
          ? { code: evidenceDecision.code }
          : {}),
      };
    },
  });
  return {
    context: makeContext(false),
    approvedContext: makeContext(true),
    autoApprovals: input.governance?.policy?.autoApprovals ?? [],
    actionApprovals: input.governance?.policy?.actionApprovals ?? {},
    addUsage(delta) {
      usage.inputTokens += Math.max(0, delta.input);
      usage.outputTokens += Math.max(0, delta.output);
      usage.costUsd +=
        (Math.max(0, delta.input) / 1000) *
          (input.pricing?.inputCostPer1kUsd ?? 0) +
        (Math.max(0, delta.output) / 1000) *
          (input.pricing?.outputCostPer1kUsd ?? 0);
    },
    getUsage() {
      return { ...usage };
    },
  };
}

function decide(
  policy: AdmittedGovernancePolicy["policy"],
  value: {
    readonly name: string;
    readonly arguments: JsonObject;
    readonly readOnly: boolean;
  },
  usage: GovernanceUsage,
  approvalGranted: boolean,
): ReturnType<typeof decideToolAction> {
  if (policy === undefined)
    return {
      kind: "deny",
      code: "policy_unavailable",
      reason:
        "Workspace access is temporarily unavailable. Please retry this request.",
    };
  const command = stringArgument(value.arguments, ["command", "cmd"]);
  const path = stringArgument(value.arguments, [
    "file_path",
    "path",
    "filename",
  ]);
  const decision = decideToolAction({
    policy,
    action: value.name,
    readOnly: value.readOnly,
    ...(command === undefined ? {} : { command }),
    ...(path === undefined ? {} : { path }),
    usage,
  });
  if (decision.kind === "approval_required" && approvalGranted)
    return { kind: "allow" };
  return decision;
}

function stringArgument(
  value: JsonObject,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === "string") return value[key];
  }
  return undefined;
}

interface MutableGovernanceUsage {
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
