import type { GovernancePolicy } from "./governance-policy.js";

export type GovernanceDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "approval_required"; readonly reason: string }
  | {
      readonly kind: "deny";
      readonly code:
        | "sandbox"
        | "sensitive_file"
        | "budget"
        | "autonomy"
        | "policy_unavailable";
      readonly reason: string;
    };

export interface GovernanceUsage {
  readonly toolCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export function decideToolAction(input: {
  readonly policy: GovernancePolicy;
  readonly action: string;
  readonly readOnly: boolean;
  readonly command?: string;
  readonly path?: string;
  readonly usage: GovernanceUsage;
}): GovernanceDecision {
  const { policy, usage } = input;
  if (usage.toolCalls >= policy.budget.maxToolCalls)
    return {
      kind: "deny",
      code: "budget",
      reason: "tool call budget exhausted",
    };
  if (
    usage.inputTokens > policy.budget.maxInputTokens ||
    usage.outputTokens > policy.budget.maxOutputTokens ||
    (policy.budget.maxCostUsd !== null &&
      usage.costUsd >= policy.budget.maxCostUsd)
  )
    return {
      kind: "deny",
      code: "budget",
      reason: "governance budget exhausted",
    };
  if (
    input.path !== undefined &&
    policy.sensitiveFiles === "deny" &&
    isSensitivePath(input.path)
  )
    return {
      kind: "deny",
      code: "sensitive_file",
      reason: "sensitive file access denied",
    };
  if (
    policy.sandbox.enabled &&
    input.action !== "Bash" &&
    input.command !== undefined &&
    !policy.sandbox.allowedCommands.includes(commandExecutable(input.command))
  )
    return {
      kind: "deny",
      code: "sandbox",
      reason: "command is outside the sandbox allowlist",
    };
  if (
    policy.actionApprovals[input.action] !== true &&
    (policy.autoApprovals?.includes(input.action) ||
      policy.autoApprovals?.includes("*"))
  )
    return { kind: "allow" };
  if (policy.autonomy === "manual" && !input.readOnly)
    return {
      kind: "approval_required",
      reason: "manual autonomy requires approval",
    };
  if (policy.actionApprovals[input.action] === true)
    return {
      kind: "approval_required",
      reason: "action policy requires approval",
    };
  return { kind: "allow" };
}

function commandExecutable(command: string): string {
  const token = command.trim().match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/u);
  return (token?.slice(1).find(Boolean) ?? "").split("/").pop() ?? "";
}

function isSensitivePath(path: string): boolean {
  return /(^|\/)(?:\.env(?:\.|$)|\.ssh|id_rsa|credentials|secrets?)(?:\/|$)/iu.test(
    path,
  );
}
