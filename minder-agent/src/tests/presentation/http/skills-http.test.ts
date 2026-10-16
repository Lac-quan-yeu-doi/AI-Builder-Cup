import { describe, expect, it } from "vitest";
import {
  createMemorySkillStore,
  createSkillService,
  type SkillService,
} from "@application/skill";
import { request, startTestServer } from "./harness.js";
import { sha256 } from "@infrastructure/crypto/sha256.js";

function services(): (owner: string) => SkillService {
  const values = new Map<string, SkillService>();
  return (owner) => {
    const existing = values.get(owner);
    if (existing) return existing;
    const created = createSkillService({
      store: createMemorySkillStore(),
      sha256,
    });
    values.set(owner, created);
    return created;
  };
}

describe("skills HTTP routes", () => {
  it("accepts an empty namespace for an ungrouped project skill", async () => {
    const server = await startTestServer({ skillServiceForOwner: services() });
    try {
      const created = await request(server, "/api/v1/skills", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: {
          name: "ungrouped-skill",
          namespace: "",
          description: "A skill without a grouping label.",
          body: "Use the skill instructions.",
        },
      });

      expect(created.status).toBe(201);
      expect(JSON.parse(created.body)).toMatchObject({
        name: "ungrouped-skill",
        namespace: "",
      });
    } finally {
      await server.close();
    }
  });

  it("manages project skills only within the authenticated owner", async () => {
    const server = await startTestServer({ skillServiceForOwner: services() });
    const alice = { "x-caller-id": "alice" };
    try {
      const created = await request(server, "/api/v1/skills", {
        method: "POST",
        headers: alice,
        body: {
          name: "report-writing",
          namespace: "reports",
          description: "Write a concise report.",
          body: "Use headings and cite evidence.",
        },
      });
      expect(created.status).toBe(201);
      expect(JSON.parse(created.body)).toMatchObject({
        name: "report-writing",
        read_only: false,
      });

      expect(
        (
          await request(server, "/api/v1/skills/report-writing", {
            headers: { "x-caller-id": "bob" },
          })
        ).status,
      ).toBe(404);
      expect(
        JSON.parse(
          (
            await request(server, "/api/v1/skills/report-writing", {
              headers: alice,
            })
          ).body,
        ),
      ).toMatchObject({ body: "Use headings and cite evidence." });

      const updated = await request(server, "/api/v1/skills/report-writing", {
        method: "PUT",
        headers: alice,
        body: {
          name: "report-writing",
          namespace: "reports",
          body: "Always provide concise evidence.",
        },
      });
      expect(updated.status).toBe(200);
      expect(
        JSON.parse(
          (
            await request(server, "/api/v1/skills/report-writing", {
              headers: alice,
            })
          ).body,
        ),
      ).toMatchObject({ body: "Always provide concise evidence." });

      expect(
        (
          await request(server, "/api/v1/skills/report-writing", {
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
