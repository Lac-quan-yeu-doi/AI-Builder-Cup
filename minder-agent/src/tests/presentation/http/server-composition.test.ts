import { describe, expect, it } from "vitest";
import {
  startCompatibilityServer,
  type StartServerOptions,
} from "../../support/compatibility-server.js";
import { request } from "./harness.js";

describe("MinderServeDependencies composition", () => {
  it("treats an empty dependency object as an unconfigured runtime", async () => {
    const server = await startCompatibilityServer(
      { host: "127.0.0.1", port: 0 } satisfies StartServerOptions,
      {},
    );
    try {
      expect((await request(server, "/livez")).status).toBe(200);
      expect((await request(server, "/readyz")).status).toBe(503);
      const response = await request(server, "/api/v1/turns", {
        method: "POST",
        headers: { "x-caller-id": "alice" },
        body: { session_key: "composition", input: "hello" },
      });
      expect(response.status).toBe(503);
    } finally {
      await server.close();
    }
  });
});
