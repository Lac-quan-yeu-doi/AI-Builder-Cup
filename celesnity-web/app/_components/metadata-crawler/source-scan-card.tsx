'use client';

import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/_components/ui/alert-dialog';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { IconButton } from '@/app/_components/ui/icon-button';
import { PageAlert, type PageAlertTone } from '@/app/_components/ui/page-alert';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { MetadataCrawler } from '@/src/entities/models/metadata-crawler';

import {
  formatMetadataCrawlerSchedule,
  formatMetadataCrawlerTime,
} from './metadata-crawler-format';
import { MetadataCrawlerStatusBadge } from './metadata-crawler-status-badge';

interface SourceScanCardProps {
  readonly busy: boolean;
  readonly crawler: MetadataCrawler;
  readonly onEditSchedule: () => void;
  readonly onRemove: () => void;
  readonly onRunNow: () => void;
  readonly onToggle: () => void;
}

/**
 * One source's metadata scan, with everything that can be done to it.
 *
 * It used to be a read-only strip plus a "Configure crawler" link out to the
 * workspace list, which is where pausing, rescheduling and removing lived. The
 * link was the tell: a scan belongs to exactly one source, so a screen that can
 * show its state and not change it is sending people somewhere to do work the
 * screen already has the context for.
 *
 * Scan now and Pause are the two done often enough to be buttons. Editing the
 * schedule and removing the scan sit behind the overflow: one is not a daily
 * job, and the other should not share an edge with the button that runs it.
 */
export function SourceScanCard({
  busy,
  crawler,
  onEditSchedule,
  onRemove,
  onRunNow,
  onToggle,
}: SourceScanCardProps) {
  const { t } = useTranslation();
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const archived = crawler.state === 'ARCHIVED';
  const lastRun = crawler.lastRun;
  // A blocked scan and a failed run are the same question to whoever is
  // looking — "why is nothing coming through" — and the old screen answered
  // neither: it showed the state and kept the reason inside the run log.
  const problem = lastRun?.failure
    ? { title: t('source.scan.lastRunFailed'), detail: lastRun.failure.summary, tone: 'warning' }
    : crawler.state === 'BLOCKED'
      ? {
          title: t('metadataCrawler.blocked'),
          detail: t('source.scan.blockedHint'),
          tone: 'warning',
        }
      : // Core reports `hasSnapshot: false` and every count at zero for a
        // disabled crawler, and hides the Discovered tables with them. Nothing
        // was deleted — resuming brings all of it back — but the product goes
        // quiet about 73 tables at the press of one button, so the button says
        // what it did.
        crawler.state === 'PAUSED'
        ? { title: t('metadataCrawler.paused'), detail: t('source.scan.pausedHint'), tone: 'info' }
        : undefined;

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <MetadataCrawlerStatusBadge status={crawler.state} t={t} />
            <span className="truncate text-body-sm font-medium">{crawler.name}</span>
          </div>
          <p className="m-0 text-caption text-muted-foreground">
            {formatMetadataCrawlerSchedule(crawler.schedule, t)} · {crawler.schedule.timezone}
            {/* Only when there is a snapshot to count. A paused crawler comes
             * back with every count at zero, and "0 tables discovered" beside a
             * scan history reading 73 is the screen contradicting itself. */}
            {crawler.snapshotSummary.hasSnapshot
              ? ` · ${t('source.scan.relations', { count: crawler.snapshotSummary.relationCount })}`
              : null}
          </p>
          <p className="m-0 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
            <span>{t('source.scan.lastRun')}</span>
            {lastRun ? (
              <>
                <MetadataCrawlerStatusBadge status={lastRun.status} t={t} />
                <span>{formatMetadataCrawlerTime(lastRun.finishedAt ?? lastRun.queuedAt)}</span>
              </>
            ) : (
              <span>{t('source.scan.noRuns')}</span>
            )}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton disabled={busy} label={t('source.scan.more')} size="sm">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem
              disabled={archived || !crawler.schedule.editable}
              onSelect={onEditSchedule}
            >
              <PencilIcon />
              {t('source.scan.editSchedule')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* The confirmation lives outside the menu on purpose: Radix
             * unmounts the menu content on select, and a dialog mounted inside
             * it goes with it. */}
            <DropdownMenuItem onSelect={() => setConfirmingRemoval(true)} variant="destructive">
              <Trash2Icon />
              {t('source.scan.remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog onOpenChange={setConfirmingRemoval} open={confirmingRemoval}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('source.scan.removeTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('source.scan.removeDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>{t('action.cancel')}</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={onRemove} variant="destructive">
                {t('source.scan.remove')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {problem ? (
        <PageAlert title={problem.title} tone={problem.tone as PageAlertTone}>
          {problem.detail}
        </PageAlert>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={busy || archived} onClick={onToggle} size="sm" variant="outline">
          {crawler.enabled ? t('source.scan.pause') : t('source.scan.resume')}
        </Button>
        <Button
          data-tutorial-target="run-metadata-crawler"
          disabled={busy || archived}
          onClick={onRunNow}
          size="sm"
        >
          {t('source.action.scanNow')}
        </Button>
      </div>
    </Card>
  );
}
