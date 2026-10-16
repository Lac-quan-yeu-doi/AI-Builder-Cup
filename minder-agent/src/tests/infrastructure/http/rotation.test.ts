import { describe, expect, it } from "vitest";
import { CredentialRotation } from "@infrastructure/http/index.js";

describe("CredentialRotation", () => {
  it("rotates to the next credential after a failure and never logs secrets", async () => {
    const rotation = new CredentialRotation(["key-a", "key-b"], {
      cooldownMs: 0,
      now: () => 0,
    });
    const used: string[] = [];
    await expect(
      rotation.withCredential(async (credential) => {
        used.push(credential);
        throw new Error("provider down");
      }),
    ).rejects.toThrow("provider down");
    const second = await rotation.withCredential(async (credential) => {
      used.push(credential);
      return "ok";
    });
    expect(second).toBe("ok");
    expect(used).toEqual(["key-a", "key-b"]);
  });

  it("requires at least one credential", () => {
    expect(() => new CredentialRotation([], { cooldownMs: 0 })).toThrow(
      "credential",
    );
  });
});
