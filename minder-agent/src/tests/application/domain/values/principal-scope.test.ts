import { describe, expect, it } from "vitest";

import {
  createPrincipalScope,
  organizationScopeKey,
  principalScopeKey,
} from "@domain/index.js";

describe("principal scope", () => {
  it("creates a stable storage key that separates tenant, organization, and identity", () => {
    const first = createPrincipalScope({
      identityTenantId: "tenant-a",
      organizationId: "org-a",
      identityId: "alice",
    });
    const otherOrganization = createPrincipalScope({
      identityTenantId: "tenant-a",
      organizationId: "org-b",
      identityId: "alice",
    });

    expect(principalScopeKey(first)).toBe("dGVuYW50LWE.b3JnLWE.YWxpY2U");
    expect(principalScopeKey(first)).not.toBe(
      principalScopeKey(otherOrganization),
    );
  });

  it.each([
    ["identityTenantId", "", "org-a", "alice"],
    ["organizationId", "tenant-a", "", "alice"],
    ["identityId", "tenant-a", "org-a", "x".repeat(129)],
  ])(
    "rejects an invalid %s storage component",
    (_name, identityTenantId, organizationId, identityId) => {
      expect(() =>
        createPrincipalScope({
          identityTenantId,
          organizationId,
          identityId,
        }),
      ).toThrow(_name);
    },
  );

  it("shares the manifest scope across identities in one organization", () => {
    expect(
      organizationScopeKey({
        identityTenantId: "tenant-a",
        organizationId: "org-a",
      }),
    ).toBe(
      organizationScopeKey({
        identityTenantId: "tenant-a",
        organizationId: "org-a",
      }),
    );
  });

  it("does not include identity identity in the manifest scope", () => {
    const scope = organizationScopeKey({
      identityTenantId: "tenant-a",
      organizationId: "org-a",
    });

    expect(scope).toBe("dGVuYW50LWE.b3JnLWE");
  });

  it.each([
    ["different organization", "tenant-a", "org-b"],
    ["different tenant", "tenant-b", "org-a"],
  ])("separates %s manifest scopes", (_label, tenant, organization) => {
    expect(
      organizationScopeKey({
        identityTenantId: "tenant-a",
        organizationId: "org-a",
      }),
    ).not.toBe(
      organizationScopeKey({
        identityTenantId: tenant,
        organizationId: organization,
      }),
    );
  });

  it("keeps component boundaries unambiguous", () => {
    const first = organizationScopeKey({
      identityTenantId: "tenant.a",
      organizationId: "org/b",
    });
    const second = organizationScopeKey({
      identityTenantId: "tenant",
      organizationId: "a.org/b",
    });

    expect(first).not.toBe(second);
    expect(first).not.toContain("/");
    expect(second).not.toContain("/");
  });
});
