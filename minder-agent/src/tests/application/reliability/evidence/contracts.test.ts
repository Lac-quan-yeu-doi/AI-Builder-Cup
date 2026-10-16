import { describe, expect, it } from "vitest";
import { createUnavailableSecretRedactor } from "@application/reliability";

describe("reliability contracts", () => {
  it("does not claim a secret scanner exists before its adapter phase", () => {
    expect(() => createUnavailableSecretRedactor().redact("secret")).toThrow(
      "secret-redaction",
    );
  });
});
