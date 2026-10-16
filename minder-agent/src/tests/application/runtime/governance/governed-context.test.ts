import { describe, expect, it } from "vitest";
import { rehydrateGovernancePolicy } from "@application/runtime/governance/governed-context.js";
import { sha256 } from "@infrastructure/crypto/sha256.js";

describe("rehydrateGovernancePolicy", () => {
  it("restores the executable tenant policy from its manifest after restart", async () => {
    const restored = await rehydrateGovernancePolicy({
      owner: "tenant-a",
      sha256,
      manifestName: "chat-assistant",
      manifestOwner: "organization-a",
      governance: {
        owner: "tenant-a",
        policyRevision: "persisted-revision",
        summary: {
          actionApprovals: {},
          autoApprovals: [],
          autonomy: "manual",
          sandbox: {
            enabled: false,
            allowedCommandCount: 0,
            writablePathCount: 0,
          },
          sensitiveFiles: "deny",
          budget: {
            maxInputTokens: 128000,
            maxOutputTokens: 16384,
            maxToolCalls: 50,
            maxCostUsd: null,
          },
        },
        admittedAt: "2026-09-16T00:00:00.000Z",
      },
      resolveManifest: async ({ owner, name, manifestOwner }) => {
        expect(manifestOwner).toBe("organization-a");
        return {
          owner,
          governance: {
            actionApprovals: { list_catalogs: false },
            autoApprovals: ["list_catalogs"],
          },
          ...(name === "chat-assistant" ? {} : { systemPrompt: "ignored" }),
        };
      },
    });

    expect(restored?.policy?.autoApprovals).toEqual(["list_catalogs"]);
    expect(restored?.policy?.actionApprovals).toEqual({ list_catalogs: false });
    expect(restored?.policyRevision).toBe("persisted-revision");
  });

  it("does not replace a policy already available in memory", async () => {
    const policy = {
      actionApprovals: {},
      autonomy: "manual" as const,
      sandbox: { enabled: false, allowedCommands: [], writablePaths: [] },
      sensitiveFiles: "deny" as const,
      budget: {
        maxInputTokens: 1,
        maxOutputTokens: 1,
        maxToolCalls: 1,
        maxCostUsd: null,
      },
    };
    const governance = {
      owner: "tenant-a",
      policyRevision: "live",
      summary: {
        actionApprovals: {},
        autoApprovals: [],
        autonomy: "manual" as const,
        sandbox: {
          enabled: false,
          allowedCommandCount: 0,
          writablePathCount: 0,
        },
        sensitiveFiles: "deny" as const,
        budget: { ...policy.budget },
      },
      admittedAt: "2026-09-16T00:00:00.000Z",
      policy,
    };

    await expect(
      rehydrateGovernancePolicy({
        owner: "tenant-a",
        sha256,
        manifestName: "chat-assistant",
        governance,
        resolveManifest: () => undefined,
      }),
    ).resolves.toBe(governance);
  });
});
