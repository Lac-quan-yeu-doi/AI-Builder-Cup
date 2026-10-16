import { describe, expect, it } from "vitest";
import {
  parseListenAddress,
  startCompatibilityServer,
} from "../support/compatibility-server.js";

interface ResponseCapture {
  status: number;
  contentType: string | undefined;
  body: string;
}

function request(path: string, method = "GET"): Promise<ResponseCapture> {
  return fetch(`http://127.0.0.1:${activePort}${path}`, { method }).then(
    async (response) => ({
      status: response.status,
      contentType: response.headers.get("content-type") ?? undefined,
      body: await response.text(),
    }),
  );
}

let activePort = 0;

describe("Phase 0 compatibility server", () => {
  it("preserves the Rust health probe response", async () => {
    const host = await startCompatibilityServer({ host: "127.0.0.1", port: 0 });
    activePort = host.address.port;
    try {
      const response = await request("/healthz");
      expect(response.status).toBe(200);
      expect(response.contentType).toBe("application/json; charset=utf-8");
      expect(response.body).toBe('{"status":"ok"}');
    } finally {
      await host.close();
    }
  });

  it("serves Prometheus text and counts only non-probe requests", async () => {
    const host = await startCompatibilityServer({ host: "127.0.0.1", port: 0 });
    activePort = host.address.port;
    try {
      await request("/healthz");
      await request("/api/v1/not-found");
      const response = await request("/metrics");
      expect(response.status).toBe(200);
      expect(response.contentType).toBe(
        "text/plain; charset=utf-8; version=0.0.4",
      );
      expect(response.body).toContain(
        'http_server_active_requests{service="celesnity-agent"} 0',
      );
      expect(response.body).toContain(
        'http_server_requests_total{service="celesnity-agent",method="GET",route="unmatched",status_code="404"} 1',
      );
    } finally {
      await host.close();
    }
  });

  it("returns 404 for methods and routes that do not exist yet", async () => {
    const host = await startCompatibilityServer({ host: "127.0.0.1", port: 0 });
    activePort = host.address.port;
    try {
      expect((await request("/healthz", "POST")).status).toBe(404);
      expect((await request("/turns")).status).toBe(404);
      expect((await request("/turns", "POST")).status).toBe(404);
      expect((await request("/api/v1/turns", "POST")).status).toBe(401);
      expect((await request("/not-found")).status).toBe(404);
    } finally {
      await host.close();
    }
  });

  it("parses only valid listen addresses", () => {
    expect(parseListenAddress(undefined)).toEqual({
      host: "127.0.0.1",
      port: 8080,
    });
    expect(parseListenAddress("0.0.0.0:18080")).toEqual({
      host: "0.0.0.0",
      port: 18080,
    });
    expect(() => parseListenAddress("0.0.0.0:0")).toThrow(
      "Invalid MINDER_SERVE_ADDR.",
    );
    expect(() => parseListenAddress("not-an-address")).toThrow(
      "Invalid MINDER_SERVE_ADDR.",
    );
  });
});
