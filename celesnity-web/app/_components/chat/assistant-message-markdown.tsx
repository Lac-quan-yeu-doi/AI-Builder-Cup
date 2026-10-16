'use client';

import { useEffect, useMemo, useRef } from 'react';

import { extractCitationRefs, citationKey } from '@/src/entities/models/citation';
import { extractSuggestions, stripSuggestionTags } from '@/src/entities/models/suggestion';
import type { ResolveCitationsController } from '@/src/interface-adapters/controllers/citations/resolve-citations.controller';
import type { ResolvedCitationViewModel } from '@/src/interface-adapters/presenters/citation.presenter';
import { useTranslation } from '@/app/_i18n/use-translation';

import { ChatMarkdown, type MarkdownInsert } from './chat-markdown';
import { GrowIn } from '@/app/_components/ui/grow-in';
import { endsWithLeadIn } from '@/src/entities/models/suggestion';

import { ChatSuggestions } from './chat-suggestions';
import { parseSystemReminderContent } from './system-reminder';
import { useSmoothStream } from './use-smooth-stream';

interface AssistantMessageMarkdownProps {
  readonly content: string;
  readonly resolvedCitations?: Readonly<Record<string, ResolvedCitationViewModel>>;
  /** True while this exact message is still streaming in — citation resolution is deferred until it settles. */
  readonly active: boolean;
  readonly resolveCitations: ResolveCitationsController;
  readonly onResolved: (citations: Readonly<Record<string, ResolvedCitationViewModel>>) => void;
  readonly onCitationClick?: (citation: ResolvedCitationViewModel) => void;
  /**
   * Renders this message's `<suggestion>` tags as clickable chips below the
   * body when given — omitted for anything but the most recent, settled
   * assistant message (see `chat-screen.tsx`), so a stale suggestion from
   * three turns ago never looks actionable.
   */
  readonly onSuggestionSelect?: (text: string) => void;
  /**
   * Cards to place inside the prose, each after the sentence its tool call
   * was pinned to — a chart lands where the reply announced it, not above
   * everything. See `ChatMarkdown` and `text-anchor.ts`.
   */
  readonly inserts?: readonly MarkdownInsert[];
}

/**
 * Wraps `ChatMarkdown` with citation resolution: extracts `<citation>` refs
 * from the (settled) message content, batch-resolves them once, and lifts
 * the result up so the message-owning component can cache it — resolving
 * on every render/keystroke would waste a network call for a title that
 * cannot change mid-conversation.
 */
export function AssistantMessageMarkdown({
  content,
  resolvedCitations,
  active,
  resolveCitations,
  onResolved,
  onCitationClick,
  onSuggestionSelect,
  inserts,
}: AssistantMessageMarkdownProps) {
  const { t } = useTranslation();
  const parsedContent = useMemo(() => parseSystemReminderContent(content), [content]);
  const cleanContent = parsedContent.content;

  // `onResolved` is an inline callback re-created every render in the
  // caller — reading it through a ref keeps the effect below from
  // re-firing (and re-resolving) on every unrelated re-render.
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  });

  useEffect(() => {
    if (active || resolvedCitations !== undefined) return;
    const refs = extractCitationRefs(cleanContent);
    if (refs.length === 0) return;
    let cancelled = false;
    resolveCitations(refs)
      .then((resolved) => {
        if (cancelled) return;
        const map: Record<string, ResolvedCitationViewModel> = {};
        for (const citation of resolved) {
          map[citationKey(citation)] = citation;
        }
        onResolvedRef.current(map);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, cleanContent, resolveCitations, resolvedCitations]);

  /*
   * Parsed whether or not the chips are shown. The chips are offered only on
   * the newest message, so tying the parse to them meant that the moment a
   * reply stopped being the newest, its `<suggestion>` tags stopped being
   * removed and appeared in the prose as literal markup.
   */
  const suggestions = useMemo(() => extractSuggestions(cleanContent), [cleanContent]);
  /*
   * While the reply still streams it is treated as if its chips will render:
   * the lead-in above them stays. Dropping it then and restoring it when the
   * chips arrive moved the whole tail of the message at the moment it
   * finished.
   */
  const displayContent = useMemo(
    () =>
      suggestions.length > 0
        ? stripSuggestionTags(cleanContent, active || onSuggestionSelect !== undefined)
        : cleanContent,
    [active, cleanContent, onSuggestionSelect, suggestions.length],
  );

  // Let out a word or two per tick while streaming, so each fades in on its
  // own; words still queued when the stream closes drain the same way. Once
  // every word has settled the prose renders plain.
  const { text: shownContent, settled } = useSmoothStream(displayContent, active);

  return (
    <>
      {cleanContent && (
        <ChatMarkdown
          content={shownContent}
          resolvedCitations={resolvedCitations}
          onCitationClick={onCitationClick}
          animateFrom={settled < shownContent.length ? settled : undefined}
          inserts={inserts}
        />
      )}
      {!cleanContent && parsedContent.reminders.length > 0 && (
        <div
          role="status"
          aria-label={t('chat.systemUpdate')}
          className="flex items-center gap-1.5 py-0.5 text-micro text-muted-foreground"
        >
          <span aria-hidden="true" className="size-1 rounded-full bg-muted-foreground/50" />
          {t('chat.systemUpdate')}
        </div>
      )}
      {/* Laid out as soon as the tags have arrived, while the reply still
          streams, growing into place; the rows go live when it finishes, so
          nothing moves at that moment. Older replies show none. */}
      {(active || onSuggestionSelect !== undefined) && suggestions.length > 0 && (
        <GrowIn active={active}>
          <ChatSuggestions
            suggestions={suggestions}
            onSelect={onSuggestionSelect}
            heading={!endsWithLeadIn(displayContent)}
          />
        </GrowIn>
      )}
    </>
  );
}
