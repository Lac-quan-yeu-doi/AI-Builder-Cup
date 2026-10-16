import { describe, expect, it } from "vitest";
import type { AgentEvent, AskUserRequest, RunOutcome } from "@domain/shared";

describe("Phase 1 public event contract", () => {
  it("uses Minder's adjacent snake_case envelope", () => {
    const events: AgentEvent[] = [
      { type: "reasoning", data: "inspect" },
      { type: "text", data: "answer" },
      { type: "token_usage", data: { input: 3, output: 2 } },
      { type: "done", data: null },
    ];
    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
  });

  it("keeps error data in the terminal outcome rather than an error event", () => {
    const outcome: RunOutcome = {
      status: "failed",
      text: "partial answer",
      error: {
        code: "provider",
        message: "Provider rejected the request (HTTP 401).",
      },
    };
    expect(outcome.error?.code).toBe("provider");
  });

  it("serializes interactive tool and question events", () => {
    const question: AskUserRequest = {
      version: 1,
      kind: "choice",
      question: "Which database?",
      options: [
        { label: "Postgres", description: "Use the existing service." },
      ],
      allow_other: false,
    };
    const events: AgentEvent[] = [
      {
        type: "tool_started",
        data: {
          id: "call_1",
          name: "Read",
          arguments: { file_path: "README.md" },
        },
      },
      {
        type: "tool_finished",
        data: { id: "call_1", name: "Read", success: true },
      },
      {
        type: "tool_result",
        data: {
          id: "call_1",
          name: "Read",
          is_error: false,
          content: "content",
        },
      },
      { type: "awaiting_input", data: question },
    ];
    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
  });

  it("serializes an approval event without raw arguments or content", () => {
    const events: AgentEvent[] = [
      {
        type: "awaiting_approval",
        data: {
          approval_id: "approval-1",
          action: "Write",
          preview: "report.md",
          expires_at: "2026-09-15T00:05:00.000Z",
        },
      },
    ];

    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
  });

  it("serializes durable progress, workspace, and context events", () => {
    const events: AgentEvent[] = [
      {
        type: "tool_progress",
        data: {
          id: "call_1",
          kind: "searching",
          payload: { path: "reports/out.md" },
        },
      },
      {
        type: "workspace_changed",
        data: {
          changes: [{ rel_path: "reports/out.md", kind: "created" }],
        },
      },
      { type: "context_usage", data: 72.5 },
    ];

    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
  });
});
