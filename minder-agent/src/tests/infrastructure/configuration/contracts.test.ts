import { describe, expect, it } from "vitest";
import {
  formatConfigForDiagnostics,
  resolveMinderPaths,
} from "@infrastructure/configuration";

describe("configuration contracts", () => {
  it("redacts API keys in diagnostics", () => {
    expect(
      formatConfigForDiagnostics({
        baseUrl: "https://example.test",
        apiKey: "secret",
        model: "gpt",
      }),
    ).toContain("***");
  });

  it("keeps all application paths rooted at the configured base", () => {
    expect(resolveMinderPaths("/tmp/minder").data).toBe("/tmp/minder/data");
  });
});
