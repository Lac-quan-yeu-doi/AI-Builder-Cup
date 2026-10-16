import { describe, expect, it } from "vitest";
import { createUnavailableContextCollector } from "@application/context";

describe("context contracts", () => {
  it("does not silently collect context before its implementation phase", async () => {
    await expect(
      createUnavailableContextCollector().collect({} as never),
    ).rejects.toThrow("context-collection");
  });
});
