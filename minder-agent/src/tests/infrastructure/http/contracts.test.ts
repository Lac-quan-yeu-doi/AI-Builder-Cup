import { describe, expect, it } from "vitest";
import { defaultProviderCapabilities } from "@infrastructure/http";

describe("HTTP contracts", () => {
  it("models provider capabilities separately from a transport adapter", () => {
    expect(defaultProviderCapabilities("gpt-5").supportsTools).toBe(true);
  });
});
