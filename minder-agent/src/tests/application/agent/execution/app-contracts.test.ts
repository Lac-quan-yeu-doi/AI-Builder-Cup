import { describe, expect, it } from "vitest";
import { toAdmissionReadModel } from "@application/agent";

describe("app contracts", () => {
  it("preserves duplicate delivery as a distinct admission outcome", () => {
    expect(toAdmissionReadModel({ kind: "duplicate_delivery" })).toEqual({
      kind: "duplicate_delivery",
    });
  });
});
