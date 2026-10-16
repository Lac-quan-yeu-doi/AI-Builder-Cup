import { sha256 } from "@infrastructure/crypto/sha256.js";
import type { ChatCompletionGateway } from "@infrastructure/ai";
import { HttpException, type ArgumentsHost } from "@nestjs/common";
import { InMemoryRunManager } from "@application/runtime";
import { getMetadataStorage } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { ApiExceptionFilter } from "../../../presentation/http/common/errors/api-exception.filter.js";
import { setRequestContext } from "../../../presentation/http/common/request/request-context.js";
import { request, startTestServer } from "./harness.js";

const headers = { "x-caller-id": "alice", "x-request-id": "error-contract-1" };
const config = {
  baseUrl: "http://example.test",
  apiKey: "secret",
  model: "model",
};

function runtime(gate?: Promise<void>): InMemoryRunManager {
  return new InMemoryRunManager({
    sha256,
    config,
    gateway: {
      async *stream() {
        if (gate) await gate;
        yield { type: "text", text: "done" } as const;
      },
    } satisfies ChatCompletionGateway,
  });
}

function expectV2Error(
  response: Awaited<ReturnType<typeof request>>,
  status: number,
  error: string,
): void {
  expect(response.status).toBe(status);
  expect(error).toMatch(/^[a-z]+(?:_[a-z]+)*$/u);
  expect(JSON.parse(response.body)).toEqual({
    error,
    request_id: response.headers["x-request-id"],
  });
  expect(response.body).not.toContain("Exception");
}

describe("v2 error contract", () => {
  it("never exposes a raw string HTTP exception as a v2 code", () => {
    const request = {};
    setRequestContext(request, {
      requestId: "error-contract-1",
      apiVersion: "2",
    });
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    new ApiExceptionFilter().catch(
      new HttpException("secret_token", 400),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: "internal_error",
      request_id: "error-contract-1",
    });
  });

  it("publishes explicit snake-case request and response properties", async () => {
    const dtos = await import("../../../presentation/http/v2/openapi-dtos.js");
    const controllers = await Promise.all([
      import("../../../presentation/http/v2/runs.controller.js"),
      import("../../../presentation/http/v2/events.controller.js"),
      import("../../../presentation/http/v2/governance.controller.js"),
    ]);
    const fields = [
      [dtos.CreateRunRequest, ["session_key", "input", "wait_ms"]],
      [dtos.SubmitToolResultRequest, ["tool_call_id", "content", "is_error"]],
      [
        dtos.StartedRunResponse,
        ["run_id", "session_id", "events_url", "request_id"],
      ],
      [
        dtos.CompletedRunResponse,
        ["run_id", "status", "response_text", "request_id"],
      ],
      [dtos.DuplicateDeliveryResponse, ["status", "request_id"]],
      [dtos.ApiErrorV2Response, ["error", "request_id"]],
      [dtos.StreamOpenedEvent, ["request_id", "run_id", "cursor"]],
    ] as const;
    for (const [dto, expected] of fields) {
      const publicFields = Reflect.getMetadata(
        "swagger/apiModelPropertiesArray",
        dto.prototype,
      ) as string[] | undefined;
      expect(publicFields?.map((field) => field.slice(1))).toEqual(
        expect.arrayContaining([...expected]),
      );
      const validatedFields = getMetadataStorage()
        .getTargetValidationMetadatas(dto, "", false, false)
        .map((metadata) => metadata.propertyName);
      expect(validatedFields).toEqual(expect.arrayContaining([...expected]));
    }
    for (const [dto, field] of [
      [dtos.ApiErrorV2Response, "error"],
      [dtos.CompletedRunResponse, "error"],
      [dtos.CompletedRunResponse, "response_text"],
    ] as const) {
      const property = Reflect.getMetadata(
        "swagger/apiModelProperties",
        dto.prototype,
        field,
      ) as { type?: unknown } | undefined;
      expect(property?.type).toBe(String);
    }
    for (const controller of [
      controllers[0].RunsV2Controller,
      controllers[1].EventsV2Controller,
      controllers[2].GovernanceV2Controller,
    ]) {
      const responses = Reflect.getMetadata(
        "swagger/apiResponse",
        controller,
      ) as Record<string, { type?: unknown }> | undefined;
      expect(responses?.["401"]?.type).toBe(dtos.ApiErrorV2Response);
      expect(responses?.["403"]?.type).toBe(dtos.ApiErrorV2Response);
    }
    const runRoutes = controllers[0].RunsV2Controller.prototype;
    for (const [route, statuses] of [
      ["session", [400, 404, 503]],
      ["toolResult", [503]],
      ["webhook", [503]],
    ] as const) {
      const responses = Reflect.getMetadata(
        "swagger/apiResponse",
        runRoutes[route],
      ) as Record<string, { type?: unknown }> | undefined;
      for (const status of statuses) {
        expect(responses?.[status]?.type).toBe(dtos.ApiErrorV2Response);
      }
    }
  });

  it("returns a safe invalid-run body and keeps the v1 body exact", async () => {
    const server = await startTestServer(runtime());
    try {
      const options = {
        method: "POST",
        headers,
        body: { session_key: "", input: "hello" },
      };
      expectV2Error(
        await request(server, "/api/v2/runs", options),
        400,
        "invalid_turn",
      );
      const v1 = await request(server, "/api/v1/turns", options);
      expect(v1.status).toBe(400);
      expect(JSON.parse(v1.body)).toEqual({ error: "invalid_turn" });
      expect(v1.headers["x-request-id"]).toBe("error-contract-1");
    } finally {
      await server.close();
    }
  });

  it("returns safe missing-caller, missing-run, and runtime-unavailable bodies", async () => {
    const server = await startTestServer(runtime());
    const unavailable = await startTestServer();
    try {
      expectV2Error(
        await request(server, "/api/v2/runs/missing/status", {
          headers: { "x-request-id": "error-contract-1" },
        }),
        401,
        "missing_caller_id",
      );
      expectV2Error(
        await request(server, "/api/v2/runs/missing/status", { headers }),
        404,
        "run_not_found",
      );
      expectV2Error(
        await request(unavailable, "/api/v2/runs", {
          method: "POST",
          headers,
          body: { session_key: "chat:one", input: "hello" },
        }),
        503,
        "runtime_not_configured",
      );
    } finally {
      await server.close();
      await unavailable.close();
    }
  });

  it("preserves the active run ID in the v2 session-conflict body", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = await startTestServer(runtime(gate));
    try {
      const options = {
        method: "POST",
        headers,
        body: { session_key: "chat:busy", input: "hello" },
      };
      const admitted = await request(server, "/api/v2/runs", options);
      expect(admitted.status).toBe(202);
      const activeRunId = JSON.parse(admitted.body).run_id as string;
      const v2 = await request(server, "/api/v2/runs", options);
      expect(v2.status).toBe(409);
      expect(JSON.parse(v2.body)).toEqual({
        error: "session_busy",
        request_id: v2.headers["x-request-id"],
        active_run_id: activeRunId,
      });
      const v1 = await request(server, "/api/v1/turns", options);
      expect(v1.status).toBe(409);
      expect(JSON.parse(v1.body)).toEqual({
        error: "session_busy",
        detail: "Session has an active run.",
        active_run_id: activeRunId,
      });
      expect(v1.headers["x-request-id"]).toBe("error-contract-1");
    } finally {
      release();
      await server.close();
    }
  });
});
