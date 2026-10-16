import type { DisplayMessage, ChatEventTrace, ToolActivity } from './types';
import { runErrorFromEvent, toFriendlyRunError } from './activity-display';
import { textAnchorOf } from './text-anchor';
import type { ChatPendingApproval } from '@/src/entities/models/chat';

export interface ChatHistoryEvent {
  readonly seq: number;
  readonly payload: { readonly type: string; readonly data?: unknown };
}

export interface ChatHistoryRun {
  readonly runId: string;
  readonly sessionId: string;
  readonly input: string;
  readonly status: string;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly responseText: string;
  readonly events: readonly ChatHistoryEvent[];
}

export function hydrateChatRunHistory(
  messages: readonly DisplayMessage[],
  runs: readonly ChatHistoryRun[],
): readonly DisplayMessage[] {
  const next = messages.map((message) => ({ ...message }));
  const assistantIndexes = next.flatMap((message, index) =>
    message.role === 'assistant' ? [index] : [],
  );
  const usedAssistantIndexes = new Set<number>();

  for (const run of [...runs].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )) {
    const targetIndex = findTargetAssistant(
      next,
      run.runId,
      assistantIndexes,
      usedAssistantIndexes,
    );
    if (targetIndex === undefined) {
      next.push(
        applyRunHistory(
          {
            id: `restored-assistant-${run.runId}`,
            role: 'assistant',
            content: '',
            timestamp: run.createdAt,
          },
          run,
        ),
      );
      continue;
    }
    usedAssistantIndexes.add(targetIndex);
    next[targetIndex] = applyRunHistory(next[targetIndex]!, run);
  }

  return next;
}

function findTargetAssistant(
  messages: readonly DisplayMessage[],
  runId: string,
  assistantIndexes: readonly number[],
  usedAssistantIndexes: ReadonlySet<number>,
): number | undefined {
  const explicit = assistantIndexes.find((index) => messages[index]?.runId === runId);
  if (explicit !== undefined) return explicit;
  return assistantIndexes.find(
    (index) => !usedAssistantIndexes.has(index) && !messages[index]?.runId,
  );
}

function applyRunHistory(message: DisplayMessage, run: ChatHistoryRun): DisplayMessage {
  const tools = new Map<string, ToolActivity>(
    (message.toolActivity ?? []).map((tool) => [tool.id, tool]),
  );
  const trace = new Map<number, ChatEventTrace>(
    (message.eventTrace ?? []).map((event) => [event.seq, event]),
  );
  let reasoning = message.reasoning ?? '';
  let streamedText = '';
  let runError = message.runError;
  let awaitingApproval: ChatPendingApproval | undefined;

  for (const event of [...run.events].sort((left, right) => left.seq - right.seq)) {
    const data = asRecord(event.payload.data);
    trace.set(event.seq, {
      seq: event.seq,
      type: event.payload.type,
      ...(event.payload.data === undefined ? {} : { data: event.payload.data }),
    });
    if (event.payload.type === 'reasoning' && typeof event.payload.data === 'string') {
      reasoning += event.payload.data;
    } else if (event.payload.type === 'text' && typeof event.payload.data === 'string') {
      streamedText += event.payload.data;
    } else if (event.payload.type === 'tool_started' && data) {
      const id = stringField(data, 'id');
      const name = stringField(data, 'name');
      const args = asRecord(data['arguments']);
      // The events come in stream order, so the text collected so far is the
      // prose that preceded the call — the same pin the live turn recorded.
      if (id && name) {
        tools.set(id, {
          id,
          name,
          status: 'running',
          arguments: args,
          textOffset: streamedText.length,
          textAnchor: textAnchorOf(streamedText),
        });
      }
    } else if (event.payload.type === 'tool_finished' && data) {
      const id = stringField(data, 'id');
      if (id) {
        const current = tools.get(id);
        tools.set(id, {
          ...current,
          id,
          name: current?.name ?? stringField(data, 'name') ?? 'tool',
          status: data['success'] === false ? 'failed' : 'done',
          arguments: current?.arguments,
        });
      }
    } else if (event.payload.type === 'tool_result' && data) {
      const id = stringField(data, 'id');
      if (id) {
        const current = tools.get(id);
        tools.set(id, {
          ...current,
          id,
          name: current?.name ?? stringField(data, 'name') ?? 'tool',
          status: data['is_error'] === true ? 'failed' : (current?.status ?? 'done'),
          arguments: current?.arguments,
        });
      }
    } else if (event.payload.type === 'awaiting_approval' && data) {
      awaitingApproval = toPendingApproval(data, run.runId);
    }
    runError = runError ?? runErrorFromEvent(event.payload.type, event.payload.data);
  }

  const responseContainsTechnicalGovernanceError = run.responseText
    .toLowerCase()
    .includes('governance policy unavailable');
  const content = responseContainsTechnicalGovernanceError
    ? message.content
    : run.responseText || streamedText || message.content;
  if (!runError && (run.status === 'failed' || run.status === 'interrupted')) {
    runError = toFriendlyRunError(
      run.responseText.includes('governance policy unavailable') ? run.responseText : undefined,
    );
  }
  return {
    ...message,
    runId: run.runId,
    // A message recovered from the transcript was stamped with the reload
    // time; the run knows when the answer actually landed.
    ...(message.runId === run.runId ? {} : { timestamp: run.finishedAt ?? run.createdAt }),
    content,
    ...(reasoning ? { reasoning } : {}),
    ...(tools.size > 0 ? { toolActivity: [...tools.values()] } : {}),
    ...(trace.size > 0 ? { eventTrace: [...trace.values()].sort((a, b) => a.seq - b.seq) } : {}),
    ...(run.status === 'failed' || run.status === 'interrupted' ? { runFailed: true } : {}),
    ...(run.status === 'awaiting_approval' && awaitingApproval !== undefined
      ? { runAwaitingApproval: true, awaitingApproval }
      : {}),
    ...(runError ? { runError } : {}),
  };
}

function toPendingApproval(
  data: Record<string, unknown>,
  runId: string,
): ChatPendingApproval | undefined {
  const approvalId = stringField(data, 'approval_id');
  const action = stringField(data, 'action');
  const preview = stringField(data, 'preview');
  const expiresAt = stringField(data, 'expires_at');
  if (!approvalId || !action || !preview || !expiresAt) return undefined;
  return { runId, approvalId, action, preview, expiresAt };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === 'string' ? record[key] : undefined;
}
