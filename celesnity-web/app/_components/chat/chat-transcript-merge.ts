import type { ChatTranscriptMessage } from '@/src/entities/models/chat';
import type { DisplayMessage } from './types';

/** The shape `mergeTranscriptMessages` actually reads — looser than the full
 *  `ChatSession`, so `useChatConversation`'s local-state conversations (which
 *  have no `roomId`/`title`/`databaseName`) can call it too. */
export interface MergeableSession {
  readonly id: string;
  readonly messages: readonly DisplayMessage[];
}

const LEGACY_SKILLS_CONTEXT_PREFIX =
  'You are helping the user author reusable agent skills from the Skills page. ' +
  'Help them design, create, edit, or delete project skills using the skill tools. ' +
  'Call list_skills first to see what already exists and to match the house style.\n\n';

function sanitizeTranscriptContent(content: string): string {
  return content.startsWith(LEGACY_SKILLS_CONTEXT_PREFIX)
    ? content.slice(LEGACY_SKILLS_CONTEXT_PREFIX.length)
    : content;
}

/** What minder-agent puts between the text of two model calls of one run. */
const TURN_BREAK = '\n\n';

/**
 * One run answers one user message, but the stored transcript is the model's
 * raw conversation: every model call in that run is its own assistant entry —
 * the sentence said before a tool call, an entry that only carried tool calls
 * and has no text, then the answer. Read back one to one, a reply became two
 * or three messages, each with its own copy and regenerate row, and the runs
 * in the room history (one per user message) drifted onto the wrong entries.
 * Folding the entries between two user messages into one keeps a reply one
 * message, joined the way the agent joins the run's own `response_text`.
 */
function foldAssistantTurns(
  transcript: readonly ChatTranscriptMessage[],
): readonly ChatTranscriptMessage[] {
  const folded: ChatTranscriptMessage[] = [];
  for (const message of transcript) {
    const last = folded[folded.length - 1];
    if (message.role !== 'assistant' || last?.role !== 'assistant') {
      folded.push(message);
      continue;
    }
    folded[folded.length - 1] = {
      role: 'assistant',
      content: joinTurns(last.content, message.content),
      reasoning: joinTurns(last.reasoning ?? '', message.reasoning ?? '') || null,
    };
  }
  return folded;
}

function joinTurns(head: string, tail: string): string {
  if (!head) return tail;
  if (!tail) return head;
  return head.endsWith(TURN_BREAK) ? `${head}${tail}` : `${head}${TURN_BREAK}${tail}`;
}

// Moved verbatim from chat-screen.tsx (was module-private there); only the
// parameter type changed, from `ChatSession` to `MergeableSession`.
export function mergeTranscriptMessages(
  session: MergeableSession,
  transcript: readonly ChatTranscriptMessage[],
): readonly DisplayMessage[] {
  const recovered = foldAssistantTurns(transcript).filter(
    (message) => message.role === 'user' || (message.role === 'assistant' && message.content),
  );
  if (recovered.length === 0) return session.messages;

  const localUsers = session.messages.filter((message) => message.role === 'user');
  const localAssistants = session.messages.filter((message) => message.role === 'assistant');
  const usedLocalIds = new Set<string>();
  let userIndex = 0;
  let assistantIndex = 0;
  const messages: DisplayMessage[] = [];

  for (const message of recovered) {
    if (message.role === 'user') {
      const content = sanitizeTranscriptContent(message.content);
      const local = localUsers[userIndex];
      userIndex += 1;
      if (local) usedLocalIds.add(local.id);
      messages.push(
        local
          ? { ...local, content }
          : {
              id: `${session.id}-user-${userIndex}`,
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
            },
      );
      continue;
    }

    const local = localAssistants[assistantIndex];
    assistantIndex += 1;
    if (local) usedLocalIds.add(local.id);
    messages.push(
      local
        ? { ...local, content: message.content, reasoning: message.reasoning ?? local.reasoning }
        : {
            id: `${session.id}-assistant-${assistantIndex}`,
            role: 'assistant',
            content: message.content,
            reasoning: message.reasoning ?? undefined,
            timestamp: new Date().toISOString(),
          },
    );
  }

  // Keep messages that are not committed yet (for example, an offline queued
  // user message) instead of letting the authoritative transcript hide them.
  return [
    ...messages,
    ...session.messages.filter((message) => !usedLocalIds.has(message.id) && message.pending),
  ];
}
