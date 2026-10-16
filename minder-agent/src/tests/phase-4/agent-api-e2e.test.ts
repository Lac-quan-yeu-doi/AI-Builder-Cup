import { once } from "node:events";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createFakeOpenAiServer } from "../infrastructure/http/fake-openai-server.js";

const databaseUrl = process.env.MINDER_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const terminalStatuses = new Set([
  "completed",
  "failed",
  "interrupted",
  "cancelled",
]);

interface JsonResponse {
  status: number;
  headers: Headers;
  body: Record<string, unknown>;
}

interface ServiceHandle {
  child: ChildProcess;
  baseUrl: string;
}

describeDatabase("compiled Minder Agent API E2E", () => {
  it("persists and recovers an authenticated run across service restart", async () => {
    const provider = await createFakeOpenAiServer();
    let service: ServiceHandle | undefined;
    let restarted: ServiceHandle | undefined;
    try {
      const assertion = createAssertionFixture();
      const providerUrl = await provider.listen();
      const port = await reserveLocalPort();
      const environment = serviceEnvironment(
        databaseUrl!,
        providerUrl,
        assertion.publicKeyPem,
      );
      service = await startService(environment, port);
      await waitForHealth(service.baseUrl, service.child, 10_000);

      const sessionKey = `e2e:${randomUUID()}`;
      const aliceToken = (): string =>
        assertion.token({
          subject: "alice",
          tenantId: "tenant-a",
          organizationId: "org-a",
          identityId: "identity-a",
          membershipId: "membership-a",
        });
      const admission = await fetchJson(`${service.baseUrl}/api/v1/turns`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${aliceToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ session_key: sessionKey, input: "e2e hello" }),
      });

      expect(admission.status).toBe(202);
      const runId = requireString(admission.body, "run_id");
      const sessionId = requireString(admission.body, "session_id");
      const eventsUrl = requireString(admission.body, "events_url");
      expect(eventsUrl).toBe(`/api/v1/runs/${runId}/events`);

      const events = await fetch(
        new URL(eventsUrl, service.baseUrl),
        withBearer(aliceToken()),
      );
      const eventBody = await events.text();
      expect(events.status).toBe(200);
      expect(events.headers.get("content-type")).toContain("text/event-stream");
      expect(eventBody).toContain('"type":"done"');

      const completed = await waitForTerminalStatus(
        `${service.baseUrl}/api/v1/runs/${runId}/status`,
        aliceToken,
        10_000,
      );
      if (completed.body.status !== "completed")
        throw new Error(`E2E run failed: ${JSON.stringify(completed.body)}`);
      expect(completed).toMatchObject({
        status: 200,
        body: {
          run_id: runId,
          session_id: sessionId,
          status: "completed",
          response_text: "final answer",
        },
      });
      expect(provider.requests).toContainEqual(
        expect.objectContaining({
          method: "POST",
          path: "/v1/chat/completions",
          headers: expect.objectContaining({
            authorization: "Bearer e2e-test-key",
          }),
        }),
      );

      await stopService(service.child);
      service = undefined;

      restarted = await startService(environment, await reserveLocalPort());
      await waitForHealth(restarted.baseUrl, restarted.child, 10_000);

      const recovered = await getJson(
        `${restarted.baseUrl}/api/v1/runs/${runId}/status`,
        aliceToken(),
      );
      expect(recovered).toMatchObject({
        status: 200,
        body: {
          run_id: runId,
          session_id: sessionId,
          status: "completed",
          response_text: "final answer",
        },
      });

      const recoveredSession = await getJson(
        `${restarted.baseUrl}/api/v1/sessions?key=${encodeURIComponent(sessionKey)}`,
        aliceToken(),
      );
      expect(recoveredSession).toMatchObject({
        status: 200,
        body: { id: sessionId, key: sessionKey },
      });

      const bobToken = (): string =>
        assertion.token({
          subject: "bob",
          tenantId: "tenant-b",
          organizationId: "org-b",
          identityId: "identity-b",
          membershipId: "membership-b",
        });
      const foreignRun = await getJson(
        `${restarted.baseUrl}/api/v1/runs/${runId}/status`,
        bobToken(),
      );
      const foreignSession = await getJson(
        `${restarted.baseUrl}/api/v1/sessions?key=${encodeURIComponent(sessionKey)}`,
        bobToken(),
      );
      expect(foreignRun).toMatchObject({
        status: 404,
        body: { error: "run_not_found" },
      });
      expect(foreignSession).toMatchObject({
        status: 404,
        body: { error: "session_not_found" },
      });
    } finally {
      if (restarted !== undefined) await stopService(restarted.child);
      if (service !== undefined) await stopService(service.child);
      await provider.close();
    }
  }, 30_000);
});

function serviceEnvironment(
  database: string,
  providerUrl: string,
  publicKeyPem: string,
): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    LLM_BASE_URL: `${providerUrl}/v1`,
    LLM_API_KEY: "e2e-test-key",
    LLM_MODEL: "e2e-test-model",
    DATABASE_URL: database,
    MINIO_ENDPOINT: `http://127.0.0.1:${process.env.MINDER_TEST_MINIO_PORT ?? "9001"}`,
    MINIO_ACCESS_KEY: "minder-test",
    MINIO_SECRET_KEY: "minder-test-password",
    MINIO_WORKSPACE_BUCKET: "minder-workspace",
    MINDER_AUTH_MODE: "core-assertion",
    MINDER_ASSERTION_ISSUER: "celesnity-core",
    MINDER_ASSERTION_AUDIENCE: "minder-agent",
    MINDER_ASSERTION_PUBLIC_KEYS_JSON: JSON.stringify({
      "core-test-2026": publicKeyPem,
    }),
    MINDER_ASSERTION_REPLAY_CACHE_CAPACITY: "1024",
  };
}

function createAssertionFixture(): {
  publicKeyPem: string;
  token(claims: AssertionClaims): string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey
    .export({ format: "pem", type: "spki" })
    .toString();
  return {
    publicKeyPem,
    token(claims) {
      const now = Math.floor(Date.now() / 1000);
      const header = encode({
        alg: "EdDSA",
        kid: "core-test-2026",
        typ: "MINDER-ASSERTION",
        v: 1,
      });
      const payload = encode({
        iss: "celesnity-core",
        aud: "minder-agent",
        sub: claims.subject,
        tenant_id: claims.tenantId,
        organization_id: claims.organizationId,
        identity_id: claims.identityId,
        membership_id: claims.membershipId,
        role: "ORG_OWNER",
        permissions: ["workspace:read", "workspace:write"],
        mfa_verified: true,
        visible_features: ["HOME"],
        auth_time: now,
        iat: now,
        nbf: now,
        exp: now + 45,
        jti: randomUUID(),
      });
      const signature = sign(
        null,
        Buffer.from(`${header}.${payload}`, "utf8"),
        privateKey,
      ).toString("base64url");
      return `${header}.${payload}.${signature}`;
    },
  };
}

interface AssertionClaims {
  subject: string;
  tenantId: string;
  organizationId: string;
  identityId: string;
  membershipId: string;
}

function encode(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

async function reserveLocalPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("test process did not receive a TCP port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function startService(
  environment: Record<string, string>,
  port: number,
): Promise<ServiceHandle> {
  const child = spawn(process.execPath, ["dist/bootstrap/http-main.js"], {
    cwd: process.cwd(),
    env: { ...environment, MINDER_SERVE_ADDR: `127.0.0.1:${port}` },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr?.on("data", () => undefined);
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

async function waitForHealth(
  baseUrl: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("Minder Agent exited before health became ready.");
    try {
      const response = await fetch(`${baseUrl}/api/v1/healthz`);
      if (
        response.status === 200 &&
        (await response.text()) === '{"status":"ok"}'
      )
        return;
    } catch {
      // The process is still starting.
    }
    await delay(100);
  }
  throw new Error("Minder Agent health check timed out.");
}

async function stopService(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const graceful = await Promise.race([exited.then(() => true), delay(5000)]);
  if (graceful === true) return;
  if (child.exitCode === null && child.signalCode === null) {
    const killed = once(child, "exit");
    child.kill("SIGKILL");
    await Promise.race([killed, delay(1000)]);
  }
}

async function fetchJson(
  url: string,
  init: RequestInit = {},
): Promise<JsonResponse> {
  const response = await fetch(url, init);
  const body = JSON.parse(await response.text()) as Record<string, unknown>;
  return { status: response.status, headers: response.headers, body };
}

async function getJson(url: string, token: string): Promise<JsonResponse> {
  return fetchJson(url, withBearer(token));
}

function withBearer(token: string): RequestInit {
  return { headers: { authorization: `Bearer ${token}` } };
}

async function waitForTerminalStatus(
  url: string,
  token: () => string,
  timeoutMs: number,
): Promise<JsonResponse> {
  const deadline = Date.now() + timeoutMs;
  let latest: JsonResponse | undefined;
  while (Date.now() < deadline) {
    latest = await getJson(url, token());
    const status = latest.body.status;
    if (typeof status === "string" && terminalStatuses.has(status))
      return latest;
    await delay(100);
  }
  throw new Error(
    `Run did not reach a terminal state: ${JSON.stringify(latest)}`,
  );
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Expected response field ${key}.`);
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
