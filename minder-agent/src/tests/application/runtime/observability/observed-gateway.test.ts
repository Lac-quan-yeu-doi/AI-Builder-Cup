import { describe, expect, it } from "vitest";
import type { ChatCompletionGateway } from "@application/shared/ports/index.js";
import { observeGateway } from "@application/runtime/observability/observed-gateway.js";

const request = {
  model: "test-model",
  messages: [{ role: "user" as const, content: "private prompt" }],
  stream: true as const,
};

describe("observed model gateway", () => {
  it("correlates a provider rejection without logging prompts or credentials", async () => {
    const entries: Record<string, unknown>[] = [];
    const gateway: ChatCompletionGateway = {
      async *stream() {
        yield* [];
        throw Object.assign(
          new Error(
            "Provider rejected the request (HTTP 400). invalid secret-key",
          ),
          {
            code: "provider",
          },
        );
      },
    };
    const observed = observeGateway(
      gateway,
      (entry) => entries.push(JSON.parse(entry) as Record<string, unknown>),
      { runId: "run-1", requestId: "request-1" },
      ["secret-key"],
    );

    await expect(
      Array.fromAsync(observed.stream(request, new AbortController().signal)),
    ).rejects.toThrow("HTTP 400");

    expect(entries.map((entry) => entry.event)).toEqual([
      "agent_provider_request_started",
      "agent_provider_request_failed",
    ]);
    expect(entries[1]).toMatchObject({
      runId: "run-1",
      requestId: "request-1",
      providerStatus: 400,
      errorCode: "provider",
      messageCount: 1,
      toolCount: 0,
    });
    expect(JSON.stringify(entries)).not.toContain("private prompt");
    expect(JSON.stringify(entries)).not.toContain("secret-key");
  });
});
