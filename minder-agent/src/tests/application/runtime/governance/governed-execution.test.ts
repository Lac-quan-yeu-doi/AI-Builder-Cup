import { describe, expect, it } from "vitest";
import {
  classifyRetryable,
  retryOperation,
  withTransientStreamRetries,
} from "@infrastructure/ai";
import { redactSecrets, summarizeToolAction } from "@application/runtime";

describe("governed execution helpers", () => {
  it("redacts credential patterns in strings and nested values", () => {
    const value = {
      output: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      nested: { password: "password=super-secret-value" },
    };

    const redacted = redactSecrets(value);

    expect(redacted).toEqual({
      output: "Authorization: [REDACTED]",
      nested: { password: "[REDACTED]" },
    });
  });

  it("classifies transient transport failures but not policy failures", () => {
    expect(
      classifyRetryable({ status: 503, message: "service unavailable" }),
    ).toMatchObject({
      retryable: true,
    });
    expect(
      classifyRetryable(new Error("connection reset by peer")),
    ).toMatchObject({
      retryable: true,
    });
    expect(
      classifyRetryable({ status: 403, message: "policy denied" }),
    ).toMatchObject({
      retryable: false,
    });
  });

  it("retries bounded transient operations but stops on policy errors", async () => {
    let attempts = 0;
    await expect(
      retryOperation(
        async () => {
          attempts += 1;
          if (attempts < 3)
            throw Object.assign(new Error("unavailable"), { status: 503 });
          return "ok";
        },
        { maxAttempts: 3, baseDelayMs: 0 },
      ),
    ).resolves.toBe("ok");
    expect(attempts).toBe(3);

    attempts = 0;
    await expect(
      retryOperation(
        async () => {
          attempts += 1;
          throw Object.assign(new Error("policy denied"), { status: 403 });
        },
        { maxAttempts: 3, baseDelayMs: 0 },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(attempts).toBe(1);
  });

  it("retries a model stream only when it failed before emitting output", async () => {
    let attempts = 0;
    const gateway = withTransientStreamRetries(
      {
        stream: async function* () {
          attempts += 1;
          if (attempts === 1)
            throw Object.assign(new Error("unavailable"), { status: 503 });
          yield { type: "text" as const, text: "ok" };
        },
      },
      { maxAttempts: 2, baseDelayMs: 0 },
    );
    const events = [];
    for await (const event of gateway.stream(
      {} as never,
      new AbortController().signal,
    ))
      events.push(event);
    expect(events).toEqual([{ type: "text", text: "ok" }]);
    expect(attempts).toBe(2);
  });

  it("summarizes tool actions without exposing arguments or full output", () => {
    const summary = summarizeToolAction(
      {
        name: "Write",
        arguments: { file_path: "report.md", password: "password=secret" },
        readOnly: false,
        destructive: true,
      },
      { success: true, output: "a".repeat(500), metadata: { duration_ms: 12 } },
    );

    expect(summary).toMatchObject({
      tool: "Write",
      status: "success",
      destructive: true,
      resultSize: 500,
      durationMs: 12,
    });
    expect(JSON.stringify(summary)).not.toContain("password=secret");
    expect(JSON.stringify(summary)).not.toContain("a".repeat(500));
  });
});
