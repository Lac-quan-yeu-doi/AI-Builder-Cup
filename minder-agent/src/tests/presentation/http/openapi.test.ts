import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { request, startTestServer } from "./harness.js";

type PublishedSchema = {
  $ref?: string;
  properties?: Record<string, unknown>;
  additionalProperties?: unknown;
};
type PublishedOperation = {
  parameters?: readonly object[];
  responses: Record<
    string,
    { content?: Record<string, { schema?: PublishedSchema }> } | undefined
  >;
  requestBody?: { content?: Record<string, { schema?: PublishedSchema }> };
};

const snapshot = new URL(
  "../../../../docs/api/openapi/minder-agent.yaml",
  import.meta.url,
);

describe("OpenAPI publication", () => {
  it("serves the UI and a versioned, annotated document", async () => {
    const server = await startTestServer();
    try {
      expect((await request(server, "/api/docs")).status).toBe(200);
      const response = await request(server, "/api/docs/openapi.json");
      expect(response.status).toBe(200);
      const document = JSON.parse(response.body);
      expect(document.info.version).toBe("2.0.0");
      expect(document.paths["/api/v2/runs"].post).toMatchObject({
        tags: ["Runs"],
      });
      expect(document.paths["/api/v1/turns"].post.deprecated).toBe(true);
      for (const [path, methods] of Object.entries(document.paths)) {
        if (!path.startsWith("/api/v1/")) continue;
        for (const method of ["get", "post", "put", "patch", "delete"]) {
          const operation = (
            methods as Record<string, { deprecated?: boolean } | undefined>
          )[method];
          if (operation)
            expect(operation.deprecated, `${method} ${path}`).toBe(true);
        }
      }
      expect(document.components.schemas.ApiErrorV2Response).toBeDefined();
      expect(
        document.components.schemas.ApiErrorV2Response.properties,
      ).toHaveProperty("active_run_id");
      expect(
        document.components.schemas.ApiErrorV2Response.required,
      ).not.toContain("active_run_id");
      expect(document.components.securitySchemes.owner).toBeDefined();
      expect(document.security).toBeUndefined();
      expect(document.paths["/api/v2/runs"].post.security).toEqual([
        { owner: [] },
      ]);
      expect(
        document.paths["/api/v2/room-webhooks/{webhookId}"].post.security,
      ).toEqual([{ webhookSignature: [] }]);
      expect(
        document.components.securitySchemes.webhookSignature,
      ).toMatchObject({
        type: "apiKey",
        in: "header",
        name: "x-minder-signature",
      });
      expect(
        document.paths["/api/v2/sessions/{sessionKey}"].get.responses["200"]
          .content["application/json"].schema.$ref,
      ).toBe("#/components/schemas/SessionV2Response");
      expect(
        document.paths["/api/v2/agent-manifests/governance/validate"].post
          .responses["200"].content["application/json"].schema.$ref,
      ).toBe("#/components/schemas/GovernanceValidationV2Response");
      for (const suffix of ["trace", "files", "governance/evidence"]) {
        const parameters = document.paths[`/api/v2/runs/{runId}/${suffix}`].get
          .parameters as {
          name: string;
          in: string;
          required: boolean;
        }[];
        expect(
          parameters.filter((parameter) => parameter.in === "query"),
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "cursor", required: false }),
            expect.objectContaining({ name: "limit", required: false }),
          ]),
        );
        expect(
          parameters.some((parameter) => parameter.name === "after_seq"),
        ).toBe(false);
      }
      for (const path of [
        "/api/v2/runs/{runId}/events",
        "/api/v2/rooms/{roomId}/events",
      ]) {
        const operation = document.paths[path].get;
        expect(operation.parameters).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: "cursor",
              in: "query",
              required: false,
            }),
            expect.objectContaining({
              name: "Last-Event-ID",
              in: "header",
              required: false,
            }),
          ]),
        );
        expect(
          (operation.parameters as { name: string }[]).some((parameter) =>
            ["after_seq", "from"].includes(parameter.name),
          ),
        ).toBe(false);
        expect(
          operation.responses["200"].content["text/event-stream"].schema,
        ).toBeDefined();
      }
      const successSchemas: Record<string, [string, string]> = {
        "GET /api/v2/runs/{runId}/status": ["200", "RunStatusV2Response"],
        "GET /api/v2/rooms": ["200", "RoomListV2Response"],
        "POST /api/v2/rooms": ["201", "RoomV2Response"],
        "GET /api/v2/rooms/{roomId}": ["200", "RoomV2Response"],
        "POST /api/v2/rooms/{roomId}/close": ["200", "RoomV2Response"],
        "POST /api/v2/rooms/{roomId}/members": ["200", "RoomV2Response"],
        "DELETE /api/v2/rooms/{roomId}/members/{agent}": [
          "200",
          "RoomV2Response",
        ],
        "GET /api/v2/rooms/{roomId}/webhooks": [
          "200",
          "RoomWebhookListV2Response",
        ],
        "POST /api/v2/rooms/{roomId}/webhooks": [
          "201",
          "RoomWebhookV2Response",
        ],
        "GET /api/v2/rooms/{roomId}/history": ["200", "RoomHistoryV2Response"],
        "GET /api/v2/rooms/{roomId}/metrics": ["200", "RoomMetricsV2Response"],
        "POST /api/v2/rooms/{roomId}/runs": ["202", "RoomRunV2Response"],
        "GET /api/v2/sessions/{sessionId}/transcript": [
          "200",
          "RoomTranscriptV2Response",
        ],
        "POST /api/v2/room-webhooks/{webhookId}": [
          "202",
          "RoomWebhookAdmissionV2Response",
        ],
      };
      for (const [route, [status, schema]] of Object.entries(successSchemas)) {
        const [method, path] = route.split(" ") as [string, string];
        expect(
          document.paths[path][method.toLowerCase()].responses[status].content[
            "application/json"
          ].schema.$ref,
          route,
        ).toBe(`#/components/schemas/${schema}`);
      }
      expect(
        document.components.schemas.RunStatusV2Response.properties,
      ).toHaveProperty("status");
      expect(
        document.components.schemas.RoomV2Response.properties,
      ).toHaveProperty("members");
      expect(document.components.schemas.RoomRunV2Response.oneOf).toHaveLength(
        2,
      );
      const schemas = document.components.schemas as Record<
        string,
        PublishedSchema
      >;
      for (const name of [
        "StartedRunResponse",
        "CompletedRunResponse",
        "DuplicateDeliveryResponse",
      ]) {
        const schema = schemas[name] as PublishedSchema & {
          required?: string[];
        };
        expect(schema.properties).toHaveProperty("request_id");
        expect(schema.required).toContain("request_id");
      }
      for (const [path, methods] of Object.entries(document.paths)) {
        if (!/^\/api\/v[12]\//u.test(path)) continue;
        for (const [method, operation] of Object.entries(
          methods as Record<string, PublishedOperation | undefined>,
        )) {
          if (!["get", "post", "put", "patch", "delete"].includes(method))
            continue;
          if (!operation) continue;
          expect(operation.parameters, `${method} ${path} request ID`).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: "X-Request-Id",
                in: "header",
                required: false,
                schema: { type: "string" },
              }),
            ]),
          );
          if (!path.startsWith("/api/v2/")) continue;
          const errorRef = "#/components/schemas/ApiErrorV2Response";
          expect(
            Object.values(operation.responses).some(
              (response) =>
                response?.content?.["application/json"]?.schema?.$ref ===
                errorRef,
            ),
            `${method} ${path} error schema`,
          ).toBe(true);
          const schema =
            operation.requestBody?.content?.["application/json"]?.schema;
          if (!schema) continue;
          const resolved = schema.$ref
            ? schemas[schema.$ref.split("/").at(-1) ?? ""]
            : schema;
          expect(
            Object.keys(resolved?.properties ?? {}).length > 0 ||
              resolved?.additionalProperties !== undefined,
            `${method} ${path} request schema`,
          ).toBe(true);
        }
      }
      expect(document.components.headers["X-Request-Id"]).toBeDefined();
      expect(document.paths["/api/v2/runs"].post.operationId).toBe(
        "RunsV2Controller_start_v2",
      );
      expect(document.paths["/api/v1/turns"].post.operationId).toBe(
        "TurnsNestController_turn_v1",
      );
    } finally {
      await server.close();
    }
  });

  it("checks in the same path set as the served document", async () => {
    const server = await startTestServer();
    try {
      const response = await request(server, "/api/docs/openapi.json");
      expect(response.status).toBe(200);
      const served = JSON.parse(response.body);
      const snapshotText = await readFile(snapshot, "utf8");
      const checked = YAML.parse(snapshotText);
      expect(Object.keys(checked.paths).sort()).toEqual(
        Object.keys(served.paths).sort(),
      );
      expect(checked.servers ?? []).toEqual([]);
      expect(snapshotText).not.toMatch(
        /(?:localhost|127\.0\.0\.1|host\.docker\.internal|postgres(?:ql)?:\/\/|LLM_(?:BASE_URL|API_KEY|MODEL)\s*:|DATABASE_URL\s*:|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9]{12,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/iu,
      );
      expect(checked.paths["/api/v1/turns"].post.deprecated).toBe(true);
      expect(checked.paths["/api/v2/runs"].post.tags).toEqual(["Runs"]);
      for (const path of [
        "/api/v2/runs/{runId}/trace",
        "/api/v2/runs/{runId}/events",
        "/api/v2/rooms/{roomId}/events",
        "/api/v2/runs/{runId}/status",
        "/api/v2/rooms",
        "/api/v2/rooms/{roomId}/runs",
      ])
        expect(checked.paths[path], path).toEqual(served.paths[path]);
      for (const name of [
        "StartedRunResponse",
        "CompletedRunResponse",
        "DuplicateDeliveryResponse",
      ]) {
        expect(checked.components.schemas[name].required).toContain(
          "request_id",
        );
      }
    } finally {
      await server.close();
    }
  });
});
