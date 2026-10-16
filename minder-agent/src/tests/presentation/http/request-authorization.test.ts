import { describe, expect, it } from "vitest";
import { createAuthenticatedPrincipal } from "@infrastructure/auth";
import { agentRequestAllowed } from "@presentation/http/common/auth/request-authorization.js";

function principal(
  permissions: readonly string[],
  visibleFeatures:
    | readonly ("HOME" | "ADMINISTRATION" | "ANALYTICS" | "AUTOMATIONS")[]
    | null = null,
) {
  return createAuthenticatedPrincipal({
    subject: "user",
    identityTenantId: "tenant-a",
    organizationId: "org-a",
    identityId: "identity-a",
    membershipId: "membership-a",
    role: "PLATFORM_ADMIN",
    mfaVerified: true,
    authenticationTime: 1,
    permissions,
    visibleFeatures,
  });
}

describe("Agent enforcement of Core grants", () => {
  it("never expands an admin role into permissions", () => {
    expect(agentRequestAllowed(principal([]), "GET", "/catalog")).toBe(false);
    expect(
      agentRequestAllowed(principal(["workspace:read"]), "POST", "/skills"),
    ).toBe(false);
  });
  it("requires both operation permission and feature access", () => {
    expect(
      agentRequestAllowed(
        principal(["workspace:write"], ["HOME"]),
        "POST",
        "/skills",
      ),
    ).toBe(false);
    expect(
      agentRequestAllowed(
        principal(["workspace:write"], ["ADMINISTRATION"]),
        "POST",
        "/skills",
      ),
    ).toBe(true);
  });
  it("preserves read-only chat access but does not grant configuration or webhook writes", () => {
    const viewer = principal(["workspace:read"], ["HOME"]);
    expect(agentRequestAllowed(viewer, "POST", "/rooms")).toBe(true);
    expect(agentRequestAllowed(viewer, "POST", "/rooms/room-a/runs")).toBe(
      true,
    );
    expect(agentRequestAllowed(viewer, "POST", "/agents")).toBe(false);
    expect(agentRequestAllowed(viewer, "POST", "/rooms/room-a/webhooks")).toBe(
      false,
    );
  });
  it("keeps v2 run admission HOME-only while allowing Analytics status and event reads", () => {
    const analyst = principal(["workspace:read"], ["ANALYTICS"]);

    expect(agentRequestAllowed(analyst, "POST", "/api/v2/runs")).toBe(false);
    expect(
      agentRequestAllowed(analyst, "GET", "/api/v2/runs/run-1/status"),
    ).toBe(true);
    expect(
      agentRequestAllowed(analyst, "GET", "/api/v2/runs/run-1/events"),
    ).toBe(true);
  });
  it("allows automation workers to read run status and events", () => {
    const automation = principal(["workspace:read"], ["AUTOMATIONS"]);

    expect(
      agentRequestAllowed(automation, "GET", "/api/v2/runs/run-1/status"),
    ).toBe(true);
    expect(
      agentRequestAllowed(automation, "GET", "/api/v2/runs/run-1/events"),
    ).toBe(true);
  });
  it("restricts v2 run events to GET and granted principals", () => {
    const homeReader = principal(["workspace:read"], ["HOME"]);
    const automationWriter = principal(["workspace:write"], ["AUTOMATIONS"]);
    const ungrantedReader = principal(["workspace:read"], ["ADMINISTRATION"]);

    expect(
      agentRequestAllowed(homeReader, "POST", "/api/v2/runs/run-1/events"),
    ).toBe(false);
    expect(
      agentRequestAllowed(automationWriter, "GET", "/api/v2/runs/run-1/events"),
    ).toBe(false);
    expect(
      agentRequestAllowed(ungrantedReader, "GET", "/api/v2/runs/run-1/events"),
    ).toBe(false);
  });
  it("allows automation workers to read only run-file listings and contents", () => {
    const automation = principal(["workspace:read"], ["AUTOMATIONS"]);

    expect(
      agentRequestAllowed(automation, "GET", "/api/v2/runs/run-1/files"),
    ).toBe(true);
    expect(
      agentRequestAllowed(
        automation,
        "GET",
        "/api/v2/runs/run-1/files/content",
      ),
    ).toBe(true);
    expect(
      agentRequestAllowed(
        automation,
        "POST",
        "/api/v2/runs/run-1/files/content",
      ),
    ).toBe(false);
  });
  it("denies unregistered route families", () => {
    expect(
      agentRequestAllowed(
        principal(["workspace:read", "workspace:write"]),
        "GET",
        "/new-admin-endpoint",
      ),
    ).toBe(false);
  });
});
