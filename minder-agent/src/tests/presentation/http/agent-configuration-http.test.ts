import { describe, expect, it } from "vitest";
import { createMemoryAgentConfigurationStore } from "@infrastructure/agent";
import { sha256 } from "@infrastructure/crypto/sha256.js";
import { createAuthenticatedPrincipal } from "@infrastructure/auth";
import { request, startTestServer } from "./harness.js";

describe("agent configuration HTTP routes", () => {
  it("does not accept a caller header when Core assertion authentication is configured", async () => {
    const server = await startTestServer({
      agentStore: createMemoryAgentConfigurationStore(sha256),
      authOptions: {
        authenticator: {
          async authenticate() {
            return createAuthenticatedPrincipal({
              subject: "alice",
              identityTenantId: "tenant-a",
              organizationId: "org-a",
              identityId: "identity-a",
              membershipId: "membership-a",
              role: "ORG_OWNER",
              visibleFeatures: null,
              mfaVerified: true,
              authenticationTime: 1,
            });
          },
        },
      },
    });
    try {
      const response = await request(server, "/api/v1/agents", {
        method: "POST",
        headers: { "x-caller-id": "platform-admin" },
        body: {
          executionStrategy: "react",
          id: "reviewer",
          name: "reviewer",
          skills: [],
          toolAllowlist: [],
        },
      });
      expect(response.status).toBe(401);
    } finally {
      await server.close();
    }
  });

  it("manages owner-scoped agents without a model runtime", async () => {
    const server = await startTestServer(
      undefined,
      createMemoryAgentConfigurationStore(sha256),
    );
    try {
      const created = await request(server, "/api/v1/agents", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          executionStrategy: "react",
          id: "reviewer",
          name: "reviewer",
          skills: [],
          toolAllowlist: [],
        },
      });
      expect(created.status).toBe(201);
      expect(JSON.parse(created.body)).toMatchObject({
        id: "reviewer",
        version: 1,
      });
      expect(
        (
          await request(server, "/api/v1/agents/reviewer", {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(server, "/api/v1/agents/reviewer", {
            headers: { "x-caller-id": "alice" },
          })
        ).status,
      ).toBe(200);
    } finally {
      await server.close();
    }
  });

  it("does not turn an agent store failure into a client error", async () => {
    const store = createMemoryAgentConfigurationStore(sha256);
    const failingStore = {
      ...store,
      async create() {
        throw new Error("database unavailable");
      },
    };
    const server = await startTestServer(undefined, failingStore);
    try {
      const response = await request(server, "/api/v1/agents", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          executionStrategy: "react",
          id: "reviewer",
          name: "reviewer",
          skills: [],
          toolAllowlist: [],
        },
      });
      expect(response.status).toBe(500);
      expect(JSON.parse(response.body)).toMatchObject({
        error: "internal_error",
      });
    } finally {
      await server.close();
    }
  });

  it("serves owner-scoped history, diff, rollback, and archive without a model runtime", async () => {
    const server = await startTestServer(
      undefined,
      createMemoryAgentConfigurationStore(sha256),
    );
    try {
      const headers = { "x-caller-id": "alice" };
      await request(server, "/api/v1/agents", {
        method: "POST",
        headers,
        body: {
          executionStrategy: "react",
          id: "reviewer",
          name: "reviewer",
          skills: [],
          toolAllowlist: [],
        },
      });
      await request(server, "/api/v1/agents/reviewer", {
        method: "PATCH",
        headers,
        body: { displayName: "Reviewer" },
      });

      const history = await request(server, "/api/v1/agents/reviewer/history", {
        headers,
      });
      expect(history.status).toBe(200);
      expect(JSON.parse(history.body)).toHaveLength(2);

      const diff = await request(
        server,
        "/api/v1/agents/reviewer/diff?from=1&to=2",
        {
          headers,
        },
      );
      expect(diff.status).toBe(200);
      expect(JSON.parse(diff.body)).toContainEqual(
        expect.objectContaining({ path: "displayName" }),
      );

      const rollback = await request(
        server,
        "/api/v1/agents/reviewer/rollback",
        {
          method: "POST",
          headers,
          body: { version: 1 },
        },
      );
      expect(rollback.status).toBe(200);
      expect(JSON.parse(rollback.body)).not.toHaveProperty("displayName");

      const archive = await request(server, "/api/v1/agents/reviewer/archive", {
        method: "POST",
        headers,
      });
      expect(archive.status).toBe(200);
      const list = await request(server, "/api/v1/agents", { headers });
      expect(JSON.parse(list.body)).toEqual([]);

      // Foreign callers cannot observe another owner's revisions.
      expect(
        (
          await request(server, "/api/v1/agents/reviewer/history", {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
    } finally {
      await server.close();
    }
  });
});
