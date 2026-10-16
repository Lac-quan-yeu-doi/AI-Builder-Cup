import type { WorkspaceChange } from '@/src/entities/models/workspace-tree';
import type { ChangeKind } from '@/src/entities/models/workspace-tree';

import type {
  ApplicationStateUpdate,
  ChatAskUserRequest,
  ChatPendingApproval,
  ChatQuestionOption,
  ClientToolCallRequest,
  TokenUsageDelta,
} from '@/src/entities/models/chat';

const SET_APPLICATION_STATE_TOOL = 'SetApplicationState';

/**
 * Reads a room's SSE stream from minder-agent (`GET /rooms/{id}/events`).
 *
 * Room events are durable run-event frames and may be replayed after a page
 * reload or reconnect. Each carries its own `run_id` because the room stream
 * interleaves every run in the room. The parser exposes every event through
 * `onEvent`, while the specialized callbacks keep live UI updates convenient.
 *
 * Message blocks (charts/tables/etc. from the `publish_message_block` tool)
 * do not arrive here — they're fetched/subscribed separately from
 * celesnity-core (see `open-message-block-channel` wiring in
 * chat-screen.tsx), which is the only place the tool's full payload
 * durably lands.
 */

/**
 * Thrown when the underlying ReadableStream encounters a network error.
 * Callers should catch this to trigger reconnection logic.
 */
export class StreamDisconnectedError extends Error {
  public constructor(message: string, originalError?: unknown) {
    super(message, { cause: originalError });
    this.name = 'StreamDisconnectedError';
  }
}

export interface ToolEvent {
  readonly runId: string;
  readonly id: string;
  /** `null` on `tool_finished` — the backend doesn't repeat the name. */
  readonly name: string | null;
  readonly status: 'running' | 'done' | 'failed';
  /** Only on `tool_started`, which is the one frame that carries them. */
  readonly arguments?: Readonly<Record<string, unknown>>;
}

export type { WorkspaceChange };

export interface ParseSseCallbacks {
  readonly onChunk: (runId: string, text: string) => void;
  /** Final response emitted by minder-agent's terminal `done` event. */
  readonly onCompletedResponse?: (runId: string, text: string) => void;
  readonly onReasoning?: (runId: string, text: string) => void;
  readonly onToolEvent?: (event: ToolEvent) => void;
  readonly onEvent?: (
    runId: string,
    event: { readonly type: string; readonly data?: unknown },
    seq?: string,
  ) => void;
  readonly onTokenUsage?: (runId: string, delta: TokenUsageDelta) => void;
  readonly onContextUsagePct?: (runId: string, pct: number) => void;
  readonly onAwaitingInput?: (runId: string, request: ChatAskUserRequest) => void;
  readonly onAwaitingApproval?: (runId: string, request: ChatPendingApproval) => void;
  readonly onClientToolCall?: (runId: string, call: ClientToolCallRequest) => void;
  /**
   * Fired from `SetApplicationState`'s own `tool_started` args — the room
   * stream carries no dedicated "state changed" event, so this is a
   * best-effort live signal, not a durable read. A page reload does not
   * recover variables set before the reload.
   */
  readonly onApplicationStateSet?: (runId: string, update: ApplicationStateUpdate) => void;
  readonly onWorkspaceChanged?: (runId: string, changes: readonly WorkspaceChange[]) => void;
  readonly onRunFinished?: (runId: string, status: string) => void;
  /** Called with the SSE `id:` field whenever a frame carries one. Use for
   *  sequence tracking so reconnection can resume via `after_seq`. */
  readonly onSeq?: (seq: string) => void;
}

export async function parseSseStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  callbacks: ParseSseCallbacks,
  defaultRunId?: string,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal.aborted) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (err: unknown) {
        // If the signal was already aborted, treat as intentional teardown.
        if (signal.aborted) break;
        // Network interruption — bubble up as a typed error for the caller
        // to decide whether to reconnect.
        throw new StreamDisconnectedError(
          err instanceof Error ? err.message : 'Input stream interrupted',
          err,
        );
      }

      if (result.done) break;

      buffer += decoder.decode(result.value, { stream: true });

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        processFrame(frame, callbacks, defaultRunId);
      }
    }

    // A server/proxy may close immediately after the last SSE record without
    // writing the optional second newline. Treat the remaining bytes as one
    // final frame instead of silently dropping the assistant response.
    buffer += decoder.decode();
    processFrame(buffer, callbacks, defaultRunId);
  } finally {
    reader.releaseLock();
  }
}

function processFrame(frame: string, callbacks: ParseSseCallbacks, defaultRunId?: string): void {
  if (!frame.trim()) return;
  const { event, data, id } = splitFrame(frame);
  if (id) callbacks.onSeq?.(id);
  if (event && data) handleFrame(event, data, callbacks, defaultRunId, id);
}

function splitFrame(frame: string): { event?: string; data?: string; id?: string } {
  let event: string | undefined;
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.startsWith('data: ') ? line.slice(6) : line.slice(5));
    } else if (line.startsWith('id:')) {
      id = line.slice(3).trim();
    }
  }
  const data = dataLines.join('\n');
  return { event, data: data || undefined, id };
}

function handleFrame(
  event: string,
  data: string,
  callbacks: ParseSseCallbacks,
  defaultRunId?: string,
  seq?: string,
): void {
  const payload = tryParseJson(data);
  if (!payload) return;
  if (event === 'stream_opened') return;

  const runId = stringField(payload, 'run_id') ?? defaultRunId ?? null;
  if (runId) {
    callbacks.onEvent?.(
      runId,
      {
        type: event,
        ...(Object.prototype.hasOwnProperty.call(payload, 'data') ? { data: payload['data'] } : {}),
      },
      seq,
    );
  }

  switch (event) {
    case 'text': {
      const text = payload['data'];
      if (runId && typeof text === 'string') callbacks.onChunk(runId, text);
      return;
    }
    case 'done': {
      const done = asRecord(payload['data']);
      const text = done?.['response_text'];
      if (runId && typeof text === 'string') callbacks.onCompletedResponse?.(runId, text);
      return;
    }
    case 'reasoning': {
      const text = payload['data'];
      if (runId && typeof text === 'string') callbacks.onReasoning?.(runId, text);
      return;
    }
    case 'tool_started': {
      const tool = asRecord(payload['data']);
      if (runId && tool) {
        const name = typeof tool['name'] === 'string' ? tool['name'] : null;
        const args = asRecord(tool['arguments'] ?? tool['args']);
        callbacks.onToolEvent?.({
          runId,
          id: String(tool['id'] ?? ''),
          name,
          status: 'running',
          ...(args ? { arguments: args } : {}),
        });
        if (name === SET_APPLICATION_STATE_TOOL) {
          const update = mapApplicationStateUpdate(tool['arguments'] ?? tool['args']);
          if (update) callbacks.onApplicationStateSet?.(runId, update);
        }
      }
      return;
    }
    case 'tool_finished': {
      const tool = asRecord(payload['data']);
      if (runId && tool) {
        callbacks.onToolEvent?.({
          runId,
          id: String(tool['id'] ?? ''),
          name: null,
          status:
            tool['ok'] === false || tool['success'] === false || tool['is_error'] === true
              ? 'failed'
              : 'done',
        });
      }
      return;
    }
    case 'token_usage': {
      const usage = asRecord(payload['data']);
      if (runId && usage) {
        const input = typeof usage['input'] === 'number' ? usage['input'] : 0;
        const output = typeof usage['output'] === 'number' ? usage['output'] : 0;
        callbacks.onTokenUsage?.(runId, { input, output });
      }
      return;
    }
    case 'context_usage': {
      const pct = payload['data'];
      if (runId && typeof pct === 'number') callbacks.onContextUsagePct?.(runId, pct);
      return;
    }
    case 'awaiting_input': {
      const request = asRecord(payload['data']);
      if (runId && request) callbacks.onAwaitingInput?.(runId, mapAskUserRequest(request));
      return;
    }
    case 'awaiting_approval': {
      const request = asRecord(payload['data']);
      const mapped = request ? mapPendingApproval(request) : null;
      if (runId && mapped) callbacks.onAwaitingApproval?.(runId, mapped);
      return;
    }
    // minder-agent pauses with `awaiting_client_tool`; the older name stays
    // accepted so a replayed room from before the rename still resolves.
    case 'awaiting_client_tool':
    case 'client_tool_call': {
      const call = asRecord(payload['data']);
      if (runId && call) {
        const mapped = mapClientToolCallRequest(call);
        if (mapped) callbacks.onClientToolCall?.(runId, mapped);
      }
      return;
    }
    case 'workspace_changed': {
      const changes = mapWorkspaceChanges(payload['data']);
      if (runId && changes) callbacks.onWorkspaceChanged?.(runId, changes);
      return;
    }
    case 'run_finished': {
      const data = asRecord(payload['data']);
      const status = payload['status'] ?? data?.['status'];
      if (runId && typeof status === 'string') callbacks.onRunFinished?.(runId, status);
      return;
    }
    default:
      return;
  }
}

function mapWorkspaceChanges(raw: unknown): readonly WorkspaceChange[] | null {
  const data = asRecord(raw);
  if (!data || !Array.isArray(data['changes'])) return null;

  return data['changes']
    .map(mapWorkspaceChange)
    .filter((change): change is WorkspaceChange => change !== null);
}

function mapWorkspaceChange(raw: unknown): WorkspaceChange | null {
  const change = asRecord(raw);
  const path = change?.['rel_path'];
  const kind = change?.['kind'];
  if (typeof path !== 'string' || path.length === 0 || !isChangeKind(kind)) return null;
  return { path, kind };
}

function isChangeKind(value: unknown): value is ChangeKind {
  return value === 'created' || value === 'modified' || value === 'deleted';
}

function mapAskUserRequest(dto: Record<string, unknown>): ChatAskUserRequest {
  const rawOptions = Array.isArray(dto['options']) ? dto['options'] : [];
  return {
    question: typeof dto['question'] === 'string' ? dto['question'] : '',
    allowOther: dto['allow_other'] !== false,
    options: rawOptions
      .map(mapQuestionOption)
      .filter((option): option is ChatQuestionOption => option !== null),
  };
}

function mapPendingApproval(dto: Record<string, unknown>): ChatPendingApproval | null {
  const approvalId = dto['approval_id'];
  const action = dto['action'];
  const preview = dto['preview'];
  const expiresAt = dto['expires_at'];
  if (
    typeof approvalId !== 'string' ||
    typeof action !== 'string' ||
    typeof preview !== 'string' ||
    typeof expiresAt !== 'string'
  ) {
    return null;
  }
  return { approvalId, action, preview, expiresAt };
}

function mapClientToolCallRequest(dto: Record<string, unknown>): ClientToolCallRequest | null {
  if (typeof dto['id'] !== 'string' || typeof dto['name'] !== 'string') return null;
  const args = asRecord(dto['arguments']);
  return { id: dto['id'], name: dto['name'], arguments: args ?? {} };
}

function mapApplicationStateUpdate(raw: unknown): ApplicationStateUpdate | null {
  const args = asRecord(raw);
  if (!args || typeof args['name'] !== 'string') return null;
  return {
    name: args['name'],
    value: args['value'],
    visible: args['visible'] !== false,
  };
}

function mapQuestionOption(raw: unknown): ChatQuestionOption | null {
  const record = asRecord(raw);
  if (!record || typeof record['label'] !== 'string') return null;
  return {
    label: record['label'],
    description: typeof record['description'] === 'string' ? record['description'] : null,
  };
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
