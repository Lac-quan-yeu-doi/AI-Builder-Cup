import { describe, expect, it } from "vitest";
import { truncateOutput } from "@infrastructure/tools/core/index.js";

describe("truncateOutput", () => {
  it("keeps output within the cap with a deterministic marker", () => {
    const result = truncateOutput("x".repeat(20_000), 10_000);
    expect(result).toHaveLength(10_000);
    expect(result.endsWith("\n... output truncated ...\n")).toBe(true);
  });

  it("leaves short output unchanged", () => {
    expect(truncateOutput("short", 10_000)).toBe("short");
  });
});
