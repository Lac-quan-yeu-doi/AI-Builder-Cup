import { describe, expect, it } from "vitest";
import {
  createApprovalService,
  createMemoryApprovalStore,
} from "@application/runtime";

describe("approval service", () => {
  it("keeps approval decisions owner-scoped and idempotent", async () => {
    const approvals = createApprovalService({
      store: createMemoryApprovalStore(),
      ids: () => "approval-1",
      now: () => "2026-09-15T00:00:00.000Z",
    });
    const created = await approvals.request({
      owner: "alice",
      runId: "run-1",
      toolCallId: "call-1",
      action: "Write",
      argumentsHash: "sha256:arguments",
      preview: "Write report.md",
      expiresAt: "2026-09-15T00:10:00.000Z",
    });

    await expect(
      approvals.list({ owner: "bob", runId: "run-1" }),
    ).resolves.toEqual([]);
    await expect(
      approvals.decide({
        owner: "bob",
        runId: "run-1",
        approvalId: created.id,
        decision: "approved",
      }),
    ).resolves.toBeUndefined();

    const decided = await approvals.decide({
      owner: "alice",
      runId: "run-1",
      approvalId: created.id,
      decision: "approved",
    });
    expect(decided).toMatchObject({
      status: "approved",
      decidedAt: "2026-09-15T00:00:00.000Z",
    });
    await expect(
      approvals.decide({
        owner: "alice",
        runId: "run-1",
        approvalId: created.id,
        decision: "approved",
      }),
    ).resolves.toMatchObject({ status: "approved" });
  });
});
