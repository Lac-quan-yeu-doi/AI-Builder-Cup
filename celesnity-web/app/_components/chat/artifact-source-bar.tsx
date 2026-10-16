'use client';

import type { ReactNode } from 'react';
import { ChevronDownIcon, ChevronUpIcon, DatabaseIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { useTranslation } from '@/app/_i18n/use-translation';

import type { ArtifactSource } from './artifact-source';

interface ArtifactSourceBarProps {
  readonly source: ArtifactSource;
  readonly open: boolean;
  readonly onToggle: () => void;
  /**
   * What happens to this artifact next, and where it already went. Sits at the
   * end of the bar because where a thing lives is the same class of fact as
   * what it is made of, and because it is the last thing read before deciding
   * whether to keep it.
   */
  readonly trailing?: ReactNode;
}

/**
 * Where a chart or a table says what it is made of.
 *
 * Pinned to the bottom of the pane rather than laid out after the content,
 * because provenance that scrolls out of sight is provenance nobody checks.
 * The query itself stays folded: the people this workspace is for read the
 * table name and the row count, and reach for SQL only when something looks
 * wrong.
 *
 * Every field here already travels in the block's payload, so none of it costs
 * a request. A visual question carries its source table; a written one carries
 * its SQL; both carry the context and the counts.
 */
export function ArtifactSourceBar({ source, open, onToggle, trailing }: ArtifactSourceBarProps) {
  const { locale, t } = useTranslation();
  const number = (value: number): string => new Intl.NumberFormat(locale).format(value);

  const rowLabel = source.truncated
    ? t('chat.artifact.source.truncated', {
        shown: number(source.shownRows),
        total: number(source.totalRows),
      })
    : t('chat.artifact.source.rows', { count: number(source.shownRows) });

  return (
    <div className="shrink-0 border-t border-border bg-card">
      {open && source.sql !== null ? (
        <pre className="m-0 max-h-40 overflow-auto border-b border-border bg-muted px-3 py-2 text-caption leading-relaxed text-muted-foreground">
          {source.sql}
        </pre>
      ) : null}

      <div className="flex items-center gap-2 px-3 py-2">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-caption font-medium">
          <DatabaseIcon aria-hidden="true" className="size-3 text-muted-foreground" />
          <span className="max-w-[16rem] truncate font-mono">{source.label}</span>
        </span>
        <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
          {rowLabel}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {source.sql === null ? null : (
            <Button aria-expanded={open} onClick={onToggle} size="sm" variant="ghost">
              {open ? t('chat.artifact.source.hideQuery') : t('chat.artifact.source.showQuery')}
              {open ? (
                <ChevronDownIcon aria-hidden="true" className="size-3.5" />
              ) : (
                <ChevronUpIcon aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          )}
          {trailing}
        </span>
      </div>
    </div>
  );
}
