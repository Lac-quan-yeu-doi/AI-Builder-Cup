'use client';

import type { ReactNode } from 'react';
import {
  ArrowUpRightIcon,
  ChartColumnIcon,
  HistoryIcon,
  Table2Icon,
  TerminalIcon,
  WorkflowIcon,
} from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { cn } from '@/app/_components/ui/utils';

import type { ChatAttachment } from '@/src/entities/models/chat-attachment';
import { ChatComposer, type ComposerTool, type MentionSource } from './chat-composer';
import { READING_COLUMN } from './reading-column';

/* One glyph per idea. Four copies of the same quote mark said nothing about
   which of the four a person wanted. */
const suggestions = [
  {
    key: 'chat.suggestion.schema' as const,
    descKey: 'chat.suggestion.schema.desc' as const,
    Icon: Table2Icon,
  },
  {
    key: 'chat.suggestion.query' as const,
    descKey: 'chat.suggestion.query.desc' as const,
    Icon: TerminalIcon,
  },
  {
    key: 'chat.suggestion.pipeline' as const,
    descKey: 'chat.suggestion.pipeline.desc' as const,
    Icon: WorkflowIcon,
  },
  {
    key: 'chat.suggestion.chart' as const,
    descKey: 'chat.suggestion.chart.desc' as const,
    Icon: ChartColumnIcon,
  },
] as const;

export type ChatConnectionStatus = 'checking' | 'connected' | 'offline';

export interface RecentConversation {
  readonly id: string;
  readonly title: string;
  /**
   * What the conversation is about, when it is scoped to one database. A title
   * is the first sixty characters of the first message, so two runs at the same
   * starter produce two rows reading "Visualize my data" and nothing else; the
   * subject is the one thing on hand that tells them apart.
   */
  readonly subject?: string | null;
}

interface ChatLandingProps {
  readonly pending: boolean;
  readonly connectionStatus: ChatConnectionStatus;
  readonly onSubmit: (prompt: string) => void;
  /** Controls that belong with the prompt — the database it asks about. */
  readonly toolbar?: ReactNode;
  /** Shared conversation/new-chat access used by both empty and active views. */
  readonly header?: ReactNode;
  /** Workspace panels, in the composer rather than a header. */
  readonly tools?: readonly ComposerTool[];
  /** Conversations worth going back to, newest first. */
  readonly recent?: readonly RecentConversation[];
  readonly onSelectRecent?: (id: string) => void;
  readonly mentionSources?: readonly MentionSource[];
  readonly onMentionAdd?: (source: MentionSource) => void;
  readonly attachments?: readonly ChatAttachment[];
  readonly onRemoveAttachment?: (id: string) => void;
}

/**
 * The screen before the first question.
 *
 * The composer is centred here and drops to the bottom once there is a
 * transcript to sit under — the opening move ChatGPT, Claude and Gemini all
 * make, and the reason is the same in all three: with nothing to read, the
 * prompt is the page. The design system's tenth rule says the composer stays
 * at the bottom; that rule is about a conversation in progress, and following
 * it literally here would put an empty screen's one control in the corner.
 *
 * Around it is the design system's empty state: who you are talking to and
 * whether it is reachable at the top, what to ask and what you already asked
 * below. Data freshness and a standing signal are the two parts of that spec
 * left out, because nothing in the workspace reports either yet and a made-up
 * timestamp is worse than none.
 *
 * The connection line is deliberately quiet. It used to open with an orange
 * uppercase CHECKING badge, which made the loudest thing on a fresh screen a
 * transient state that resolves in under a second — and put warning orange on
 * a workspace that was fine.
 */
export function ChatLanding({
  pending,
  connectionStatus,
  onSubmit,
  toolbar,
  header,
  tools,
  recent,
  onSelectRecent,
  mentionSources,
  onMentionAdd,
  attachments,
  onRemoveAttachment,
}: ChatLandingProps) {
  const { t } = useTranslation();
  const connectionLabel =
    connectionStatus === 'checking'
      ? t('chat.landing.connectionChecking')
      : connectionStatus === 'offline'
        ? t('chat.landing.connectionUnavailable')
        : t('chat.landing.connection');
  /* Only one of the three states is news. Connected and checking are the
     resting states of a screen that has not been used yet, so they are a line
     of muted text; unavailable is the one worth a border. */
  const connectionToneClass =
    connectionStatus === 'offline'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : 'border-transparent text-muted-foreground';
  const indicatorClass =
    connectionStatus === 'connected'
      ? 'bg-status-success'
      : connectionStatus === 'checking'
        ? 'bg-muted-foreground/50 motion-safe:animate-pulse'
        : 'bg-destructive';

  return (
    <section className="relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {header && (
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-3 sm:px-5 sm:py-4">
          {header}
        </div>
      )}

      {/* One block, centred in what the chrome leaves. It stops being centred
          the moment there is a conversation: `ChatScreen` swaps this screen for
          the transcript, whose composer is pinned at the bottom. */}
      {/* Centred with auto margins, not `items-center`. Centre alignment in a
          scroll container keeps centring once the content is taller than the
          frame, so it overflows equally both ways and the top is pushed above
          scrollTop 0 where nothing can reach it. An auto margin resolves to
          zero the moment free space runs out, so a tall block simply starts at
          the top and scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-16 sm:px-5">
        <div className={cn(READING_COLUMN, 'my-auto grid gap-6')}>
          <div className="grid justify-items-center gap-3 text-center">
            <div
              aria-live="polite"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro',
                connectionToneClass,
              )}
              role="status"
            >
              <span
                aria-hidden="true"
                className={cn('size-1.5 shrink-0 rounded-full', indicatorClass)}
              />
              {connectionLabel}
            </div>

            <h1 className="m-0 max-w-full text-balance text-heading-2 sm:text-heading-1">
              {t('chat.landing.title')}
            </h1>
            <p className="m-0 max-w-[460px] text-caption leading-relaxed text-muted-foreground">
              {t('chat.landing.description')}
            </p>
          </div>

          <div className="grid gap-1.5">
            <ChatComposer disabled={pending} onSubmit={onSubmit} toolbar={toolbar} tools={tools} mentionSources={mentionSources} onMentionAdd={onMentionAdd} attachments={attachments} onRemoveAttachment={onRemoveAttachment} />
            <p
              aria-hidden={!pending}
              className={cn(
                'm-0 h-[18px] text-center text-micro text-muted-foreground transition-[opacity,transform] duration-[180ms]',
                pending ? 'translate-y-0 opacity-100' : 'translate-y-[5px] opacity-0',
              )}
              role={pending ? 'status' : undefined}
            >
              {t('chat.landing.building')}
            </p>
          </div>

          <div className="grid gap-5">
            <div
              aria-label={t('chat.landing.suggestionsLabel')}
              className="grid gap-0.5"
              role="group"
            >
              <ListLabel>{t('chat.landing.suggested')}</ListLabel>
              {suggestions.map(({ key, descKey, Icon }) => (
                <button
                  className="group flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pending}
                  key={key}
                  onClick={() => onSubmit(t(key))}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-foreground"
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-caption font-semibold text-foreground">
                      {t(key)}
                    </span>
                    <span className="mt-px block truncate text-caption leading-[1.4] text-muted-foreground">
                      {t(descKey)}
                    </span>
                  </span>
                  <ArrowUpRightIcon
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    size={16}
                  />
                </button>
              ))}
            </div>

            {recent && recent.length > 0 && onSelectRecent ? (
              <div className="grid gap-0.5">
                <ListLabel>{t('chat.landing.recent')}</ListLabel>
                {recent.slice(0, 2).map((conversation) => (
                  <button
                    aria-label={t('chat.landing.resume', { title: conversation.title })}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left text-caption text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground"
                    key={conversation.id}
                    onClick={() => onSelectRecent(conversation.id)}
                    type="button"
                  >
                    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center">
                      <HistoryIcon size={16} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                    {conversation.subject ? (
                      <span className="shrink-0 text-micro text-muted-foreground">
                        {conversation.subject}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ListLabel({ children }: { readonly children: ReactNode }) {
  return (
    <span className="px-3 text-micro font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  );
}
