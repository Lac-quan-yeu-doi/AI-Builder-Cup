import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { AssertionAuthenticationError } from "@infrastructure/auth/index.js";
import {
  CoreAssertionAuthenticator,
  InMemoryAssertionReplayCache,
} from "@infrastructure/auth/index.js";

const now = 1_700_000_000;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey
  .export({ format: "pem", type: "spki" })
  .toString();

describe("CoreAssertionAuthenticator", () => {
  it("returns an immutable principal from a valid Core assertion only once", async () => {
    const authenticator = createAuthenticator();
    const token = coreAssertion({
      jti: "50000000-0000-4000-8000-000000000001",
    });

    const principal = await authenticator.authenticate(bearer(token));

    expect(principal).toMatchObject({
      subject: "alice",
      scope: {
        identityTenantId: "tenant-a",
        organizationId: "org-a",
        identityId: "identity-a",
      },
      membershipId: "membership-a",
      authenticationMethod: "core_assertion",
    });
    expect(Object.isFrozen(principal)).toBe(true);
    await expect(
      authenticator.authenticate(bearer(token)),
    ).rejects.toMatchObject({
      code: "assertion_replayed",
    } satisfies Partial<AssertionAuthenticationError>);
  });

  it.each([
    ["wrong issuer", { iss: "not-core" }, {}],
    ["wrong audience", { aud: "somewhere-else" }, {}],
    ["expired", { exp: now - 1 }, {}],
    ["future not-before", { nbf: now + 1 }, {}],
    ["unknown key", {}, { kid: "unknown-key" }],
  ])(
    "rejects a %s assertion without trusting x-caller-id",
    async (_label, claims, header) => {
      const authenticator = createAuthenticator();
      const token = coreAssertion(claims, header);

      await expect(
        authenticator.authenticate({
          ...bearer(token),
          "x-caller-id": "platform-admin",
        }),
      ).rejects.toMatchObject({
        code: "unauthenticated",
      } satisfies Partial<AssertionAuthenticationError>);
    },
  );

  it("rejects a token with a modified signed payload", async () => {
    const authenticator = createAuthenticator();
    const token = coreAssertion({ jti: randomUUID() });
    const [header = "", payload = "", signature = ""] = token.split(".");
    const alteredPayload = Buffer.from(
      JSON.stringify({ ...decode(payload), organization_id: "other-org" }),
      "utf8",
    ).toString("base64url");

    await expect(
      authenticator.authenticate(
        bearer(`${header}.${alteredPayload}.${signature}`),
      ),
    ).rejects.toMatchObject({
      code: "unauthenticated",
    } satisfies Partial<AssertionAuthenticationError>);
  });
});

function createAuthenticator(): CoreAssertionAuthenticator {
  return new CoreAssertionAuthenticator({
    issuer: "celesnity-core",
    audience: "minder-agent",
    publicKeys: { "core-test-2026": publicKeyPem },
    replayCache: new InMemoryAssertionReplayCache(1_024),
    now: () => now,
  });
}

function bearer(token: string): Readonly<Record<string, string>> {
  return { authorization: `Bearer ${token}` };
}

function coreAssertion(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): string {
  const encodedHeader = encode({
    alg: "EdDSA",
    kid: "core-test-2026",
    typ: "MINDER-ASSERTION",
    v: 1,
    ...header,
  });
  const encodedPayload = encode({
    iss: "celesnity-core",
    aud: "minder-agent",
    sub: "alice",
    tenant_id: "tenant-a",
    organization_id: "org-a",
    identity_id: "identity-a",
    membership_id: "membership-a",
    role: "ORG_OWNER",
    mfa_verified: true,
    visible_features: ["HOME"],
    auth_time: now - 10,
    iat: now,
    nbf: now,
    exp: now + 60,
    jti: randomUUID(),
    ...claims,
  });
  const signature = sign(
    null,
    Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"),
    privateKey,
  ).toString("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function encode(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}
