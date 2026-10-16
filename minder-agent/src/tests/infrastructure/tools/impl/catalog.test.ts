import { describe, expect, it } from "vitest";
import { TOOL_CATALOG } from "@infrastructure/tools/impl";

describe("tool catalog", () => {
  it("models Trino as remote MCP capability rather than a local tool", () => {
    expect(TOOL_CATALOG.find((tool) => tool.name === "trino")?.kind).toBe(
      "mcp",
    );
  });

  it("retains the historical canonical and legacy tool vocabulary", () => {
    expect(TOOL_CATALOG.find((tool) => tool.name === "TeamCreate")?.kind).toBe(
      "prompt_only",
    );
    expect(
      TOOL_CATALOG.find((tool) => tool.name === "Read")?.aliases,
    ).toContain("read_file");
    expect(TOOL_CATALOG.find((tool) => tool.name === "ApplyPatch")?.kind).toBe(
      "prompt_only",
    );
  });
});
