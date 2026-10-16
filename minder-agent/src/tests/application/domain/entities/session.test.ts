import { describe, expect, it } from "vitest";

import { createSessionTurn } from "@domain/index.js";

describe("session turns", () => {
  it("rejects a turn that attempts to preserve more than one pause kind", () => {
    expect(() =>
      createSessionTurn({
        history: [],
        pendingQuestion: {
          version: 1,
          kind: "free_text",
          question: "Continue?",
          options: [],
          allowOther: true,
        },
        pendingPlan: { steps: [] },
      }),
    ).toThrow("at most one pending pause");
  });
});
