import { describe, expect, it } from "vitest";
import {
  canonicalGovernancePolicy,
  policyRevision,
  resolveGovernancePolicy,
} from "@application/runtime";
import { sha256 } from "@infrastructure/crypto/sha256.js";

describe("governance policy admission", () => {
  it("uses the runtime defaults when no owner-scoped manifest is available", () => {
    const resolved = resolveGovernancePolicy({
      owner: "alice",
      sha256,
      runtimeDefaults: {
        autonomy: "safe",
        budget: { maxToolCalls: 7 },
      },
    });

    expect(resolved.policy).toMatchObject({
      autonomy: "safe",
      sensitiveFiles: "deny",
      budget: {
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        maxToolCalls: 7,
        maxCostUsd: null,
      },
    });
    expect(resolved.policyRevision).toBe(
      policyRevision(resolved.policy, sha256),
    );
  });

  it("gives an owner-scoped manifest policy precedence and excludes command and path values from its summary", () => {
    const resolved = resolveGovernancePolicy({
      owner: "alice",
      sha256,
      runtimeDefaults: { autonomy: "manual", budget: { maxToolCalls: 7 } },
      manifest: {
        owner: "alice",
        governance: {
          actionApprovals: { "report.publish": true, "report.read": false },
          autoApprovals: ["catalog.list"],
          autonomy: "supervised",
          sandbox: {
            enabled: true,
            allowedCommands: ["git", "node"],
            writablePaths: ["reports", "tmp"],
          },
          sensitiveFiles: "allow_templates",
          budget: {
            maxInputTokens: 4096,
            maxOutputTokens: 1024,
            maxToolCalls: 2,
            maxCostUsd: 0.25,
          },
        },
      },
    });

    expect(resolved.policy).toMatchObject({
      autonomy: "supervised",
      autoApprovals: ["catalog.list"],
      budget: { maxToolCalls: 2, maxCostUsd: 0.25 },
    });
    expect(resolved.summary).toEqual({
      actionApprovals: { "report.publish": true, "report.read": false },
      autoApprovals: ["catalog.list"],
      autonomy: "supervised",
      sandbox: {
        enabled: true,
        allowedCommandCount: 2,
        writablePathCount: 2,
      },
      sensitiveFiles: "allow_templates",
      budget: {
        maxInputTokens: 4096,
        maxOutputTokens: 1024,
        maxToolCalls: 2,
        maxCostUsd: 0.25,
      },
    });
  });

  it("serializes validated action names in code-point order for a stable SHA-256 revision", () => {
    const policy = {
      actionApprovals: {
        report_publish: true,
        "report:publish": false,
        "report.publish": false,
        "report-publish": true,
      },
      autonomy: "supervised" as const,
      sandbox: {
        enabled: true,
        allowedCommands: ["node", "git"],
        writablePaths: ["tmp", "reports"],
      },
      sensitiveFiles: "allow_templates" as const,
      budget: {
        maxInputTokens: 4096,
        maxOutputTokens: 1024,
        maxToolCalls: 2,
        maxCostUsd: 0.25,
      },
    };

    expect(canonicalGovernancePolicy(policy)).toBe(
      '{"actionApprovals":{"report-publish":true,"report.publish":false,"report:publish":false,"report_publish":true},"autoApprovals":[],"autonomy":"supervised","sandbox":{"enabled":true,"allowedCommands":["git","node"],"writablePaths":["reports","tmp"]},"sensitiveFiles":"allow_templates","budget":{"maxInputTokens":4096,"maxOutputTokens":1024,"maxToolCalls":2,"maxCostUsd":0.25}}',
    );
    expect(policyRevision(policy, sha256)).toBe(
      "65e8cdb83bc4b3439951acc130dfdafd661b5ad3c9b80e730c8abfb0e807a850",
    );
  });
});
