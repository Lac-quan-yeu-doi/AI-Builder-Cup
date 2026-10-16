import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { OwnerAuthGuard } from "../../../presentation/http/common/auth/owner-auth.guard.js";

function contextFor(request: {
  headers: Record<string, string>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe("OwnerAuthGuard", () => {
  it("stores a resolved owner for an authenticated request", async () => {
    const request = { headers: { "x-caller-id": "owner-a" } };
    const guard = new OwnerAuthGuard();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request).toHaveProperty("ownerContext.owner", "owner-a");
  });

  it("preserves the missing caller response for an unauthenticated request", async () => {
    const guard = new OwnerAuthGuard();

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toMatchObject({
      response: { error: "missing_caller_id" },
      status: 401,
    });
  });
});
