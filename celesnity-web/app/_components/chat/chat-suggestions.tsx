'use client';

import { SparklesIcon } from '@/app/_components/ui/icons';
import { useTranslation } from '@/app/_i18n/use-translation';
import { cn } from '@/app/_components/ui/utils';

interface ChatSuggestionsProps {
  readonly suggestions: readonly string[];
  /**
   * Sends the suggestion as the next message. Omitted while the reply is
   * still streaming, or for any reply but the newest: the rows then show
   * but do nothing, so the list is already in place when it becomes live and
   * a stale suggestion from three turns ago never looks actionable.
   */
  readonly onSelect?: (text: string) => void;
  /** Off when the prose already ends on its own lead-in line. */
  readonly heading?: boolean;
}

/**
 * Two to four is where the pattern works. Past that the rows stop being a
 * nudge and become a menu the reader has to survey before they can answer, and
 * the agent is free to emit as many `<suggestion>` tags as it likes.
 */
const MAX_SUGGESTIONS = 3;

/**
 * The next steps an answer offers, as things you can click instead of retype:
 * a heading and a list of full-width rows split by hairlines, the way
 * ChatGPT's "Ask more about this" reads under an answer. Rows rather than
 * pills because the agent's suggestions run to a sentence, and a pill that
 * wide is a paragraph with a border round it.
 *
 * The rows are plain text with a glyph; blue is a link, the focus ring or the
 * row you are on (CLAUDE.md rule 7), so a stack of blue controls under an
 * answer would read as options already chosen.
 */
export function ChatSuggestions({ suggestions, onSelect, heading = true }: ChatSuggestionsProps) {
  const { t } = useTranslation();
  const shown = suggestions.slice(0, MAX_SUGGESTIONS);
  if (shown.length === 0) return null;
  const live = onSelect !== undefined;

  return (
    <div role="group" aria-label={t('chat.suggestions.groupLabel')} className="mt-3 flex flex-col">
      {heading && (
        <div className="pb-1.5 text-body-lg font-semibold text-foreground">
          {t('chat.suggestions.title')}
        </div>
      )}
      {shown.map((suggestion) => (
        <button
          aria-label={suggestion}
          className={cn(
            'flex w-full items-center gap-2.5 border-t border-border py-2.5 text-left text-body-md text-foreground last:border-b',
            live
              ? 'cursor-pointer transition-colors hover:bg-muted/60 focus-visible:bg-muted/60'
              : 'cursor-default',
          )}
          disabled={!live}
          key={suggestion}
          onClick={() => onSelect?.(suggestion)}
          type="button"
        >
          <SparklesIcon size={16} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0">{suggestion}</span>
        </button>
      ))}
    </div>
  );
}
