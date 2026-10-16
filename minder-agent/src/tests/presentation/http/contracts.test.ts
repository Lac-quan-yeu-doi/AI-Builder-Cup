import { describe, expect, it } from "vitest";
import { toAdmissionDto } from "../../../presentation/http/contracts/index.js";

describe("serve contracts", () => {
  it("distinguishes accepted, busy, and duplicate delivery DTOs", () => {
    expect(toAdmissionDto({ kind: "duplicate_delivery" })).toEqual({
      status: "duplicate_delivery",
    });
  });
});
