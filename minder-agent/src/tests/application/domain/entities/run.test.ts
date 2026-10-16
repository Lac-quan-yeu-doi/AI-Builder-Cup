import { describe, expect, it } from "vitest";

import { isActiveRunStatus, parseRunMode } from "@domain/index.js";

describe("run values", () => {
  it("uses autonomous mode for an unknown persisted value", () => {
    expect(parseRunMode("unknown")).toBe("autonomous");
  });

  it("reserves the active slot for queued, running, and child-waiting runs", () => {
    expect(isActiveRunStatus("queued")).toBe(true);
    expect(isActiveRunStatus("running")).toBe(true);
    expect(isActiveRunStatus("awaiting_children")).toBe(true);
    expect(isActiveRunStatus("awaiting_input")).toBe(false);
  });
});
