import { sha256 } from "@infrastructure/crypto/sha256.js";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import type {
  ChatCompletionGateway,
  ModelStreamEvent,
} from "@infrastructure/ai";
import type { LlmConfig } from "@infrastructure/configuration";
import {
  CoreAssertionAuthenticator,
  InMemoryAssertionReplayCache,
} from "@infrastructure/auth";
import { organizationScopeKey, principalScopeKey } from "@domain/index.js";
import { InMemoryRunManager } from "@application/runtime";
import { describe, expect, it } from "vitest";
import { resolveOwner } from "../../../presentation/http/guards/authentication.js";
import { request, startTestServer } from "./harness.js";

const config: LlmConfig = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};

const now = 1_700_000_000;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey
  .export({ format: "pem", type: "spki" })
  .toString();

function gateway(events: readonly ModelStreamEvent[]): ChatCompletionGateway {
  return {
    async *stream() {
      yield* events;
    },
  };
}

function authenticator(): CoreAssertionAuthenticator {
  return new CoreAssertionAuthenticator({
    issuer: "celesnity-core",
    audience: "minder-agent",
    publicKeys: { "core-test-2026": publicKeyPem },
    replayCache: new InMemoryAssertionReplayCache(1_024),
    now: () => now,
  });
}

function assertion(claims: Record<string, unknown> = {}): string {
  const header = Buffer.from(
    JSON.stringify({
      alg: "EdDSA",
      kid: "core-test-2026",
      typ: "MINDER-ASSERTION",
      v: 1,
    }),
    "utf8",
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "celesnity-core",
      aud: "minder-agent",
      sub: "alice",
      tenant_id: "tenant-a",
      organization_id: "org-a",
      identity_id: "identity-a",
      membership_id: "membership-a",
      role: "ORG_OWNER",
      permissions: ["workspace:read", "workspace:write"],
      mfa_verified: true,
      visible_features: ["HOME"],
      auth_time: now - 10,
      iat: now,
      nbf: now,
      exp: now + 60,
      jti: randomUUID(),
      ...claims,
    }),
    "utf8",
  ).toString("base64url");
  const signature = sign(
    null,
    Buffer.from(`${header}.${payload}`, "utf8"),
    privateKey,
  ).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

async function waitForStatus(
  server: Awaited<ReturnType<typeof startTestServer>>,
  runId: string,
  status: string,
  token: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request(server, `/api/v1/runs/${runId}/status`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if ((JSON.parse(response.body) as { status: string }).status === status)
      return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`run did not reach ${status}`);
}

describe("Core assertion authenticated runs", () => {
  it("rejects signed assertions without grants and denies privileged operations before resource lookup", async () => {
    const server = await startTestServer({
      authOptions: { authenticator: authenticator() },
    });
    try {
      for (const permissions of [undefined, []]) {
        const response = await request(server, "/api/v1/catalog", {
          headers: { authorization: `Bearer ${assertion({ permissions })}` },
        });
        expect(response.status).toBe(403);
      }
      const denied = await request(server, "/api/v1/skills", {
        method: "POST",
        headers: {
          authorization: `Bearer ${assertion({ permissions: ["workspace:read"], visible_features: ["ADMINISTRATION"] })}`,
        },
        body: {},
      });
      expect(denied.status).toBe(403);
    } finally {
      await server.close();
    }
  });
  it("authenticates catalog access and rejects forged headers and replay", async () => {
    const server = await startTestServer({
      authOptions: { authenticator: authenticator() },
    });
    try {
      for (const headers of [
        {},
        { "x-caller-id": "alice" },
        { authorization: "Bearer invalid", "x-caller-id": "alice" },
      ]) {
        expect(
          (await request(server, "/api/v1/catalog", { headers })).status,
        ).toBe(401);
      }
      const token = assertion();
      expect(
        (
          await request(server, "/api/v1/catalog", {
            headers: { authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(server, "/api/v1/catalog", {
            headers: { authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(401);
      for (const claims of [
        { aud: "other-service" },
        { iss: "other-issuer" },
        { exp: now - 1 },
      ]) {
        expect(
          (
            await request(server, "/api/v1/catalog", {
              headers: { authorization: `Bearer ${assertion(claims)}` },
            })
          ).status,
        ).toBe(401);
      }
    } finally {
      await server.close();
    }
  });
  it("resolves separate resource and organization manifest owners", async () => {
    const token = assertion();
    const resolution = await resolveOwner(
      {
        method: "GET",
        url: "/catalog",
        headers: { authorization: `Bearer ${token}` },
      },
      { authenticator: authenticator() },
    );

    expect(resolution).toMatchObject({
      kind: "ok",
      owner: principalScopeKey({
        identityTenantId: "tenant-a",
        organizationId: "org-a",
        identityId: "identity-a",
      }),
      resourceOwner: principalScopeKey({
        identityTenantId: "tenant-a",
        organizationId: "org-a",
        identityId: "identity-a",
      }),
      manifestOwner: organizationScopeKey({
        identityTenantId: "tenant-a",
        organizationId: "org-a",
      }),
      identityTenantId: "tenant-a",
      organizationId: "org-a",
      identityId: "identity-a",
      role: "ORG_OWNER",
    });
  });

  it("keeps caller fallback out of the organization manifest namespace", async () => {
    const resolution = await resolveOwner({
      headers: { "x-caller-id": "legacy-user" },
    });

    expect(resolution).toMatchObject({
      kind: "ok",
      owner: "legacy-user",
      resourceOwner: "legacy-user",
      callerSubject: "legacy-user",
    });
    expect(
      resolution.kind === "ok" ? resolution.manifestOwner : "unexpected",
    ).toBe(undefined);
  });

  it("rejects an assertion that omits its organization claim", async () => {
    const resolution = await resolveOwner(
      {
        headers: {
          authorization: `Bearer ${assertion({ organization_id: undefined })}`,
        },
      },
      { authenticator: authenticator() },
    );

    expect(resolution).toEqual({ kind: "unauthenticated" });
  });

  it("authenticates a Core assertion and scopes the run to its principal", async () => {
    const manager = new InMemoryRunManager({
      sha256,
      config,
      gateway: gateway([{ type: "text", text: "hello" }]),
    });
    const server = await startTestServer(manager, undefined, {
      authenticator: authenticator(),
    });
    try {
      const token = assertion();
      const started = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: { session_key: "chat:one", input: "hello" },
      });
      expect(started.status).toBe(202);
      const runId = (JSON.parse(started.body) as { run_id: string }).run_id;
      await waitForStatus(server, runId, "completed", assertion());

      // A different organization for the same identity is a foreign scope.
      const foreign = await request(server, `/api/v1/runs/${runId}/status`, {
        headers: {
          authorization: `Bearer ${assertion({ organization_id: "org-b" })}`,
        },
      });
      expect(foreign.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("rejects a spoofed x-caller-id when Core assertions are required", async () => {
    const manager = new InMemoryRunManager({
      sha256,
      config,
      gateway: gateway([]),
    });
    const server = await startTestServer(manager, undefined, {
      authenticator: authenticator(),
    });
    try {
      const spoofed = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "platform-admin" },
        body: { session_key: "chat:x", input: "hello" },
      });
      expect(spoofed.status).toBe(401);

      const tampered = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { authorization: "Bearer not.a.valid.assertion" },
        body: { session_key: "chat:x", input: "hello" },
      });
      expect(tampered.status).toBe(401);
    } finally {
      await server.close();
    }
  });
});
