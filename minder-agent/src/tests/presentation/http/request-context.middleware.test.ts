import { describe, expect, it, vi } from "vitest";
import { RequestContextMiddleware } from "../../../presentation/http/common/request/request-context.middleware.js";
import {
  requestContext,
  requestId,
} from "../../../presentation/http/common/request/request-context.js";

describe("RequestContextMiddleware", () => {
  it("normalizes a supplied request ID and exposes it to later handlers", () => {
    const request = {
      headers: { "x-request-id": " frontend-request-1 " },
      originalUrl: "/api/v1/turns",
    };
    const response = { setHeader: vi.fn() };
    const next = vi.fn();

    new RequestContextMiddleware().use(request, response, next);

    expect(response.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      "frontend-request-1",
    );
    expect(requestContext(request)).toEqual({
      requestId: "frontend-request-1",
      apiVersion: "1",
    });
    expect(requestId(request)).toBe("frontend-request-1");
    expect(next).toHaveBeenCalledOnce();
  });

  it("keeps the same context when Nest invokes the middleware twice", () => {
    const request = { headers: {}, originalUrl: "/api/v1/healthz" };
    const response = { setHeader: vi.fn() };
    const middleware = new RequestContextMiddleware();

    middleware.use(request, response, vi.fn());
    const first = requestContext(request);
    middleware.use(request, response, vi.fn());

    expect(requestContext(request)).toBe(first);
  });

  it.each(["", "a".repeat(129), "bad\nvalue", "é"])(
    "generates a UUID for an invalid request ID %j",
    (candidate) => {
      const request = {
        headers: { "x-request-id": candidate },
        originalUrl: "/api/v2/runs",
      };
      const response = { setHeader: vi.fn() };

      new RequestContextMiddleware().use(request, response, vi.fn());

      expect(requestId(request)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
      );
      expect(requestContext(request)?.apiVersion).toBe("2");
    },
  );
});
