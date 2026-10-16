import { describe, expect, it } from "vitest";
import { AppModule } from "@bootstrap/app.module.js";
import { createHttpApplication } from "@bootstrap/http-main.js";
import { OperationsMetricsService } from "@presentation/http/operations/operations.controller.js";
import { request } from "./harness.js";

describe("operations routes", () => {
  it("serves root and versioned operational routes through Nest", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    try {
      const server = app.getHttpServer();
      const health = await request(server, "/api/v1/healthz");
      expect(health).toMatchObject({
        status: 200,
        body: JSON.stringify({ status: "ok" }),
      });
      const preflight = await request(server, "/api/v1/healthz", {
        method: "OPTIONS",
        headers: { origin: "https://app.example.com" },
      });
      expect(preflight.headers).toMatchObject({
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
        "access-control-allow-headers":
          "content-type,authorization,x-caller-id,last-event-id,x-request-id",
      });
      expect((await request(server, "/api/v1/metrics")).status).toBe(200);
      expect((await request(server, "/api/v1/stats")).status).toBe(200);
      expect((await request(server, "/healthz")).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("exposes /metrics and /stats without a model runtime through Nest", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    try {
      const server = app.getHttpServer();
      const metrics = await request(server, "/metrics");
      expect(metrics).toMatchObject({
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8; version=0.0.4" },
      });

      const stats = await request(server, "/stats");
      const body = JSON.parse(stats.body) as Record<string, unknown>;
      expect(stats).toMatchObject({ status: 200 });
      expect(body).toMatchObject({
        uptime_seconds: expect.any(Number),
        active_requests: 0,
        request_series: 0,
      });
    } finally {
      await app.close();
    }
  });

  it("renders the live active-request gauge", () => {
    const metrics = new OperationsMetricsService();
    const complete = metrics.startRequest("GET");

    expect(metrics.render()).toContain(
      'http_server_active_requests{service="celesnity-agent"} 1',
    );

    complete();
  });

  it("records completed native requests in stats and Prometheus output", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    try {
      const server = app.getHttpServer();
      await expect(
        request(server, "/api/v1/catalog", {
          headers: { "x-caller-id": "alice" },
        }),
      ).resolves.toMatchObject({ status: 200 });

      const stats = await request(server, "/stats");
      expect(JSON.parse(stats.body)).toMatchObject({
        active_requests: 0,
        request_series: 1,
      });

      const metrics = await request(server, "/metrics");
      expect(metrics.body).toContain(
        'http_server_requests_total{service="celesnity-agent",method="GET",route="unmatched",status_code="404"} 1',
      );
      expect(metrics.body).toContain(
        'http_server_request_duration_seconds_bucket{service="celesnity-agent",method="GET",route="unmatched",status_code="404",le="+Inf"} 1',
      );
    } finally {
      await app.close();
    }
  });

  it("adds CORS headers to a versioned operational route", async () => {
    const app = await createHttpApplication(
      AppModule.register({ environment: {}, factories: {} }),
    );
    await app.listen(0, "127.0.0.1");
    try {
      const preflight = await request(app.getHttpServer(), "/api/v1/healthz", {
        method: "OPTIONS",
        headers: { origin: "https://app.example.com" },
      });
      expect(preflight.headers["access-control-allow-origin"]).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
