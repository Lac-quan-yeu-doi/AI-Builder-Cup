import { describe, expect, it } from "vitest";
import { AppModule } from "@bootstrap/app.module.js";
import { createHttpApplication } from "@bootstrap/http-main.js";
import { request } from "./harness.js";

describe("catalog composition route", () => {
  it("publishes the composed tool catalog without a model runtime", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    try {
      const response = await request(app.getHttpServer(), "/api/v1/catalog", {
        headers: { "x-caller-id": "alice" },
      });
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body) as {
        tools: Array<{ name: string; kind: string; state: string }>;
      };
      expect(Array.isArray(body.tools)).toBe(true);
      // Declaration-only descriptors remain contract_only/prompt_only until a
      // ToolPort is composed.
      const read = body.tools.find((tool) => tool.name === "Read");
      expect(read?.state).not.toBe("implemented");
      const trino = body.tools.find((tool) => tool.name === "trino");
      expect(trino?.kind).toBe("mcp");
    } finally {
      await app.close();
    }
  });

  it("requires a caller id", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    try {
      const response = await request(app.getHttpServer(), "/api/v1/catalog");
      expect(response).toMatchObject({
        status: 401,
        body: JSON.stringify({ error: "missing_caller_id" }),
      });
      const stats = await request(app.getHttpServer(), "/stats");
      expect(JSON.parse(stats.body)).toMatchObject({ request_series: 1 });
    } finally {
      await app.close();
    }
  });

  it("answers CORS preflight before catalog authentication", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    try {
      const response = await request(app.getHttpServer(), "/api/v1/catalog", {
        method: "OPTIONS",
        headers: { origin: "https://app.example.com" },
      });
      expect(response).toMatchObject({
        status: 204,
        headers: { "access-control-allow-origin": "*" },
      });
    } finally {
      await app.close();
    }
  });
});
