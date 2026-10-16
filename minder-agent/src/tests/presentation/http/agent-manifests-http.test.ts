import { describe, expect, it } from "vitest";
import { createManifestLoader } from "@infrastructure/agent";
import { request, startTestServer } from "./harness.js";

const yaml = `
name: writer
description: Writes reports.
system_prompt: You write concise reports.
tools:
  mode: allowlist
  names: [Read, Write]
execution:
  mode: interactive
  max_iterations: 8
`;

function memoryManifests() {
  const files = new Map<string, string>();
  return createManifestLoader({
    workspace: {
      async list(owner: string, prefix: string) {
        return [...files.keys()]
          .filter((key) => key.startsWith(`${owner}:`))
          .map((key) => key.slice(owner.length + 1))
          .filter((path) => path.startsWith(prefix));
      },
      async read(owner: string, path: string) {
        return files.get(`${owner}:${path}`);
      },
      async write(owner: string, path: string, content: string) {
        files.set(`${owner}:${path}`, content);
      },
      async remove(owner: string, path: string) {
        files.delete(`${owner}:${path}`);
      },
    },
  });
}

describe("agent manifest HTTP routes", () => {
  it("shares reads across organization members and restricts mutations to admins", async () => {
    const authenticator = {
      async authenticate(headers: Record<string, string>) {
        const token = headers.authorization?.replace("Bearer ", "");
        const [subject, organizationId, role] = token?.split(":") ?? [];
        return {
          subject,
          scope: {
            identityTenantId: "tenant-a",
            organizationId,
            identityId: subject,
          },
          membershipId: `${subject}-membership`,
          role,
          permissions:
            role === "ORG_OWNER" || role === "ORG_ADMIN"
              ? ["workspace:read", "workspace:write"]
              : ["workspace:read"],
          visibleFeatures:
            role === "ORG_OWNER" || role === "ORG_ADMIN" ? null : ["HOME"],
          mfaVerified: true,
          authenticationTime: 0,
          authenticationMethod: "core_assertion",
        } as never;
      },
    };
    const server = await startTestServer({
      manifestLoader: memoryManifests(),
      authOptions: { authenticator },
    });
    const owner = { authorization: "Bearer alice:org-a:ORG_OWNER" };
    const admin = { authorization: "Bearer bob:org-a:ORG_ADMIN" };
    const member = { authorization: "Bearer bob:org-a:VIEWER" };
    const foreign = { authorization: "Bearer eve:org-b:ORG_OWNER" };
    try {
      expect(
        (
          await request(server, "/api/v1/agent-manifests/writer", {
            method: "PUT",
            headers: owner,
            body: { yaml },
          })
        ).status,
      ).toBe(201);

      expect(
        (
          await request(server, "/api/v1/agent-manifests", {
            headers: member,
          })
        ).body,
      ).toContain('"name":"writer"');
      expect(
        (
          await request(server, "/api/v1/agent-manifests/writer", {
            headers: foreign,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(server, "/api/v1/agent-manifests/writer", {
            method: "PUT",
            headers: member,
            body: { yaml },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(server, "/api/v1/agent-manifests/writer", {
            method: "PUT",
            headers: admin,
            body: { yaml },
          })
        ).status,
      ).toBe(201);
    } finally {
      await server.close();
    }
  });

  it("manages manifests inside the authenticated owner's S3-backed boundary", async () => {
    const server = await startTestServer({ manifestLoader: memoryManifests() });
    const alice = { "x-caller-id": "alice" };
    try {
      const created = await request(server, "/api/v1/agent-manifests/writer", {
        method: "PUT",
        headers: alice,
        body: { yaml },
      });
      expect(created.status).toBe(201);
      expect(JSON.parse(created.body)).toMatchObject({ name: "writer", yaml });

      const listed = await request(server, "/api/v1/agent-manifests", {
        headers: alice,
      });
      expect(listed.status).toBe(200);
      expect(JSON.parse(listed.body)).toEqual([
        expect.objectContaining({
          name: "writer",
          system_prompt: "You write concise reports.",
        }),
      ]);

      expect(
        (
          await request(server, "/api/v1/agent-manifests/writer", {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);

      const validation = await request(
        server,
        "/api/v1/agent-manifests/validate",
        {
          method: "POST",
          headers: alice,
          body: { yaml },
        },
      );
      expect(validation.status).toBe(200);
      expect(JSON.parse(validation.body)).toMatchObject({
        valid: true,
        name: "writer",
        yaml,
      });

      const legacyUpdate = await request(
        server,
        "/api/v1/agent-manifests/writer",
        {
          method: "PUT",
          headers: alice,
          body: {
            name: "writer",
            description: "Updated from the structured editor.",
            system_prompt: "Write reports.",
            tools: { mode: "allowlist", names: [] },
            execution: { mode: "interactive", max_iterations: 4 },
          },
        },
      );
      expect(legacyUpdate.status).toBe(201);
      expect(JSON.parse(legacyUpdate.body)).toMatchObject({ name: "writer" });

      expect(
        (
          await request(server, "/api/v1/agent-manifests/writer", {
            method: "DELETE",
            headers: alice,
          })
        ).status,
      ).toBe(204);
    } finally {
      await server.close();
    }
  });
});
