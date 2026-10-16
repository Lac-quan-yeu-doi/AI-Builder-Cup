import type { ChatMessage } from "@application/shared/ports/index.js";
import type { InteractiveSession, SessionStore } from "./session.js";
import type { AskUserRequest } from "@domain/shared";

export class SessionStoreError extends Error {
  readonly code = "session_not_found" as const;

  constructor(id: string) {
    super(`Session ${id} was not found.`);
    this.name = "SessionStoreError";
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, MutableSession>();

  create(): InteractiveSession {
    const session: MutableSession = {
      id: crypto.randomUUID(),
      mode: "interactive",
      history: [],
      turns: 0,
    };
    this.sessions.set(session.id, session);
    return snapshot(session);
  }

  get(id: string): InteractiveSession | undefined {
    const session = this.sessions.get(id);
    return session ? snapshot(session) : undefined;
  }

  appendTurn(
    id: string,
    messages: readonly ChatMessage[],
    pending: AskUserRequest | null,
  ): InteractiveSession {
    const session = this.sessions.get(id);
    if (!session) throw new SessionStoreError(id);
    session.history = messages.map((message) => structuredClone(message));
    session.turns += 1;
    if (pending === null) delete session.pendingQuestion;
    else session.pendingQuestion = structuredClone(pending);
    return snapshot(session);
  }
}

interface MutableSession {
  id: string;
  mode: "interactive";
  history: ChatMessage[];
  pendingQuestion?: AskUserRequest;
  turns: number;
}

function snapshot(session: MutableSession): InteractiveSession {
  const base = {
    id: session.id,
    mode: session.mode,
    history: session.history.map((message) => structuredClone(message)),
    turns: session.turns,
  };
  return session.pendingQuestion === undefined
    ? base
    : { ...base, pendingQuestion: structuredClone(session.pendingQuestion) };
}
