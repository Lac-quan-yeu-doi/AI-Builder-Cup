import { describe, expect, it } from "vitest";
import {
  createMemoryTenantSecretStore,
  createTenantSecretResolver,
} from "@application/reliability";

describe("tenant secret resolver", () => {
  it("resolves a secret only for its owner and supplies a redactor without exposing it", async () => {
    const store = createMemoryTenantSecretStore({
      alice: { "webhook-signing": "alice-secret" },
      bob: { "webhook-signing": "bob-secret" },
    });
    const resolver = createTenantSecretResolver({ store });

    await expect(
      resolver.resolve({ owner: "alice", secretRef: "webhook-signing" }),
    ).resolves.toBe("alice-secret");
    await expect(
      resolver.resolve({ owner: "alice", secretRef: "missing" }),
    ).resolves.toBeUndefined();
    const redactor = await resolver.redactor({
      owner: "alice",
      secretRefs: ["webhook-signing"],
    });
    expect(redactor.redact("secret=alice-secret")).toBe("secret=[REDACTED]");
    expect(redactor.redact("secret=bob-secret")).toBe("secret=[REDACTED]");
  });
});
