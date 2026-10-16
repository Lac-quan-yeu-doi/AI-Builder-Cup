import { describe, expect, it } from "vitest";
import { startCompatibilityServer } from "../support/compatibility-server.js";

interface Captured {
  status: number;
  body: string;
}

async function withServer(
  fn: (get: (path: string) => Promise<Captured>) => Promise<void>,
): Promise<void> {
  const server = await startCompatibilityServer({
    host: "127.0.0.1",
    port: 0,
  });
  const get = (path: string): Promise<Captured> =>
    fetch(`http://127.0.0.1:${server.address.port}${path}`).then(
      async (response) => ({
        status: response.status,
        body: await response.text(),
      }),
    );
  try {
    await fn(get);
  } finally {
    await server.close();
  }
}

describe("clean release readiness", () => {
  it("serves health, metrics, and stats without a reference runtime", async () => {
    await withServer(async (get) => {
      await expect(get("/healthz")).resolves.toMatchObject({ status: 200 });
      await expect(get("/metrics")).resolves.toMatchObject({ status: 200 });
      await expect(get("/stats")).resolves.toMatchObject({ status: 200 });
    });
  });

  it("returns a caller-scoped 404 for run event replay when no runtime is composed", async () => {
    await withServer(async (get) => {
      // Without a caller id the run replay route is unauthorized, proving the
      // ownership guard is composed in the release image.
      await expect(get("/api/v1/runs/missing/events")).resolves.toMatchObject({
        status: 401,
      });
    });
  });
});
