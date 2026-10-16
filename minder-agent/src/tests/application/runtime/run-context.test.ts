import { describe, expect, it } from "vitest";

import { parseRunContext } from "@domain/runtime/run-context.js";

describe("parseRunContext", () => {
  it("preserves trusted automation run and organization identifiers", () => {
    expect(
      parseRunContext({
        kind: "automation-workflow",
        workflow_id: "workflow-1",
        workflow_run_id: "workflow-run-1",
        workflow_step_id: "step-1",
        organization_id: "organization-1",
      }),
    ).toEqual({
      kind: "automation-workflow",
      workflowId: "workflow-1",
      workflowRunId: "workflow-run-1",
      workflowStepId: "step-1",
      organizationId: "organization-1",
    });
  });
});
