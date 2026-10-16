import type { ChatMessage } from "@application/shared/ports/index.js";
import type { AskUserRequest } from "@domain/shared";

export interface InteractiveSession {
  readonly id: string;
  readonly mode: "interactive";
  readonly history: readonly ChatMessage[];
  readonly pendingQuestion?: AskUserRequest;
  readonly turns: number;
}

export interface SessionStore {
  create(): InteractiveSession;
  get(id: string): InteractiveSession | undefined;
  appendTurn(
    id: string,
    messages: readonly ChatMessage[],
    pending: AskUserRequest | null,
  ): InteractiveSession;
}
