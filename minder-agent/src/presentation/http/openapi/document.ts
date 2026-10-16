import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type {
  OperationObject,
  ReferenceObject,
  SchemaObject,
} from "@nestjs/swagger";

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Minder Agent API")
    .setDescription(
      "Versioned HTTP API for agent runs and workspace resources.",
    )
    .setVersion("2.0.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        description: "Verified Core owner assertion",
      },
      "owner",
    )
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: "x-minder-signature",
        description: "HMAC SHA-256 signature over the raw request body",
      },
      "webhookSignature",
    )
    .addTag("Runs", "Run admission, sessions, status, and events")
    .addTag("Governance", "Manifest and run governance")
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, method, version) =>
      `${controller}_${method}_${version?.startsWith("v") ? version : `v${version ?? "1"}`}`,
  });

  document.components ??= {};
  document.components.schemas ??= {};
  Object.assign(document.components.schemas, v2SuccessSchemas);
  document.components.headers ??= {};
  document.components.headers["X-Request-Id"] = {
    description: "Correlation ID returned with every HTTP response.",
    schema: { type: "string" },
  };
  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (pathItem === undefined) continue;
    for (const method of [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "options",
      "head",
      "trace",
    ] as const) {
      const operation = pathItem[method];
      if (operation === undefined) continue;
      const versioned = /^\/api\/v[12]\//u.test(path);
      if (path.startsWith("/api/v1/")) operation.deprecated = true;
      if (path.startsWith("/api/v2/")) operation.tags = [resourceTag(path)];
      if (versioned) {
        operation.parameters ??= [];
        const requestIdHeader = operation.parameters.find(
          (parameter) =>
            "name" in parameter &&
            parameter.name.toLowerCase() === "x-request-id",
        );
        if (requestIdHeader && "name" in requestIdHeader) {
          requestIdHeader.name = "X-Request-Id";
          requestIdHeader.required = false;
          requestIdHeader.description = "Optional request correlation ID.";
        } else {
          operation.parameters.push({
            name: "X-Request-Id",
            in: "header",
            required: false,
            description: "Optional request correlation ID.",
            schema: { type: "string" },
          });
        }
      }
      if (/^\/api\/v[12]\/room-webhooks\//u.test(path))
        operation.security = [{ webhookSignature: [] }];
      else if (
        versioned &&
        !/^\/api\/(?:v1\/(?:healthz|livez|readyz|metrics|stats)|v2\/healthz)$/u.test(
          path,
        )
      )
        operation.security = [{ owner: [] }];
      if (path.startsWith("/api/v2/"))
        operation.responses.default ??= {
          description: "Error response",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiErrorV2Response" },
            },
          },
        };
      if (path.startsWith("/api/v2/"))
        documentV2Operation(path, method, operation);
      for (const response of Object.values(operation.responses ?? {})) {
        if (response === undefined || "$ref" in response) continue;
        response.headers ??= {};
        response.headers["X-Request-Id"] = {
          $ref: "#/components/headers/X-Request-Id",
        };
      }
    }
  }
  return document;
}

function documentV2Operation(
  path: string,
  method: string,
  operation: OperationObject,
): void {
  if (
    method === "get" &&
    /^\/api\/v2\/runs\/\{runId\}\/(?:trace|files|governance\/evidence)$/u.test(
      path,
    )
  ) {
    operation.parameters = (operation.parameters ?? []).filter(
      (parameter) =>
        "$ref" in parameter ||
        parameter.in !== "query" ||
        parameter.name === "cursor" ||
        parameter.name === "limit",
    );
    for (const parameter of operation.parameters ?? [])
      if (
        "name" in parameter &&
        parameter.in === "query" &&
        (parameter.name === "cursor" || parameter.name === "limit")
      )
        parameter.required = false;
  }
  if (
    method === "get" &&
    (path === "/api/v2/runs/{runId}/events" ||
      path === "/api/v2/rooms/{roomId}/events")
  ) {
    operation.parameters = (operation.parameters ?? []).filter(
      (parameter) =>
        "$ref" in parameter ||
        parameter.in !== "query" ||
        parameter.name === "cursor",
    );
    const cursor = operation.parameters.find(
      (parameter) => "name" in parameter && parameter.name === "cursor",
    );
    if (cursor && "name" in cursor) cursor.required = false;
    else
      operation.parameters.push({
        name: "cursor",
        in: "query",
        required: false,
        description: "Resume after this event ID.",
        schema: { type: "string" },
      });
    operation.parameters.push({
      name: "Last-Event-ID",
      in: "header",
      required: false,
      description: "Resume after this event ID when cursor is omitted.",
      schema: { type: "string" },
    });
    if (path === "/api/v2/rooms/{roomId}/events") {
      const response = operation.responses["200"];
      if (response !== undefined && !("$ref" in response))
        response.content = {
          "text/event-stream": { schema: { type: "string" } },
        };
    }
  }
  const success = v2SuccessOperations[`${method.toUpperCase()} ${path}`];
  if (!success) return;
  const response = operation.responses[success.status];
  if (response === undefined || "$ref" in response) return;
  response.content = {
    "application/json": {
      schema: { $ref: `#/components/schemas/${success.schema}` },
    },
  };
}

const roomRef: ReferenceObject = {
  $ref: "#/components/schemas/RoomV2Response",
};
const webhookRef: ReferenceObject = {
  $ref: "#/components/schemas/RoomWebhookV2Response",
};
const v2SuccessSchemas: Record<string, SchemaObject> = {
  RunStatusV2Response: {
    type: "object",
    required: [
      "run_id",
      "status",
      "session_id",
      "finished_at",
      "response_text",
      "data_scope",
      "error",
    ],
    properties: {
      run_id: { type: "string" },
      status: { type: "string" },
      session_id: { type: "string" },
      finished_at: { type: "string", nullable: true },
      response_text: { type: "string", nullable: true },
      data_scope: {
        type: "object",
        nullable: true,
        additionalProperties: true,
      },
      error: { type: "string", nullable: true },
    },
  },
  RoomV2Response: {
    type: "object",
    required: [
      "id",
      "name",
      "max_concurrent_runs",
      "max_queued",
      "status",
      "members",
      "created_at",
    ],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      key: { type: "string" },
      max_concurrent_runs: { type: "integer" },
      max_queued: { type: "integer" },
      status: { type: "string" },
      members: { type: "array", items: { type: "string" } },
      created_at: { type: "string" },
    },
  },
  RoomListV2Response: { type: "array", items: roomRef },
  RoomWebhookV2Response: {
    type: "object",
    required: ["id", "room_id", "agent", "source", "secret_ref", "created_at"],
    properties: {
      id: { type: "string" },
      room_id: { type: "string" },
      agent: { type: "string" },
      source: { type: "string" },
      secret_ref: { type: "string" },
      created_at: { type: "string" },
    },
  },
  RoomWebhookListV2Response: { type: "array", items: webhookRef },
  RoomHistoryV2Response: {
    type: "object",
    required: ["room_id", "runs", "truncated"],
    properties: {
      room_id: { type: "string" },
      runs: { type: "array", items: { type: "object" } },
      truncated: { type: "boolean" },
    },
  },
  RoomMetricsV2Response: {
    type: "object",
    required: [
      "total",
      "succeeded",
      "failed",
      "cancelled",
      "skipped",
      "running",
      "p50DurationMs",
      "p95DurationMs",
    ],
    properties: {
      total: { type: "integer" },
      succeeded: { type: "integer" },
      failed: { type: "integer" },
      cancelled: { type: "integer" },
      skipped: { type: "integer" },
      running: { type: "integer" },
      p50DurationMs: { type: "number", nullable: true },
      p95DurationMs: { type: "number", nullable: true },
    },
  },
  RoomRunV2Response: {
    oneOf: [
      {
        type: "object",
        required: [
          "run_id",
          "session_id",
          "room_id",
          "events_url",
          "room_events_url",
          "queue_position",
          "request_id",
        ],
        properties: {
          run_id: { type: "string" },
          session_id: { type: "string" },
          room_id: { type: "string" },
          events_url: { type: "string" },
          room_events_url: { type: "string" },
          queue_position: { type: "integer" },
          request_id: { type: "string" },
        },
      },
      { $ref: "#/components/schemas/DuplicateDeliveryResponse" },
    ],
  },
  RoomWebhookAdmissionV2Response: {
    oneOf: [
      {
        type: "object",
        required: ["run_id", "room_id", "request_id"],
        properties: {
          run_id: { type: "string" },
          room_id: { type: "string" },
          request_id: { type: "string" },
        },
      },
      { $ref: "#/components/schemas/DuplicateDeliveryResponse" },
    ],
  },
  RoomTranscriptV2Response: {
    type: "object",
    required: ["id", "history"],
    properties: {
      id: { type: "string" },
      history: { type: "array", items: { type: "object" } },
    },
  },
};

const v2SuccessOperations: Record<string, { status: string; schema: string }> =
  {
    "GET /api/v2/runs/{runId}/status": {
      status: "200",
      schema: "RunStatusV2Response",
    },
    "GET /api/v2/rooms": { status: "200", schema: "RoomListV2Response" },
    "POST /api/v2/rooms": { status: "201", schema: "RoomV2Response" },
    "GET /api/v2/rooms/{roomId}": { status: "200", schema: "RoomV2Response" },
    "POST /api/v2/rooms/{roomId}/close": {
      status: "200",
      schema: "RoomV2Response",
    },
    "POST /api/v2/rooms/{roomId}/members": {
      status: "200",
      schema: "RoomV2Response",
    },
    "DELETE /api/v2/rooms/{roomId}/members/{agent}": {
      status: "200",
      schema: "RoomV2Response",
    },
    "GET /api/v2/rooms/{roomId}/webhooks": {
      status: "200",
      schema: "RoomWebhookListV2Response",
    },
    "POST /api/v2/rooms/{roomId}/webhooks": {
      status: "201",
      schema: "RoomWebhookV2Response",
    },
    "GET /api/v2/rooms/{roomId}/history": {
      status: "200",
      schema: "RoomHistoryV2Response",
    },
    "GET /api/v2/rooms/{roomId}/metrics": {
      status: "200",
      schema: "RoomMetricsV2Response",
    },
    "POST /api/v2/rooms/{roomId}/runs": {
      status: "202",
      schema: "RoomRunV2Response",
    },
    "GET /api/v2/sessions/{sessionId}/transcript": {
      status: "200",
      schema: "RoomTranscriptV2Response",
    },
    "POST /api/v2/room-webhooks/{webhookId}": {
      status: "202",
      schema: "RoomWebhookAdmissionV2Response",
    },
  };

function resourceTag(path: string): string {
  const resource = path.split("/")[3];
  if (path.includes("/governance")) return "Governance";
  return resource === undefined
    ? "API"
    : resource.charAt(0).toUpperCase() + resource.slice(1).replaceAll("-", " ");
}
