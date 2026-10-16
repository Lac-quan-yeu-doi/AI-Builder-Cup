import { describe, expect, it } from "vitest";

const sourceAliases = [
  "@domain/index.js",
  "@application/shared/ports/index.js",
  "@application/agent",
  "@application/context",
  "@application/reliability",
  "@application/room",
  "@application/skill",
  "@infrastructure/mcp",
  "@infrastructure/tools/impl",
  "@infrastructure/workspace",
  "@infrastructure/observability",
] as const;

describe("Nest monolith source scaffold", () => {
  it("imports every public root alias", async () => {
    for (const alias of sourceAliases)
      await expect(import(alias)).resolves.toBeDefined();
  }, 30_000);

  it("keeps the source tree free of workspace declarations", async () => {
    const packageJson = await import("../../../package.json", {
      with: { type: "json" },
    });
    expect(packageJson.default).not.toHaveProperty("workspaces");
  });

  it("documents the contract workspace for future implementation phases", async () => {
    const { readFile } = await import("node:fs/promises");
    expect(await readFile("README.md", "utf8")).toContain(
      "## Contract workspace",
    );
  });
});
