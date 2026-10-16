import { describe, expect, expectTypeOf, it } from "vitest";
import { type AgentManifest, type GovernancePolicy } from "@application/agent";
import { createManifestLoader } from "@infrastructure/agent";

const manifestWith = (governance: string) => `
name: governed-agent
description: A governed agent.
system_prompt: Stay concise.
tools:
  mode: all
  names: []
execution:
  mode: interactive
${governance}`;

function validate(yaml: string) {
  return createManifestLoader({
    workspace: {
      async list() {
        return [];
      },
      async read() {
        return undefined;
      },
      async write() {
        throw new Error("not used");
      },
      async remove() {
        throw new Error("not used");
      },
    },
  }).validate({ owner: "alice", yaml });
}

describe("governance manifest", () => {
  it("supplies backward-compatible defaults when governance is omitted", async () => {
    await expect(validate(manifestWith(""))).resolves.toMatchObject({
      manifest: {
        governance: {
          actionApprovals: {},
          autoApprovals: ["*"],
          autonomy: "manual",
          sandbox: {
            enabled: false,
            allowedCommands: [],
            writablePaths: [],
          },
          sensitiveFiles: "deny",
          budget: {
            maxInputTokens: 128000,
            maxOutputTokens: 16384,
            maxToolCalls: 50,
            maxCostUsd: null,
          },
        },
      },
    });
  });

  it("parses an explicit auto-approval action list", async () => {
    await expect(
      validate(
        manifestWith(
          "governance:\n  auto_approvals:\n    - mcp__warehouse__query\n    - Write",
        ),
      ),
    ).resolves.toMatchObject({
      manifest: {
        governance: { autoApprovals: ["mcp__warehouse__query", "Write"] },
      },
    });
  });

  it("accepts the wildcard auto-approval action", async () => {
    await expect(
      validate(manifestWith("governance:\n  auto_approvals:\n    - '*'")),
    ).resolves.toMatchObject({
      manifest: { governance: { autoApprovals: ["*"] } },
    });
  });

  it.each([
    [
      "an invalid autonomy",
      "governance:\n  autonomy: autonomous",
      "manifest governance.autonomy is invalid",
    ],
    [
      "an unsafe action name",
      "governance:\n  action_approvals:\n    'shell run': true",
      "manifest governance.action_approvals is invalid",
    ],
    [
      "a non-positive budget limit",
      "governance:\n  budget:\n    max_tool_calls: 0",
      "manifest governance.budget.max_tool_calls is invalid",
    ],
  ])(
    "rejects %s without disclosing the supplied policy value",
    async (_name, governance, message) => {
      await expect(validate(manifestWith(governance))).rejects.toThrow(message);
    },
  );

  it.each([
    [
      "a secret-like action key",
      "governance:\n  action_approvals:\n    'resolved-secret-action-key/invalid': true",
      "resolved-secret-action-key/invalid",
    ],
    [
      "a secret-like action value",
      "governance:\n  action_approvals:\n    tool.execute: resolved-secret-action-value",
      "resolved-secret-action-value",
    ],
  ])(
    "does not disclose %s in an action approval error",
    async (_name, governance, secret) => {
      const result = validate(manifestWith(governance));

      await expect(result).rejects.toThrow(
        "manifest governance.action_approvals is invalid",
      );
      await expect(result).rejects.not.toThrow(secret);
    },
  );

  it.each([
    ["root", "governance:\n  autonmy: safe", "manifest governance is invalid"],
    [
      "sandbox",
      "governance:\n  sandbox:\n    enable: true",
      "manifest governance.sandbox is invalid",
    ],
    [
      "budget",
      "governance:\n  budget:\n    max_input_tokenz: 100",
      "manifest governance.budget is invalid",
    ],
  ])(
    "rejects an unknown %s policy key",
    async (_level, governance, message) => {
      await expect(validate(manifestWith(governance))).rejects.toThrow(message);
    },
  );

  it("keeps direct manifests source-compatible and exposes GovernancePolicy", () => {
    const manifest: AgentManifest = {
      name: "external-agent",
      description: "Constructed outside the loader.",
      model: {},
      systemPrompt: { kind: "inline", value: "Stay concise." },
      tools: { mode: "all", names: [] },
      workingDirectory: ".",
      execution: { mode: "interactive", maxIterations: 1 },
      tags: [],
      mcpServers: {},
      clientTools: [],
      actionApprovals: {},
      skills: [],
    };
    const policy: GovernancePolicy = {
      actionApprovals: {},
      autonomy: "manual",
      sandbox: { enabled: false, allowedCommands: [], writablePaths: [] },
      sensitiveFiles: "deny",
      budget: {
        maxInputTokens: 1,
        maxOutputTokens: 1,
        maxToolCalls: 1,
        maxCostUsd: null,
      },
    };

    expect(manifest.name).toBe("external-agent");
    expect(policy.autonomy).toBe("manual");
    expectTypeOf(manifest.governance).toEqualTypeOf<
      GovernancePolicy | undefined
    >();
  });
});
