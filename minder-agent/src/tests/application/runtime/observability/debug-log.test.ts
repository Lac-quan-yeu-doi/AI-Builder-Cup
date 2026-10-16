import { describe, expect, it } from "vitest";

import { writeAgentRunDebug } from "@application/runtime/observability/debug-log.js";

describe("agent run debug logging", () => {
  it("writes a structured, secret-safe terminal summary", () => {
    const entries: string[] = [];

    writeAgentRunDebug((entry) => entries.push(entry), {
      runId: "run-1",
      mode: "interactive",
      trigger: "room",
      manifestName: "skill-creator",
      provider: "gemini",
      model: "gemini-2.5-flash",
      status: "completed",
      sawDone: true,
      responseChars: 0,
      eventCounts: { done: 1, reasoning: 0, text: 0 },
    });

    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0] ?? "{}")).toMatchObject({
      event: "agent_run_summary",
      service: "celesnity-agent",
      level: "info",
      runId: "run-1",
      status: "completed",
      occurredAt: expect.any(String),
    });
  });

  it("records safe failure diagnostics without provider error text", () => {
    const entries: string[] = [];

    writeAgentRunDebug((entry) => entries.push(entry), {
      runId: "run-2",
      mode: "interactive",
      trigger: "room",
      status: "failed",
      sawDone: false,
      responseChars: 0,
      eventCounts: {},
      errorCode: "provider",
      errorCategory: "provider_auth",
    });

    expect(entries[0]).toContain('"status":"failed"');
    expect(entries[0]).toContain('"errorCategory":"provider_auth"');
    expect(entries[0]).not.toContain('"error":');
  });
});
