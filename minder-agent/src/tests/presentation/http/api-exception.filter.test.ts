import type { ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../presentation/http/common/errors/api-error.js";
import { ApiExceptionFilter } from "../../../presentation/http/common/errors/api-exception.filter.js";
import { setRequestContext } from "../../../presentation/http/common/request/request-context.js";

function hostFor(
  response: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  },
  request: object = {},
): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;
}

describe("ApiExceptionFilter", () => {
  it("returns the established internal error body for unexpected exceptions", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);
    const filter = new ApiExceptionFilter();
    const request = { method: "GET", originalUrl: "/api/v2/runs?token=secret" };
    setRequestContext(request, {
      requestId: "error-request-1",
      apiVersion: "2",
    });

    filter.catch(new Error("secret failure"), hostFor(response, request));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: "internal_error",
      request_id: "error-request-1",
    });
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('"event":"http_exception"'),
    );
    expect(stderr.mock.calls[0]?.[0]).toContain(
      '"requestId":"error-request-1"',
    );
    expect(stderr.mock.calls[0]?.[0]).not.toContain("secret");
    stderr.mockRestore();
  });

  it("returns an application error's status and established body", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);
    const filter = new ApiExceptionFilter();

    filter.catch(
      new ApiError(409, { error: "session_busy" }),
      hostFor(response),
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({ error: "session_busy" });
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('"status":409'),
    );
    expect(stderr.mock.calls[0]?.[0]).toContain('"error":"client_error"');
    stderr.mockRestore();
  });

  it("adds the request ID to a v2 error body", () => {
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);
    const request = {};
    setRequestContext(request, {
      requestId: "frontend-request-1",
      apiVersion: "2",
    });

    new ApiExceptionFilter().catch(
      new ApiError(409, { error: "session_busy" }),
      hostFor(response, request),
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: "session_busy",
      request_id: "frontend-request-1",
    });
  });
});
