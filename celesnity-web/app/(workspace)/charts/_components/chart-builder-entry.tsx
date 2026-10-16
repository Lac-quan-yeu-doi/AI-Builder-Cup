'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRightIcon, ChartNoAxesCombinedIcon, SquareTerminalIcon, XIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/app/_components/ui/item';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/_components/ui/tooltip';
import { useTranslation } from '@/app/_i18n/use-translation';

export interface ChartBuilderEntryProps {
  readonly onQuestion: () => void;
  readonly onNative: () => void;
  /** Where the close control returns to. */
  readonly exitHref?: string;
}

/**
 * Entry point for a new chart. The choice is deliberately local UI state;
 * neither option changes the persisted chart contract until the user saves.
 *
 * The two options used to be `Button`s stretched to 144px tall. `Button`'s base
 * class carries `whitespace-nowrap`, so each description ran off the side of its
 * own card and was clipped — the visible symptom of using a one-line control to
 * hold three lines of prose. They are `Item`s now, which is the primitive for
 * media + title + description, and their text wraps because that is what it is
 * for.
 */
export function ChartBuilderEntry({ onQuestion, onNative, exitHref }: ChartBuilderEntryProps) {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-full flex-col" aria-label="New chart entry">
      {exitHref ? (
        <div className="flex shrink-0 items-center px-4 py-3 md:px-8">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon">
                <Link href={exitHref} aria-label={t('builder.close')}>
                  <XIcon aria-hidden="true" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('builder.close')}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      {/* No tinted band: it used to be `bg-muted/20` on a fixed-height block, so
          the wash ended in a hard horizontal line partway down the page.
          Content sits at the top, where every other builder state puts it —
          centred in a full-height canvas it read as a page that had lost its
          own header. */}
      <div className="flex flex-1 justify-center px-4 pt-6 pb-16 md:px-8">
        <section className="w-full max-w-2xl">
          <h1 className="text-heading-2">{t('builder.entryTitle')}</h1>
          <p className="mt-2 max-w-xl text-body-sm text-muted-foreground">
            {t('builder.entryHint')}
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <EntryOption
              icon={<ChartNoAxesCombinedIcon aria-hidden="true" />}
              title={t('builder.newQuestion')}
              description={t('builder.newQuestionHint')}
              onSelect={onQuestion}
            />
            <EntryOption
              icon={<SquareTerminalIcon aria-hidden="true" />}
              title={t('builder.newSql')}
              description={t('builder.newSqlHint')}
              onSelect={onNative}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function EntryOption({
  icon,
  title,
  description,
  onSelect,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly onSelect: () => void;
}) {
  return (
    <Item
      asChild
      variant="outline"
      className="items-start gap-3 rounded-xl p-4 text-left hover:border-ring/40 hover:bg-accent"
    >
      <button type="button" onClick={onSelect}>
        {/* `bg-primary/10` was a blue tint until the CTA went near-black; it has
            been a grey wash under a near-black glyph ever since. */}
        <ItemMedia
          variant="icon"
          className="size-9 shrink-0 rounded-lg bg-muted text-muted-foreground"
        >
          {icon}
        </ItemMedia>
        <ItemContent className="gap-1">
          <ItemTitle className="text-body-md">{title}</ItemTitle>
          {/* A plain paragraph rather than `ItemDescription`, which is
              `line-clamp-2` and would cut the third line off at this width. */}
          <p className="text-body-sm font-normal text-muted-foreground">{description}</p>
        </ItemContent>
        <ArrowRightIcon
          aria-hidden="true"
          className="mt-1.5 size-4 shrink-0 self-start text-muted-foreground"
        />
      </button>
    </Item>
  );
}
