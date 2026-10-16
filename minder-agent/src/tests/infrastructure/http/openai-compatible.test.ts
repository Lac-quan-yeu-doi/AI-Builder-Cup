import { describe, expect, it } from "vitest";
import type { ProviderError } from "@infrastructure/http/index.js";
import {
  OpenAiCompatibleGateway,
  adaptToolDefinitionsForProvider,
} from "@infrastructure/http/index.js";
import { createFakeOpenAiServer } from "./fake-openai-server.js";

const request = {
  model: "minder-test",
  messages: [{ role: "user" as const, content: "hello" }],
  stream: true as const,
};

async function waitForRequest(server: { requests: unknown[] }): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.requests.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Fake provider did not receive the request.");
}

describe("OpenAiCompatibleGateway", () => {
  it("sends the request and normalizes reasoning, text, and usage", async () => {
    const server = await createFakeOpenAiServer();
    try {
      const gateway = new OpenAiCompatibleGateway({
        baseUrl: `${server.url}/v1/`,
        fetch: server.fetch,
        apiKey: "test-key",
        model: "minder-test",
      });
      const events = await Array.fromAsync(
        gateway.stream(request, new AbortController().signal),
      );

      expect(server.requests[0]).toMatchObject({
        method: "POST",
        path: "/v1/chat/completions",
        headers: { authorization: "Bearer test-key" },
        body: { stream: true, model: "minder-test" },
      });
      expect(events).toEqual([
        { type: "reasoning", text: "inspect first" },
        { type: "text", text: "final answer" },
        { type: "finish", reason: "stop" },
        { type: "usage", input: 3, output: 2 },
      ]);
    } finally {
      await server.close();
    }
  });

  it("serves the deterministic provider over a TCP socket", async () => {
    const server = await createFakeOpenAiServer();
    try {
      const url = await server.listen();
      const response = await fetch(`${url}/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-key",
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      expect(body).toContain("final answer");
      expect(server.requests[0]).toMatchObject({
        method: "POST",
        path: "/v1/chat/completions",
        headers: { authorization: "Bearer test-key" },
        body: { stream: true, model: "minder-test" },
      });
    } finally {
      await server.close();
    }
  });

  it("assembles fragmented tool calls and preserves their provider indexes", async () => {
    const server = await createFakeOpenAiServer();
    server.respond((response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const first = {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  type: "function",
                  function: { name: "Read", arguments: '{"file' },
                },
              ],
            },
          },
        ],
      };
      const second = {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 1,
                  id: "call_2",
                  type: "function",
                  function: { name: "Grep", arguments: '{"pattern' },
                },
              ],
            },
          },
        ],
      };
      const third = {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: '_path":"README.md"}' } },
                { index: 1, function: { arguments: '":"needle"}' } },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      };
      response.write(`data: ${JSON.stringify(first)}\n\n`);
      response.write(`data: ${JSON.stringify(second)}\n\n`);
      response.write(`data: ${JSON.stringify(third)}\n\n`);
      response.end("data: [DONE]\n\n");
    });
    try {
      const gateway = new OpenAiCompatibleGateway({
        baseUrl: server.url,
        fetch: server.fetch,
        apiKey: "test-key",
        model: "minder-test",
      });
      const toolRequest = {
        ...request,
        tools: [
          {
            type: "function" as const,
            function: {
              name: "Read",
              description: "Read",
              parameters: { type: "object" },
            },
          },
        ],
        tool_choice: "auto" as const,
      };
      const events = await Array.fromAsync(
        gateway.stream(toolRequest, new AbortController().signal),
      );

      expect(server.requests[0]?.body).toMatchObject({
        tools: toolRequest.tools,
        tool_choice: "auto",
      });
      expect(events).toEqual([
        {
          type: "tool_call",
          call: {
            id: "call_1",
            name: "Read",
            arguments: '{"file_path":"README.md"}',
          },
        },
        {
          type: "tool_call",
          call: {
            id: "call_2",
            name: "Grep",
            arguments: '{"pattern":"needle"}',
          },
        },
        { type: "finish", reason: "tool_calls" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("accepts Gemini tool calls without indexes and flushes them on stop", async () => {
    const server = await createFakeOpenAiServer();
    server.respond((response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: "call_gemini",
                    type: "function",
                    function: {
                      name: "Read",
                      arguments: '{"file_path":"README.md"}',
                    },
                    extra_content: {
                      google: { thought_signature: "opaque-signature" },
                    },
                  },
                ],
              },
            },
          ],
        })}\n\n`,
      );
      response.write(
        `data: ${JSON.stringify({
          choices: [{ delta: { role: "assistant" }, finish_reason: "stop" }],
        })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    });
    try {
      const gateway = new OpenAiCompatibleGateway({
        baseUrl: server.url,
        fetch: server.fetch,
        apiKey: "test-key",
        model: "gemini-3.8-flash",
        provider: "gemini",
      });
      const events = await Array.fromAsync(
        gateway.stream(request, new AbortController().signal),
      );

      expect(events).toEqual([
        {
          type: "tool_call",
          call: {
            id: "call_gemini",
            name: "Read",
            arguments: '{"file_path":"README.md"}',
            extraContent: {
              google: { thought_signature: "opaque-signature" },
            },
          },
        },
        { type: "finish", reason: "stop" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("adapts Gemini schemas and preserves tool-call metadata", async () => {
    const schema = {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        uri: { type: "string", format: "uri", default: "https://example.com" },
      },
    };
    const adapted = adaptToolDefinitionsForProvider(
      [
        {
          type: "function" as const,
          function: {
            name: "Fetch",
            description: "fetch",
            parameters: schema,
          },
        },
      ],
      "gemini",
    );
    expect(adapted[0]?.function.parameters).toEqual({
      type: "object",
      properties: { uri: { type: "string" } },
    });
    expect(schema.properties.uri).toHaveProperty("format", "uri");

    const server = await createFakeOpenAiServer();
    server.respond((response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    function: { name: "Fetch", arguments: { uri: "x" } },
                    extra_content: { google: { custom: true } },
                  },
                ],
              },
            },
          ],
        })}\n\n`,
      );
      response.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    extra_content: {
                      google: { thought_signature: "opaque-signature" },
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    });
    try {
      const gateway = new OpenAiCompatibleGateway({
        baseUrl: server.url,
        fetch: server.fetch,
        apiKey: "test-key",
        model: "gemini-3.8-flash",
        provider: "gemini",
      });
      const events = await Array.fromAsync(
        gateway.stream(
          {
            ...request,
            model: "gemini-3.8-flash",
            tools: [
              {
                type: "function",
                function: {
                  name: "Fetch",
                  description: "fetch",
                  parameters: schema,
                },
              },
            ],
          },
          new AbortController().signal,
        ),
      );
      expect(server.requests[0]?.body.tools).toEqual(adapted);
      expect(events).toEqual([
        {
          type: "tool_call",
          call: {
            id: "call_1",
            name: "Fetch",
            arguments: '{"uri":"x"}',
            extraContent: {
              google: { custom: true, thought_signature: "opaque-signature" },
            },
          },
        },
        { type: "finish", reason: "tool_calls" },
      ]);
    } finally {
      await server.close();
    }
  });

  it("redacts provider failures", async () => {
    const server = await createFakeOpenAiServer();
    server.respond((response) => {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "invalid test-key" } }));
    });
    try {
      const gateway = new OpenAiCompatibleGateway({
        baseUrl: server.url,
        fetch: server.fetch,
        apiKey: "test-key",
        model: "minder-test",
      });
      await expect(
        Array.fromAsync(gateway.stream(request, new AbortController().signal)),
      ).rejects.toMatchObject({ code: "provider" });
      await expect(
        Array.fromAsync(gateway.stream(request, new AbortController().signal)),
      ).rejects.not.toThrow("test-key");
    } finally {
      await server.close();
    }
  });

  it("preserves Gemini array error details while redacting the API key", async () => {
    const server = await createFakeOpenAiServer();
    server.respond((response) => {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify([
          { error: { message: "Invalid tool request\ncredential test-key" } },
        ]),
      );
    });
    try {
      const gateway = new OpenAiCompatibleGateway({
        baseUrl: server.url,
        fetch: server.fetch,
        apiKey: "test-key",
        model: "minder-test",
      });
      await expect(
        Array.fromAsync(gateway.stream(request, new AbortController().signal)),
      ).rejects.toMatchObject({
        code: "provider",
        message:
          "Provider rejected the request (HTTP 400). Invalid tool request credential [redacted]",
      });
    } finally {
      await server.close();
    }
  });

  it("normalizes malformed JSON and an incomplete stream", async () => {
    const malformed = await createFakeOpenAiServer();
    malformed.respond((response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end("data: {not-json}\n\ndata: [DONE]\n\n");
    });
    try {
      const gateway = new OpenAiCompatibleGateway({
        baseUrl: malformed.url,
        fetch: malformed.fetch,
        apiKey: "test-key",
        model: "minder-test",
      });
      await expect(
        Array.fromAsync(gateway.stream(request, new AbortController().signal)),
      ).rejects.toMatchObject({ code: "stream" });
    } finally {
      await malformed.close();
    }

    const incomplete = await createFakeOpenAiServer();
    incomplete.respond((response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
    });
    try {
      const gateway = new OpenAiCompatibleGateway({
        baseUrl: incomplete.url,
        fetch: incomplete.fetch,
        apiKey: "test-key",
        model: "minder-test",
      });
      await expect(
        Array.fromAsync(gateway.stream(request, new AbortController().signal)),
      ).rejects.toMatchObject({ code: "stream" });
    } finally {
      await incomplete.close();
    }
  });

  it("maps an aborted provider request to a safe transport error", async () => {
    const server = await createFakeOpenAiServer();
    server.respond((response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("data: ");
    });
    try {
      const controller = new AbortController();
      const gateway = new OpenAiCompatibleGateway({
        baseUrl: server.url,
        fetch: server.fetch,
        apiKey: "test-key",
        model: "minder-test",
      });
      const consuming = Array.fromAsync(
        gateway.stream(request, controller.signal),
      );
      await waitForRequest(server);
      controller.abort();
      await expect(consuming).rejects.toMatchObject({
        code: "transport",
        message: "Provider request was interrupted.",
      } satisfies Partial<ProviderError>);
    } finally {
      await server.close();
    }
  });
});
