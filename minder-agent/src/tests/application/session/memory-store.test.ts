import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@infrastructure/ai";
import {
  InMemorySessionStore,
  SessionStoreError,
} from "@application/session/store.js";

describe("InMemorySessionStore", () => {
  it("creates an immutable interactive session and appends turns", () => {
    const store = new InMemorySessionStore();
    const created = store.create();
    const messages: ChatMessage[] = [{ role: "user", content: "hello" }];

    const saved = store.appendTurn(created.id, messages, null);
    messages[0] = { role: "user", content: "changed outside" };
    (saved.history as ChatMessage[]).push({
      role: "user",
      content: "mutated snapshot",
    });

    expect(saved).toMatchObject({
      id: created.id,
      mode: "interactive",
      turns: 1,
    });
    expect(store.get(created.id)?.history).toEqual([
      { role: "user", content: "hello" },
    ]);
    expect(store.get(created.id)?.pendingQuestion).toBeUndefined();
  });

  it("stores and clears a pending question without changing the session id", () => {
    const store = new InMemorySessionStore();
    const created = store.create();
    const question = {
      version: 1 as const,
      kind: "choice" as const,
      question: "Which database?",
      options: [{ label: "Postgres" }],
      allow_other: false,
    };

    const paused = store.appendTurn(created.id, [], question);
    const resumed = store.appendTurn(
      created.id,
      [{ role: "user", content: "Postgres" }],
      null,
    );

    expect(paused.pendingQuestion).toEqual(question);
    expect(resumed.id).toBe(created.id);
    expect(resumed.turns).toBe(2);
    expect(resumed.pendingQuestion).toBeUndefined();
  });

  it("rejects an unknown session instead of creating one", () => {
    const store = new InMemorySessionStore();
    expect(() => store.get("missing")).not.toThrow();
    expect(() => store.appendTurn("missing", [], null)).toThrow(
      SessionStoreError,
    );
  });
});
