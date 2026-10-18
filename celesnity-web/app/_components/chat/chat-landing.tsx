'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRightIcon,
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

/* One glyph per idea, and the slash command that reaches the same starter
   from the composer, so the card teaches the shortcut. */
const suggestions = [
  {
    key: 'chat.suggestion.schema' as const,
    descKey: 'chat.suggestion.schema.desc' as const,
    command: '/schema',
    Icon: Table2Icon,
  },
  {
    key: 'chat.suggestion.query' as const,
    descKey: 'chat.suggestion.query.desc' as const,
    command: '/query',
    Icon: TerminalIcon,
  },
  {
    key: 'chat.suggestion.pipeline' as const,
    descKey: 'chat.suggestion.pipeline.desc' as const,
    command: '/pipeline',
    Icon: WorkflowIcon,
  },
  {
    key: 'chat.suggestion.chart' as const,
    descKey: 'chat.suggestion.chart.desc' as const,
    command: '/chart',
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

/** A way into the product from home that is not a prompt: a page to open. */
export interface LandingShortcut {
  readonly id: string;
  readonly href: string;
  /** Already translated by the caller, which owns the page being opened. */
  readonly label: string;
  readonly description: string;
  readonly icon: ReactNode;
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
  /** Pages worth one click from home, shown under "From the floor". */
  readonly shortcuts?: readonly LandingShortcut[];
  readonly mentionSources?: readonly MentionSource[];
  readonly onMentionAdd?: (source: MentionSource) => void;
  readonly attachments?: readonly ChatAttachment[];
  readonly onRemoveAttachment?: (id: string) => void;
}

/**
 * The screen before the first question, and the workspace home.
 *
 * It opens like every other page: an eyebrow saying where you are, a title,
 * one line of description, all on the left edge of the reading column. The
 * composer sits right under it and drops to the bottom once there is a
 * transcript to sit under.
 *
 * Below the composer are three ways in that are not typing: a starter (each
 * card names the slash command that does the same), a plant page, or a
 * conversation already under way.
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
  shortcuts,
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
  const recentShown = recent && onSelectRecent ? recent.slice(0, 3) : [];

  return (
    <section className="relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {header && (
        <div className="flex shrink-0 items-center justify-between px-3 py-3 sm:px-5">{header}</div>
      )}

      {/* Centred with auto margins, not `items-center`. Centre alignment in a
          scroll container keeps centring once the content is taller than the
          frame, so it overflows equally both ways and the top is pushed above
          scrollTop 0 where nothing can reach it. An auto margin resolves to
          zero the moment free space runs out, so a tall block simply starts at
          the top and scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-6 pb-16 sm:px-5">
        <div className={cn(READING_COLUMN, 'my-auto grid gap-8')}>
          <header className="grid gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-mono text-micro tracking-[0.12em] text-muted-foreground uppercase">
                {t('chat.landing.eyebrow')}
              </span>
              <div
                aria-live="polite"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-micro',
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
            </div>
            <h1 className="m-0 max-w-full text-balance text-heading-2 sm:text-heading-1">
              {t('chat.landing.title')}
            </h1>
            <p className="m-0 max-w-[520px] text-body-sm text-muted-foreground">
              {t('chat.landing.description')}
            </p>
          </header>

          <div className="grid gap-1.5">
            <ChatComposer
              disabled={pending}
              onSubmit={onSubmit}
              toolbar={toolbar}
              tools={tools}
              mentionSources={mentionSources}
              onMentionAdd={onMentionAdd}
              attachments={attachments}
              onRemoveAttachment={onRemoveAttachment}
            />
            <p
              aria-hidden={!pending}
              className={cn(
                'm-0 h-[18px] px-3 text-micro text-muted-foreground transition-[opacity,transform] duration-[180ms]',
                pending ? 'translate-y-0 opacity-100' : 'translate-y-[5px] opacity-0',
              )}
              role={pending ? 'status' : undefined}
            >
              {t('chat.landing.building')}
            </p>
          </div>

          <div
            aria-label={t('chat.landing.suggestionsLabel')}
            className="grid gap-2.5"
            role="group"
          >
            <SectionLabel>{t('chat.landing.startFrom')}</SectionLabel>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {suggestions.map(({ key, descKey, command, Icon }) => (
                <button
                  className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-100 focus-visible:border-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pending}
                  key={key}
                  onClick={() => onSubmit(t(key))}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
                    >
                      <Icon size={16} />
                    </span>
                    <kbd className="font-mono text-micro text-muted-foreground">{command}</kbd>
                  </span>
                  <span className="grid gap-0.5">
                    <span className="text-label text-foreground">{t(key)}</span>
                    <span className="text-caption text-muted-foreground">{t(descKey)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {shortcuts && shortcuts.length > 0 ? (
            <nav aria-label={t('chat.landing.fromFloor')} className="grid gap-2.5">
              <SectionLabel>{t('chat.landing.fromFloor')}</SectionLabel>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {shortcuts.map((shortcut) => (
                  <Link
                    className="group flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 transition-colors hover:border-solid hover:border-foreground/20 hover:bg-card focus-visible:border-ring focus-visible:outline-none"
                    href={shortcut.href}
                    key={shortcut.id}
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                    >
                      {shortcut.icon}
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-label text-foreground">{shortcut.label}</span>
                      <span className="truncate text-caption text-muted-foreground">
                        {shortcut.description}
                      </span>
                    </span>
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      size={16}
                    />
                  </Link>
                ))}
              </div>
            </nav>
          ) : null}

          {recentShown.length > 0 && onSelectRecent ? (
            <div className="grid gap-1">
              <SectionLabel>{t('chat.landing.recent')}</SectionLabel>
              <div className="grid divide-y divide-border border-y border-border">
                {recentShown.map((conversation) => (
                  <button
                    aria-label={t('chat.landing.resume', { title: conversation.title })}
                    className="flex cursor-pointer items-center gap-3 px-1 py-2.5 text-left text-body-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                    key={conversation.id}
                    onClick={() => onSelectRecent(conversation.id)}
                    type="button"
                  >
                    <HistoryIcon aria-hidden="true" className="shrink-0" size={16} />
                    <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                    {conversation.subject ? (
                      <span className="shrink-0 font-mono text-micro text-muted-foreground">
                        {conversation.subject}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SectionLabel({ children }: { readonly children: ReactNode }) {
  return (
    <span className="font-mono text-micro tracking-[0.12em] text-muted-foreground uppercase">
      {children}
    </span>
  );
}
