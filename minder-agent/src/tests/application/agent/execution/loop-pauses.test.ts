import { describe, expect, it } from "vitest";
import { pauseMessage } from "@application/agent/execution/loop-pauses.js";

describe("loop pause messages", () => {
  it("describes an approval pause", () => {
    expect(
      pauseMessage(
        { id: "call-1", name: "Bash", arguments: {} },
        {
          kind: "approval",
          request: {
            approvalId: "approval-1",
            toolCallId: "call-1",
            action: "Bash",
            argumentsHash: "hash",
            preview: "run",
            expiresAt: "2026-09-21T00:00:00.000Z",
          },
        },
      ),
    ).toContain("approval requested");
  });
});
