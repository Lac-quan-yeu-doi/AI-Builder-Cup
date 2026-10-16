import { describe, expect, it } from "vitest";
import { RuntimeStoreError } from "@application/runtime/execution/errors.js";

describe("runtime store application errors", () => {
  it("preserves the runtime store error code outside the in-memory adapter", () => {
    const error = new RuntimeStoreError("invalid_transition", "invalid");

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("invalid_transition");
    expect(error.message).toBe("invalid");
  });
});
