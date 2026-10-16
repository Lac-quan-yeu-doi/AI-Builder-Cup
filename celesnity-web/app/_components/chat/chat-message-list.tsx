'use client';

import type { RefObject } from 'react';

import { ChartIcon, FileTextIcon } from '@/app/_components/ui/icons';
import { Bubble, BubbleContent } from '@/app/_components/ui/bubble';
import { Button } from '@/app/_components/ui/button';
import { Message, MessageContent } from '@/app/_components/ui/message';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/app/_components/ui/message-scroller';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { DisplayMessage, MessageBlock } from '@/app/_components/chat/types';
import type { ChatApprovalDecision } from '@/src/entities/models/chat';
import type { ResolvedCitationViewModel } from '@/src/interface-adapters/presenters/citation.presenter';
import type { ResolveCitationsController } from '@/src/interface-adapters/controllers/citations/resolve-citations.controller';
import type { ApprovePendingActionController } from '@/src/interface-adapters/controllers/pending-actions/approve-pending-action.controller';
import type { ListPendingActionsController } from '@/src/interface-adapters/controllers/pending-actions/list-pending-actions.controller';
import type { RejectPendingActionController } from '@/src/interface-adapters/controllers/pending-actions/reject-pending-action.controller';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';

import { AssistantMessageMarkdown } from './assistant-message-markdown';
import { InlineMessageBlock } from './inline-message-block';
import { ChartCardSkeleton, chartSlots, pendingChartCount } from './chart-card-skeleton';
import type { MarkdownInsert } from './chat-markdown';
import { InlineReasoning } from './inline-reasoning';
import { MessageActions } from './message-actions';
import { PendingActionsForRun } from './pending-action-card';
import { AgentApprovalCard } from './agent-approval-card';
import { RunErrorCard } from './run-error-card';
import { ThinkingStatus } from './thinking-status';
import { GrowIn } from '@/app/_components/ui/grow-in';
import { READING_COLUMN } from './reading-column';
import { parseSystemReminderContent } from './system-reminder';

interface ChatMessageListProps {
  readonly messages: readonly DisplayMessage[];
  readonly isStreaming: boolean;
  readonly messageRowRefs: RefObject<Map<string, HTMLDivElement>>;
  readonly resolveCitations: ResolveCitationsController;
  readonly onCitationsResolved: (
    messageId: string,
    citations: Readonly<Record<string, ResolvedCitationViewModel>>,
  ) => void;
  readonly onCitationClick: (citation: ResolvedCitationViewModel) => void;
  readonly onSuggestionSelect: (text: string) => void;
  readonly onInspectRun: (runId: string) => void;
  readonly listPendingActions: ListPendingActionsController;
  readonly approvePendingAction: ApprovePendingActionController;
  readonly rejectPendingAction: RejectPendingActionController;
  readonly onApprovalDecision?: (
    runId: string,
    approvalId: string,
    decision: ChatApprovalDecision,
  ) => Promise<void>;
  readonly onRetryRun?: (messageId: string) => void;
  /** Asks for the newest answer again, in place; the question is not re-sent. */
  readonly onRegenerate?: (messageId: string) => void;
  readonly onReasoningOpen?: () => void;
  readonly suppressRunPendingActions?: boolean;
  readonly renderer?: ChartRenderer;
  /** Present only where there is a stage to open an artifact onto. */
  readonly onOpenArtifact?: (block: MessageBlock, placement?: 'right') => void;
  /** Artifact ids with a pane on the stage right now, so a card can say so. */
  readonly openArtifactIds?: ReadonlySet<string>;
  /**
   * Extra room inside the scroll area, for a surface whose chrome floats over
   * the transcript. The default is the plain gutter every scroller wants; a
   * caller with a floating header asks for enough to clear it.
   */
  readonly contentClassName?: string;
}

/**
 * The conversation transcript, translated from
 * `.reference/app/design-system/chat/workspace.tsx`'s message-scroller block
 * (lines 556-613) onto `Message`/`Bubble`/`MessageScroller`. Extracted from
 * `chat-screen.tsx`, whose transcript-rendering block this reproduces
 * verbatim below the outer wrapper — same conditionals, same callbacks, same
 * per-message state (`producedNothing`, streaming detection, citation
 * resolution, suggestion gating) — only the surrounding markup changed.
 */
export function ChatMessageList({
  messages,
  isStreaming,
  messageRowRefs,
  resolveCitations,
  onCitationsResolved,
  onCitationClick,
  onSuggestionSelect,
  onInspectRun,
  listPendingActions,
  approvePendingAction,
  rejectPendingAction,
  onApprovalDecision,
  onRetryRun,
  onRegenerate,
  onReasoningOpen,
  suppressRunPendingActions = false,
  renderer,
  onOpenArtifact,
  openArtifactIds,
  contentClassName,
}: ChatMessageListProps) {
  const { t } = useTranslation();
  const lastMsg = messages[messages.length - 1];
  const newestApprovalMessageId = messages.reduce<string | undefined>(
    (newest, message) =>
      message.runAwaitingApproval && message.awaitingApproval ? message.id : newest,
    undefined,
  );
  const isStreamingEmpty = isStreaming && lastMsg?.role === 'assistant' && !lastMsg.content;
  const entries = buildEntries(messages);
  const newestQuestionId = messages.reduce<string | undefined>(
    (newest, message) => (message.role === 'user' ? message.id : newest),
    undefined,
  );

  /* The newest question is the scroll anchor: when it arrives the scroller
     brings it to the top once, holds a spacer under it for the answer to
     stream into, and leaves the view alone until the reader scrolls. Only
     the newest one — the scroller also jumps to any anchor it has not handled
     yet, so marking every question would send a reopened conversation back
     to its first message on the next re-render.

     `autoScroll` is on only while nothing streams. Rows render lazily, so a
     reopened conversation needs a few follow-the-bottom passes to land on
     its real end. During a turn it stays off: with it on, the scroller
     starts following the bottom the moment the answer fills the reserved
     space, which is exactly the creeping view this layout is meant to end.

     `scroll-smooth` makes the one move to the question glide: the scroller
     scrolls with `behavior: 'auto'`, which defers to the CSS property. Only
     while a turn streams, though — a reopened conversation should land on
     its end at once, not glide through its whole history. */
  return (
    <MessageScrollerProvider
      autoScroll={!isStreaming}
      defaultScrollPosition="end"
      scrollPreviousItemPeek={0}
    >
      <MessageScroller className="h-full">
        <MessageScrollerViewport
          className={cn('h-full', isStreaming && 'motion-safe:scroll-smooth')}
        >
          {/* The gutter belongs inside the scroller, not on the wrapper around
              it. Outside, it only moves where the viewport starts: the first
              message still begins exactly on the clip edge, so its bubble reads
              as sliced off, and every message scrolls into that same hard line.
              Inside, nothing ever sits flush against the edge. */}
          <MessageScrollerContent
            className={cn(
              READING_COLUMN,
              /* Each side named on its own. A `py-*` shorthand here cannot be
                 overridden by a caller's unprefixed `pt-*`, because the `sm:`
                 half of the shorthand still wins at every width above sm. */
              'flex flex-col gap-3 pt-3 pb-3 sm:gap-4 sm:pt-4 sm:pb-4',
              contentClassName,
            )}
          >
            {entries.map((entry) => {
              if (entry.kind === 'system') {
                return (
                  <SystemUpdateRow
                    ids={entry.ids}
                    key={entry.ids[0]}
                    messageRowRefs={messageRowRefs}
                  />
                );
              }

              const msg = entry.message;
              if (isStreamingEmpty && msg === lastMsg) return null;

              if (msg.role === 'user') {
                return (
                  <MessageScrollerItem
                    key={msg.id}
                    messageId={msg.id}
                    scrollAnchor={msg.id === newestQuestionId}
                  >
                    <Message
                      align="end"
                      className="motion-safe:animate-message-in"
                      ref={(node: HTMLDivElement | null) => {
                        if (node) messageRowRefs.current.set(msg.id, node);
                        else messageRowRefs.current.delete(msg.id);
                      }}
                    >
                      <MessageContent>
                        <Bubble
                          align="end"
                          variant="secondary"
                          className={cn(msg.pending && 'opacity-70')}
                        >
                          <BubbleContent className="text-body-md leading-[1.6] whitespace-pre-wrap sm:px-4 sm:py-3">
                            <UserMessageContent content={msg.content} />
                          </BubbleContent>
                        </Bubble>
                        {msg.pending ? (
                          <span className="flex items-center gap-1.5 self-end pr-1 text-micro text-muted-foreground">
                            <svg
                              className="h-3 w-3 text-muted-foreground"
                              viewBox="0 0 16 16"
                              fill="none"
                              aria-label={t('chat.messagePending')}
                            >
                              <circle
                                cx="8"
                                cy="8"
                                r="6.5"
                                stroke="currentColor"
                                strokeWidth="1.2"
                              />
                              <path
                                d="M8 4.5v4l2.5 1.5"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            {t('chat.messagePending')}
                          </span>
                        ) : (
                          <MessageTime
                            className={cn(REVEALED_ON_HOVER, 'self-end pr-1')}
                            iso={msg.timestamp}
                          />
                        )}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                );
              }

              /*
               * A finished assistant turn that carries nothing at all: no
               * prose, no blocks, no reasoning, not one tool call. It renders
               * as a bare "Minder" heading with empty space under it, which
               * reads as the assistant having chosen to say nothing. It is
               * always a dropped run, and it survives a reload because the
               * empty turn is what got stored, so it has to be recognised from
               * the message rather than caught when the send fails.
               */
              const producedNothing =
                !msg.runId &&
                !msg.content &&
                (msg.messageBlocks ?? []).length === 0 &&
                (msg.toolActivity ?? []).length === 0 &&
                !msg.reasoning &&
                !msg.runAwaitingInput &&
                !msg.runAwaitingApproval &&
                !(isStreaming && msg.id === lastMsg?.id);
              const live = isStreaming && msg.id === lastMsg?.id;
              /*
               * A chart rides the prose: it is placed just after the sentence
               * that announced its preview call, and while the call runs a
               * placeholder of the card's size holds that spot (see
               * `chartSlots` and `text-anchor.ts`). Only a turn with no prose
               * at all keeps its charts in the block column below.
               */
              const slots = chartSlots(msg.toolActivity ?? [], msg.messageBlocks ?? [], live);
              const inserts: readonly MarkdownInsert[] = msg.content
                ? slots.map((slot) => {
                    const open =
                      slot.block !== undefined && openArtifactIds?.has(`block:${slot.block.id}`);
                    return {
                      key:
                        slot.block === undefined
                          ? slot.key
                          : `${slot.key}:${open ? 'open' : 'closed'}`,
                      ...(slot.anchor === undefined ? {} : { anchor: slot.anchor }),
                      ...(slot.offset === undefined ? {} : { offset: slot.offset }),
                      node:
                        slot.block === undefined ? (
                          <ChartCardSkeleton />
                        ) : (
                          <InlineMessageBlock
                            block={slot.block}
                            renderer={renderer}
                            onOpenArtifact={onOpenArtifact}
                            artifactOpen={open === true}
                          />
                        ),
                    };
                  })
                : [];
              const columnBlocks = (msg.messageBlocks ?? []).filter(
                (block) => !msg.content || block.blockType !== 'chart',
              );
              const pendingCharts =
                live && !msg.content
                  ? pendingChartCount(msg.toolActivity ?? [], msg.messageBlocks ?? [])
                  : 0;

              return (
                <MessageScrollerItem key={msg.id}>
                  <Message
                    className="motion-safe:animate-message-in"
                    ref={(node: HTMLDivElement | null) => {
                      if (node) messageRowRefs.current.set(msg.id, node);
                      else messageRowRefs.current.delete(msg.id);
                    }}
                  >
                    {/* The gutter sits on the content, not on the prose alone,
                        so the time and run-inspector row under an answer starts
                        on the same line as its text. */}
                    <MessageContent className="px-3 sm:px-4">
                      <div
                        data-assistant-turn="true"
                        className="flex min-w-0 w-full flex-col gap-2.5 text-body-md leading-[1.65] text-foreground"
                      >
                        {/* One owner for reasoning. It used to render twice:
                            once as a bare paragraph and again inside the
                            panel `InlineReasoning` opens, so expanding the
                            toggle showed the same text a second time. */}
                        <InlineReasoning
                          reasoning={msg.reasoning}
                          toolActivity={msg.toolActivity ?? []}
                          eventTrace={msg.eventTrace}
                          onOpen={onReasoningOpen}
                          growIn={isStreaming && msg.id === lastMsg?.id}
                        />
                        {/* On a live reply a block arrives above text already
                            on screen (a chart preview mid-answer), so it
                            grows into place instead of shoving the text. */}
                        {(columnBlocks.length > 0 || pendingCharts > 0) && (
                          <GrowIn active={live}>
                            <div className="flex min-w-0 w-full flex-col gap-2.5">
                              {columnBlocks.map((block) => (
                                <InlineMessageBlock
                                  key={block.id}
                                  block={block}
                                  renderer={renderer}
                                  onOpenArtifact={onOpenArtifact}
                                  artifactOpen={openArtifactIds?.has(`block:${block.id}`)}
                                  onSuggestionSelect={
                                    !isStreaming && msg.id === lastMsg?.id
                                      ? onSuggestionSelect
                                      : undefined
                                  }
                                />
                              ))}
                              {Array.from({ length: pendingCharts }, (_, index) => (
                                <ChartCardSkeleton key={`pending-chart-${index}`} />
                              ))}
                            </div>
                          </GrowIn>
                        )}
                        {msg.runId && !suppressRunPendingActions && (
                          <PendingActionsForRun
                            runId={msg.runId}
                            listPendingActions={listPendingActions}
                            approvePendingAction={approvePendingAction}
                            rejectPendingAction={rejectPendingAction}
                          />
                        )}
                        {msg.content && (
                          <AssistantMessageMarkdown
                            content={msg.content}
                            inserts={inserts}
                            resolvedCitations={msg.resolvedCitations}
                            active={isStreaming && msg.id === lastMsg?.id}
                            resolveCitations={resolveCitations}
                            onResolved={(citations) => onCitationsResolved(msg.id, citations)}
                            onCitationClick={onCitationClick}
                            onSuggestionSelect={
                              !isStreaming && msg.id === lastMsg?.id
                                ? onSuggestionSelect
                                : undefined
                            }
                          />
                        )}
                        {/* A reply now opens with a sentence and goes quiet
                            while the tools run. Without the card under it,
                            that sentence reads as the whole answer. */}
                        {msg.content && isStreaming && msg.id === lastMsg?.id && (
                          <div role="status" aria-live="polite" aria-atomic="false">
                            <ThinkingStatus tools={msg.toolActivity} steps={false} />
                          </div>
                        )}
                        {msg.awaitingInput && (
                          <div
                            role="status"
                            aria-live="polite"
                            className="flex w-full max-w-[56rem] flex-col gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 min-[481px]:px-4 min-[481px]:py-3"
                          >
                            <p className="m-0 whitespace-pre-wrap text-body-md leading-relaxed">
                              {msg.awaitingInput.question}
                            </p>
                            {msg.awaitingInput.options.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {msg.awaitingInput.options.map((option) => (
                                  <Button
                                    data-tutorial-target="chat-clarification-option"
                                    key={option.label}
                                    variant="outline"
                                    size="sm"
                                    disabled={isStreaming || msg.id !== lastMsg?.id}
                                    onClick={() => onSuggestionSelect(option.label)}
                                  >
                                    <span>{option.label}</span>
                                    {option.description && (
                                      <span className="text-xs font-normal text-muted-foreground">
                                        {option.description}
                                      </span>
                                    )}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {(msg.content || msg.runId) && (
                        <div
                          className={cn(
                            /* Tall enough for the action row from the start,
                               so its arrival when the reply finishes moves
                               nothing. */
                            'flex min-h-8 items-center gap-2',
                            /* The newest turn keeps its footer, the way ChatGPT
                               keeps its action row under the last answer: it is
                               the one somebody is still working with, and the
                               run inspector is the only way into a run. */
                            msg.id === lastMsg?.id ? 'opacity-100' : REVEALED_ON_HOVER,
                          )}
                        >
                          {msg.content && !(isStreaming && msg.id === lastMsg?.id) && (
                            <MessageActions
                              content={msg.content}
                              onRegenerate={
                                onRegenerate && msg.id === lastMsg?.id && !isStreaming
                                  ? () => onRegenerate(msg.id)
                                  : undefined
                              }
                            />
                          )}
                          {msg.content && <MessageTime iso={msg.timestamp} />}
                          {msg.runId && (
                            <button
                              type="button"
                              onClick={() => onInspectRun(msg.runId ?? '')}
                              aria-label={t('chat.runInspector.open')}
                              title={t('chat.runInspector.open')}
                              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
                            >
                              <svg
                                className="size-4.5"
                                viewBox="0 0 16 16"
                                fill="none"
                                aria-hidden="true"
                              >
                                <circle
                                  cx="8"
                                  cy="8"
                                  r="6.25"
                                  stroke="currentColor"
                                  strokeWidth="1.3"
                                />
                                <path
                                  d="M8 5.4v.01M8 7.4v3.2"
                                  stroke="currentColor"
                                  strokeWidth="1.3"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                      {msg.runError && msg.runError.code !== 'unknown' && (
                        <RunErrorCard
                          error={msg.runError}
                          onRetry={onRetryRun ? () => onRetryRun(msg.id) : undefined}
                        />
                      )}
                      {(!msg.runError || msg.runError.code === 'unknown') &&
                        (msg.runFailed || producedNothing) && (
                          <div
                            role="alert"
                            className="w-fit max-w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
                          >
                            {t('chat.runFailed')}
                          </div>
                        )}
                      {msg.runAwaitingInput && (
                        <div role="status" className="sr-only">
                          {t('chat.runAwaitingInput')}
                        </div>
                      )}
                      {msg.runAwaitingApproval &&
                        msg.awaitingApproval &&
                        msg.runId &&
                        msg.id === newestApprovalMessageId &&
                        onApprovalDecision && (
                          <AgentApprovalCard
                            approval={msg.awaitingApproval}
                            onDecide={(decision) =>
                              onApprovalDecision(
                                msg.runId!,
                                msg.awaitingApproval!.approvalId,
                                decision,
                              )
                            }
                          />
                        )}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              );
            })}

            {isStreamingEmpty && (
              <MessageScrollerItem>
                {/* The same column as an assistant turn, so the status card
                    and the answer that replaces it start on the same line. */}
                <Message role="status" aria-live="polite" aria-atomic="false">
                  <MessageContent>
                    <div className="flex w-full flex-col gap-2.5 px-3 sm:px-4">
                      {((lastMsg?.messageBlocks ?? []).length > 0 ||
                        pendingChartCount(
                          lastMsg?.toolActivity ?? [],
                          lastMsg?.messageBlocks ?? [],
                        ) > 0) && (
                        <div className="flex min-w-0 w-full flex-col gap-2.5 rounded-xl bg-[color-mix(in_srgb,var(--muted)_60%,var(--background))] px-3 py-2.5 sm:px-4 sm:py-3">
                          {(lastMsg?.messageBlocks ?? []).map((block) => (
                            <InlineMessageBlock
                              key={block.id}
                              block={block}
                              renderer={renderer}
                              onOpenArtifact={onOpenArtifact}
                              artifactOpen={openArtifactIds?.has(`block:${block.id}`)}
                            />
                          ))}
                          {Array.from(
                            {
                              length: pendingChartCount(
                                lastMsg?.toolActivity ?? [],
                                lastMsg?.messageBlocks ?? [],
                              ),
                            },
                            (_, index) => (
                              <ChartCardSkeleton key={`pending-chart-${index}`} />
                            ),
                          )}
                        </div>
                      )}
                      <ThinkingStatus tools={lastMsg?.toolActivity} />
                    </div>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

/**
 * A run of consecutive `<system-reminder>`-only user turns, collapsed.
 *
 * The agent injects these between turns and the transcript rendered one grey
 * "System update" row for each, so a conversation of four questions carried
 * four rows that say nothing about what was updated. They are one marker now,
 * counted, centred, and shaped like a divider rather than a message — they are
 * an annotation on the conversation, not something anybody said.
 *
 * Every collapsed id still points at the marker, because the timeline rail
 * scrolls to a message by id and an id with no node is a dead jump.
 */
type TranscriptEntry =
  | { readonly kind: 'message'; readonly message: DisplayMessage }
  | { readonly kind: 'system'; readonly ids: readonly string[] };

function buildEntries(messages: readonly DisplayMessage[]): readonly TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const message of messages) {
    if (message.role === 'user' && isReminderOnly(message.content)) {
      const previous = entries.at(-1);
      if (previous?.kind === 'system') {
        entries[entries.length - 1] = { kind: 'system', ids: [...previous.ids, message.id] };
      } else {
        entries.push({ kind: 'system', ids: [message.id] });
      }
      continue;
    }
    entries.push({ kind: 'message', message });
  }
  return entries;
}

function isReminderOnly(content: string): boolean {
  const parsed = parseSystemReminderContent(content);
  return !parsed.content && parsed.reminders.length > 0;
}

function SystemUpdateRow({
  ids,
  messageRowRefs,
}: {
  readonly ids: readonly string[];
  readonly messageRowRefs: RefObject<Map<string, HTMLDivElement>>;
}) {
  const { t } = useTranslation();
  const label =
    ids.length === 1 ? t('chat.systemUpdate') : t('chat.systemUpdates', { count: ids.length });

  return (
    <MessageScrollerItem>
      <div
        aria-label={label}
        className="flex items-center justify-center gap-1.5 py-0.5 text-micro text-muted-foreground"
        ref={(node: HTMLDivElement | null) => {
          for (const id of ids) {
            if (node) messageRowRefs.current.set(id, node);
            else messageRowRefs.current.delete(id);
          }
        }}
        role="status"
      >
        <span aria-hidden="true" className="size-1 rounded-full bg-muted-foreground/50" />
        {label}
      </div>
    </MessageScrollerItem>
  );
}

/**
 * When a message was sent, on hover.
 *
 * Every message with content used to carry a clock, so eight of them ran down
 * a four-question conversation and the only thing they distinguished was
 * 10:42 from 10:43. It is a real `<time>` now — always in the accessibility
 * tree, always in the tooltip layer of the hovered message, and out of the way
 * of reading the answer. The row keeps its height either way, so nothing jumps
 * when the pointer arrives.
 */
function MessageTime({ className, iso }: { readonly className?: string; readonly iso: string }) {
  const label = formatTimestamp(iso);
  if (!label) return null;
  return (
    <time className={cn('text-caption text-muted-foreground', className)} dateTime={iso}>
      {label}
    </time>
  );
}

/**
 * Out of the way until the pointer is on this message, and always there on a
 * device that has no pointer — the run inspector is a control, not decoration,
 * and a control nobody can reach is worse than one nobody needs.
 *
 * `group/message` comes from `Message` itself, which already declares it.
 */
const REVEALED_ON_HOVER =
  'opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100 [@media(hover:none)]:opacity-100';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const ATTACHMENT_PATTERN = /\n\n\(Attached: (.+)\)$/;
const ATTACHMENT_ITEM_PATTERN = /(\w+)\s+"([^"]+)"/g;

function UserMessageContent({ content }: { readonly content: string }) {
  const cleaned = parseSystemReminderContent(content).content;
  const match = cleaned.match(ATTACHMENT_PATTERN);
  if (!match) return <>{cleaned}</>;

  const textPart = cleaned.slice(0, match.index ?? cleaned.length);
  const attachmentStr = match[1] ?? '';
  const items: { type: string; title: string }[] = [];
  for (const m of attachmentStr.matchAll(ATTACHMENT_ITEM_PATTERN)) {
    items.push({ type: m[1] ?? '', title: m[2] ?? '' });
  }

  return (
    <>
      {textPart}
      {items.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={`${item.type}-${item.title}`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-caption font-medium text-foreground"
            >
              {item.type === 'chart' && <ChartIcon size={13} className="shrink-0" />}
              {item.type === 'document' && <FileTextIcon size={13} className="shrink-0" />}
              {item.title}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

// Keeps the active tool pinned at the top of the activity list instead of
// letting it jump around as sibling tools resolve out of order.
