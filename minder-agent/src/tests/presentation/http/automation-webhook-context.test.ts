import { describe, expect, it, vi } from "vitest";
import { TurnsNestController } from "@presentation/http/runs/turns.controller.js";
import { RunAdmissionService } from "@presentation/http/runs/run-admission.service.js";
import type { RunManager } from "@application/runtime";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";

describe("automation webhook context", () => {
  it("passes validated context and the verified service run to runtime admission", async () => {
    const start = vi.fn().mockResolvedValue({
      kind: "started",
      run: { id: "run-1" },
      session: { id: "session-1" },
    });
    const runtime = { start } as unknown as RunManager;
    const controller = new TurnsNestController(
      runtime,
      new RunAdmissionService(runtime),
    );
    const response = { statusCode: 202, setHeader: vi.fn() };
    const runId = "40000000-0000-4000-8000-000000000001";
    await controller.webhook(
      {
        owner: "owner-1",
        role: "SERVICE_ACCOUNT",
        organizationId: "organization-1",
      } as OwnerContext,
      undefined,
      "automation-workflow",
      {
        session_key: "workflow:one",
        input: "run",
        run_id: runId,
        automation_context: {
          kind: "automation-workflow",
          workflow_id: "workflow-1",
          organization_id: "attacker-organization",
        },
      },
      response,
    );
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        runId,
        context: {
          kind: "automation-workflow",
          workflowId: "workflow-1",
          organizationId: "organization-1",
        },
        delegation: {
          automationRunId: runId,
          automationOrganizationId: "organization-1",
        },
      }),
    );
  });
});
