import { describe, expect, it } from "vitest";
import {
  agentConfigurationHash,
  validateAgentConfiguration,
} from "@domain/index.js";
import { createAgentConfigurationService } from "@application/agent";
import { createMemoryAgentConfigurationStore } from "@infrastructure/agent";
import { sha256 } from "@infrastructure/crypto/sha256.js";

const agent = {
  executionStrategy: "react" as const,
  id: "reviewer",
  name: "reviewer",
  skills: ["review"],
  toolAllowlist: ["ReadFile"],
};

describe("agent configuration service", () => {
  it("validates steps and duplicate allowlist entries while hashing canonical configuration", () => {
    expect(() => validateAgentConfiguration({ ...agent, maxSteps: 0 })).toThrow(
      "maxSteps",
    );
    expect(() =>
      validateAgentConfiguration({
        ...agent,
        toolAllowlist: ["ReadFile", "ReadFile"],
      }),
    ).toThrow("duplicate");
    expect(
      agentConfigurationHash(validateAgentConfiguration(agent), sha256),
    ).toBe(
      agentConfigurationHash(validateAgentConfiguration({ ...agent }), sha256),
    );
  });

  it("keeps agent configuration owner-isolated and does not revise no-op updates", async () => {
    const store = createMemoryAgentConfigurationStore(sha256);
    const alice = createAgentConfigurationService({
      owner: "alice",
      store,
      sha256,
    });
    const bob = createAgentConfigurationService({
      owner: "bob",
      store,
      sha256,
    });
    const created = await alice.create(agent);

    expect(created.version).toBe(1);
    await expect(bob.get("reviewer")).resolves.toBeUndefined();
    await expect(
      alice.update("reviewer", { name: "reviewer" }),
    ).resolves.toMatchObject({ version: 1 });
  });

  it("archives, diffs, and rolls back through immutable owner-scoped revisions", async () => {
    const service = createAgentConfigurationService({
      owner: "alice",
      store: createMemoryAgentConfigurationStore(sha256),
      sha256,
    });
    await service.create(agent);
    await service.update("reviewer", { displayName: "Reviewer" });

    expect(await service.history("reviewer")).toHaveLength(2);
    expect(await service.diff("reviewer", 1, 2)).toContainEqual(
      expect.objectContaining({ path: "displayName" }),
    );
    const rolledBack = await service.rollback("reviewer", 1);
    expect(rolledBack.version).toBe(3);
    expect(rolledBack.agent).not.toHaveProperty("displayName");
    await service.archive("reviewer");
    expect(await service.list()).toEqual([]);
  });
});
