'use client';

import { ArrowUpRightIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { useTranslation } from '@/app/_i18n/use-translation';
import type { AssistantStarter } from './assistant-scope';

interface AssistantEmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly starters: readonly AssistantStarter[];
  readonly onSelect: (prompt: string) => void;
}

/**
 * The panel before its first turn.
 *
 * Skills and Automations used to render `ChatLanding` here — the opening screen
 * of `/chat`, with a connection badge, a heading-2 title and a recent-thread
 * list. In a 400px column that hero overlapped the page heading behind it. This
 * says the same three things at panel scale: who is being asked, what it can
 * see, and a few starters written against the object on screen.
 */
export function AssistantEmptyState({
  title,
  description,
  starters,
  onSelect,
}: AssistantEmptyStateProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="grid content-start gap-4 px-3 py-4">
      <div className="grid gap-1">
        <h3 className="m-0 text-body-lg font-semibold">{title}</h3>
        <p className="m-0 text-caption leading-relaxed text-muted-foreground">{description}</p>
      </div>

      {starters.length > 0 ? (
        <div aria-label={t('assistant.startersLabel')} className="grid gap-1.5" role="group">
          {/* Bordered rows rather than bare text: these are the first thing the
           * panel asks anyone to click, and plain lines read as a paragraph. */}
          {starters.map((starter) => (
            <button
              className="group flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left text-caption text-foreground shadow-hairline transition-colors hover:border-ring/40 hover:bg-accent focus-visible:border-ring focus-visible:outline-none"
              key={starter.id}
              onClick={() => onSelect(starter.prompt)}
              type="button"
            >
              <span className="min-w-0 flex-1">{starter.label}</span>
              <ArrowUpRightIcon
                aria-hidden="true"
                className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                size={15}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
