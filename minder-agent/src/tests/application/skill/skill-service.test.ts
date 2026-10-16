import { describe, expect, it } from "vitest";
import { createMemorySkillStore, createSkillService } from "@application/skill";
import { sha256 } from "@infrastructure/crypto/sha256.js";

describe("skill service", () => {
  it("makes global skills authoritative and omits bodies from catalog summaries", async () => {
    const service = createSkillService({
      globalSkills: [
        {
          name: "deploy",
          description: "global",
          body: "global body",
          namespace: "ops",
        },
      ],
      store: createMemorySkillStore([
        {
          body: "project body",
          createdAt: "2026-01-01T00:00:00.000Z",
          description: "project",
          hash: "project-hash",
          name: "deploy" as never,
          namespace: "ops",
          readOnly: false,
          source: "project",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
      sha256,
    });
    await service.saveProject({
      name: "review",
      body: "review body",
      namespace: "engineering",
    });

    await expect(service.resolve({ name: "deploy" })).resolves.toMatchObject({
      body: "global body",
      readOnly: true,
      source: "global",
    });
    await expect(service.list()).resolves.toEqual([
      {
        description: "global",
        name: "deploy",
        namespace: "ops",
        readOnly: true,
        source: "global",
      },
      {
        name: "review",
        namespace: "engineering",
        readOnly: false,
        source: "project",
      },
    ]);
  });

  it("applies a manifest allowlist as a narrowing filter and prevents global mutation", async () => {
    const service = createSkillService({
      globalSkills: [{ name: "deploy", body: "global body", namespace: "ops" }],
      store: createMemorySkillStore(),
      sha256,
    });
    await service.saveProject({
      name: "review",
      body: "review body",
      namespace: "engineering",
    });

    await expect(service.list({ allowlist: ["review"] })).resolves.toHaveLength(
      1,
    );
    await expect(
      service.resolve({ name: "deploy", allowlist: ["review"] }),
    ).resolves.toBeUndefined();
    await expect(service.deleteProject("deploy")).rejects.toThrow("read-only");
  });
});
