import { describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_GOVERNANCE_POLICY } from "@application/runtime";
import { decideToolAction } from "@domain/runtime/governance-enforcer.js";

const policy = {
  ...DEFAULT_RUNTIME_GOVERNANCE_POLICY,
  autoApprovals: [],
  budget: { ...DEFAULT_RUNTIME_GOVERNANCE_POLICY.budget, maxToolCalls: 2 },
};
const usage = { toolCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

describe("governance enforcer", () => {
  it("denies exhausted budgets before tool policy", () => {
    expect(
      decideToolAction({
        policy,
        action: "Write",
        readOnly: false,
        usage: { ...usage, toolCalls: 2 },
      }),
    ).toEqual({
      kind: "deny",
      code: "budget",
      reason: "tool call budget exhausted",
    });
  });
  it("checks the invoked command name against the sandbox allowlist", () => {
    expect(
      decideToolAction({
        policy: {
          ...policy,
          sandbox: {
            enabled: true,
            allowedCommands: ["bash", "python3"],
            writablePaths: [],
          },
        },
        action: "Bash",
        command: "python3 -c 'print(1 + 1)'",
        readOnly: true,
        usage,
      }),
    ).toEqual({ kind: "allow" });
  });

  it("allows Bash scripts beyond the executable allowlist", () => {
    expect(
      decideToolAction({
        policy: {
          ...policy,
          autoApprovals: ["Bash"],
          sandbox: {
            enabled: true,
            allowedCommands: ["bash", "python3"],
            writablePaths: [],
          },
        },
        action: "Bash",
        command:
          "mkdir -p reports && typst compile reports/report.typ reports/report.pdf",
        readOnly: false,
        usage,
      }),
    ).toEqual({ kind: "allow" });
  });

  it("blocks commands outside the sandbox allowlist", () => {
    expect(
      decideToolAction({
        policy: {
          ...policy,
          sandbox: {
            enabled: true,
            allowedCommands: ["git"],
            writablePaths: [],
          },
        },
        action: "RunCommand",
        command: "curl https://example.com",
        readOnly: false,
        usage,
      }),
    ).toMatchObject({ kind: "deny" });
  });
  it("requires approval for manual mutable actions", () => {
    expect(
      decideToolAction({ policy, action: "Write", readOnly: false, usage }),
    ).toMatchObject({ kind: "approval_required" });
  });

  it("allows an explicitly auto-approved mutable action without pausing", () => {
    expect(
      decideToolAction({
        policy: { ...policy, autoApprovals: ["Write"] },
        action: "Write",
        readOnly: false,
        usage,
      }),
    ).toEqual({ kind: "allow" });
  });

  it("keeps hard governance denials ahead of auto-approval", () => {
    expect(
      decideToolAction({
        policy: {
          ...policy,
          autoApprovals: ["Write"],
          sensitiveFiles: "deny",
        },
        action: "Write",
        path: ".env",
        readOnly: false,
        usage,
      }),
    ).toMatchObject({ kind: "deny", code: "sensitive_file" });
  });
});
