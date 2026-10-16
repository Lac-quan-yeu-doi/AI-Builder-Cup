'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  MoreHorizontalIcon,
  PlayIcon,
  RefreshCwIcon,
  SaveIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/_components/ui/tooltip';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { ChartPreviewStatus } from './chart-builder-state';

export interface ChartBuilderHeaderProps {
  readonly title?: string;
  readonly isNew?: boolean;
  /** Where the query is reading from, e.g. `iceberg / factory_silver / press_telemetry`. */
  readonly subtitle?: ReactNode;
  /** Where the close control returns to. */
  readonly exitHref?: string;
  /** Secondary affordances that belong with the query, e.g. the compiled-SQL drawer. */
  readonly extraActions?: ReactNode;
  readonly previewStatus?: ChartPreviewStatus;
  readonly saving?: boolean;
  readonly previewDisabled?: boolean;
  readonly showPreviewAction?: boolean;
  readonly canSave: boolean;
  readonly onTitleChange?: (title: string) => void;
  readonly onPreview: () => void;
  readonly onSave: () => void;
  readonly onSaveAsNew?: () => void;
  readonly onUndo?: () => void;
  readonly onMore?: () => void;
}

/**
 * The builder's one header.
 *
 * It used to be two: this bar carried "NEW CHART / Untitled chart", and the
 * question surface below it carried a second `<h1>` with its own eyebrow. Two
 * page titles, stacked, on a screen with no way back to the collection you came
 * from. The derived question title went with the second header — the notebook
 * underneath already describes the query in full, and restating it in prose was
 * competing for attention it had not earned.
 */
export function ChartBuilderHeader({
  title = '',
  isNew = true,
  subtitle,
  exitHref,
  extraActions,
  previewStatus = 'EMPTY',
  saving = false,
  previewDisabled = false,
  showPreviewAction = true,
  canSave,
  onTitleChange,
  onPreview,
  onSave,
  onSaveAsNew,
  onUndo,
  onMore,
}: ChartBuilderHeaderProps) {
  const { t } = useTranslation();
  const running = previewStatus === 'RUNNING';
  return (
    <header className="flex flex-col gap-3 border-b border-border bg-card px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8">
      <div className="flex min-w-0 items-center gap-2">
        {exitHref ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="shrink-0">
                <Link href={exitHref} aria-label={t('builder.close')}>
                  <XIcon aria-hidden="true" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('builder.close')}</TooltipContent>
          </Tooltip>
        ) : null}
        <div className="min-w-0">
          <Input
            aria-label={t('builder.chartTitle')}
            placeholder={isNew ? t('builder.untitled') : undefined}
            className="h-8 max-w-md border-0 px-0 text-title shadow-none focus-visible:ring-0"
            value={title}
            onChange={(event) => onTitleChange?.(event.target.value)}
          />
          {subtitle ? (
            <p className="truncate px-0 text-caption text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extraActions}
        {onUndo ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('builder.undo')}
            onClick={onUndo}
          >
            <Undo2Icon aria-hidden="true" />
          </Button>
        ) : null}
        {showPreviewAction ? (
          <Button
            variant="outline"
            disabled={running || saving || previewDisabled}
            onClick={onPreview}
          >
            {running ? (
              <RefreshCwIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <PlayIcon aria-hidden="true" />
            )}
            {running ? t('builder.running') : t('builder.runPreview')}
          </Button>
        ) : null}
        {!isNew && onSaveAsNew ? (
          <Button variant="outline" disabled={!canSave || saving} onClick={onSaveAsNew}>
            {t('builder.saveAsNew')}
          </Button>
        ) : null}
        <Button disabled={!canSave || saving} onClick={onSave}>
          <SaveIcon aria-hidden="true" />
          {saving ? t('builder.saving') : t('action.save')}
        </Button>
        {onMore ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('builder.moreActions')}
            onClick={onMore}
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </header>
  );
}
