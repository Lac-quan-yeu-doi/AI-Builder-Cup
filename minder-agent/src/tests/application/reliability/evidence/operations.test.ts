import { describe, expect, it } from "vitest";
import {
  createOutputValidator,
  createRunManifest,
  createSecretRedactor,
} from "@application/reliability";
import { sha256 } from "@infrastructure/crypto/sha256.js";

describe("reliability operations", () => {
  it("redacts configured secrets and credential-shaped values", () => {
    const redactor = createSecretRedactor(["literal-secret"]);
    expect(
      redactor.redact(
        "token=literal-secret Authorization: Bearer abc.def.ghi api_key=xyz",
      ),
    ).toBe(
      "token=[REDACTED] Authorization: Bearer [REDACTED] api_key=[REDACTED]",
    );
  });

  it("builds an immutable manifest that never exposes configured secrets", () => {
    const redactor = createSecretRedactor(["super-secret-token"]);
    const manifest = createRunManifest(
      [
        { type: "text", data: "using super-secret-token now" },
        { type: "done", data: { response_text: "ok" } },
      ],
      { runId: "run-1", status: "completed" },
      redactor,
      sha256,
    );
    expect(JSON.stringify(manifest)).not.toContain("super-secret-token");
    expect(manifest.contentHash.length).toBeGreaterThan(0);
    // A second identical build is stable (immutable content hash).
    const again = createRunManifest(
      [
        { type: "text", data: "using super-secret-token now" },
        { type: "done", data: { response_text: "ok" } },
      ],
      { runId: "run-1", status: "completed" },
      redactor,
      sha256,
    );
    expect(again.contentHash).toBe(manifest.contentHash);
  });

  it("rejects empty and oversized final output", () => {
    const validator = createOutputValidator({ maxCharacters: 5 });
    expect(validator.validate(" ")).toEqual({
      valid: false,
      errors: ["Output must not be empty."],
    });
    expect(validator.validate("123456")).toEqual({
      valid: false,
      errors: ["Output exceeds the 5 character limit."],
    });
    expect(validator.validate("done")).toEqual({ valid: true, errors: [] });
  });
});
