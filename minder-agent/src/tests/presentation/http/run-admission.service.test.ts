import { describe, expect, it, vi } from "vitest";
import type { RunManager } from "@application/runtime";
import type { OwnerContext } from "@presentation/http/common/auth/owner-context.js";
import { RunAdmissionService } from "@presentation/http/runs/run-admission.service.js";

const owner = {
  owner: "alice",
  organizationId: "trusted-org",
} as OwnerContext;

function service() {
  const start = vi.fn().mockResolvedValue({ kind: "duplicate_delivery" });
  return {
    admission: new RunAdmissionService({ start } as unknown as RunManager),
    start,
  };
}

describe("RunAdmissionService", () => {
  it("passes authenticated chat identity and request ID to the runtime once", async () => {
    const { admission, start } = service();
    await admission.start({
      key: "chat:one",
      input: "hello",
      owner,
      mode: "interactive",
      trigger: { source: "chat" },
      requestId: "frontend-request-1",
      manifestName: "writer",
      manifestOwner: "trusted-manifest-owner",
      context: {
        kind: "automation-workflow",
        organizationId: "attacker-org",
      },
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "chat:one",
        owner: "alice",
        mode: "interactive",
        trigger: { source: "chat" },
        requestId: "frontend-request-1",
        manifestName: "writer",
        manifestOwner: "trusted-manifest-owner",
        context: {
          kind: "automation-workflow",
          organizationId: "trusted-org",
        },
      }),
    );
  });

  it("passes webhook delivery and verified automation delegation", async () => {
    const { admission, start } = service();
    await admission.start({
      runId: "40000000-0000-4000-8000-000000000001",
      key: "workflow:one",
      input: "run",
      owner,
      mode: "autonomous",
      trigger: {
        source: "webhook:automation-workflow",
        deliveryId: "delivery-1",
      },
      requestId: "frontend-request-2",
      delegation: {
        automationRunId: "40000000-0000-4000-8000-000000000001",
        automationOrganizationId: "trusted-org",
      },
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "alice",
        mode: "autonomous",
        trigger: {
          source: "webhook:automation-workflow",
          deliveryId: "delivery-1",
        },
        requestId: "frontend-request-2",
        delegation: {
          automationRunId: "40000000-0000-4000-8000-000000000001",
          automationOrganizationId: "trusted-org",
        },
      }),
    );
  });

  it("passes a client tool result through once", async () => {
    const { admission, start } = service();
    await admission.start({
      key: "chat:one",
      input: "Client tool completed. Continue the task.",
      owner,
      mode: "interactive",
      trigger: { source: "client_tool" },
      requestId: "frontend-request-3",
      clientToolResult: { id: "call-1", content: "done", isError: false },
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "alice",
        trigger: { source: "client_tool" },
        requestId: "frontend-request-3",
        clientToolResult: { id: "call-1", content: "done", isError: false },
      }),
    );
  });

  it("passes room delegation and request ID through once", async () => {
    const { admission, start } = service();
    await admission.start({
      key: "room:one:agent:writer",
      input: "hello",
      owner,
      mode: "interactive",
      trigger: { source: "room" },
      requestId: "frontend-request-4",
      manifestName: "writer",
      delegation: { roomId: "one", callerSubject: "alice" },
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "room:one:agent:writer",
        owner: "alice",
        trigger: { source: "room" },
        requestId: "frontend-request-4",
        delegation: { roomId: "one", callerSubject: "alice" },
      }),
    );
  });
});
