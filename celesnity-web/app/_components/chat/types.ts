import type { ResolvedCitationViewModel } from '@/src/interface-adapters/presenters/citation.presenter';
import type { ChatAskUserRequest, ChatPendingApproval } from '@/src/entities/models/chat';
import type { FriendlyRunError } from './activity-display';

export interface ToolActivity {
  readonly id: string;
  readonly name: string;
  readonly status: 'running' | 'done' | 'failed';
  /** What the call was made with — the table, path or query the row names. */
  readonly arguments?: Readonly<Record<string, unknown>>;
  /** How far the reply had streamed when the call started; see `text-anchor.ts`. */
  readonly textOffset?: number;
  /** The tail of the reply at that moment, so the result lands after the sentence that announced it. */
  readonly textAnchor?: string;
}

export interface ChatEventTrace {
  readonly seq: number;
  readonly type: string;
  readonly data?: unknown;
}

export interface MessageBlock {
  readonly id: string;
  readonly runId: string | null;
  readonly blockType: 'text' | 'markdown' | 'image' | 'file' | 'chart' | 'table' | 'document';
  readonly payload: Record<string, unknown>;
  readonly fallbackText: string;
  /** Present on blocks that came from Core; absent on locally built ones. */
  readonly publishedAt?: string;
}

export interface DisplayMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string;
  readonly toolActivity?: readonly ToolActivity[];
  /** Durable run events used to restore the inline execution history. */
  readonly eventTrace?: readonly ChatEventTrace[];
  readonly reasoning?: string;
  readonly runFailed?: boolean;
  /** A safe, user-facing explanation for a failed run. */
  readonly runError?: FriendlyRunError;
  readonly runAwaitingInput?: boolean;
  /** The agent's durable question when it pauses this run for a user response. */
  readonly awaitingInput?: ChatAskUserRequest;
  readonly runAwaitingApproval?: boolean;
  /** The runtime approval request when an agent tool is paused for consent. */
  readonly awaitingApproval?: ChatPendingApproval;
  readonly runAwaitingPlan?: boolean;
  readonly awaitingPlan?: unknown;
  readonly runId?: string;
  readonly messageBlocks?: readonly MessageBlock[];
  /** When `true`, the message was queued while offline and has not yet been
   *  delivered to the server. The UI renders a pending indicator. */
  readonly pending?: boolean;
  /**
   * Citations resolved from this message's `<citation>` tags, keyed by
   * `citationKey()`. Resolved once (not on every render) and cached here so
   * switching away from and back to this conversation doesn't re-resolve —
   * this is in-memory only, not persisted across a page reload.
   */
  readonly resolvedCitations?: Readonly<Record<string, ResolvedCitationViewModel>>;
}

export interface ChatSession {
  readonly id: string;
  /** `null` until the first message creates the room. */
  readonly roomId: string | null;
  readonly title: string;
  /** Fixed for the lifetime of this room; switching agents starts a new chat. */
  readonly agentName: string | null;
  readonly messages: readonly DisplayMessage[];
  /**
   * The database this conversation asks about; `null` is the whole catalog.
   * Per conversation, not per message — a chat is about a subject.
   */
  readonly databaseName: string | null;
}
