'use client';

import Link from 'next/link';

import type { MetadataCrawler } from '@/src/entities/models/metadata-crawler';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { useTranslation } from '@/app/_i18n/use-translation';
import { sourceTabHref } from '@/app/_components/layout/source-tab-href';

interface SourceScanSummaryProps {
  /** The scan assigned to this source, if one is. */
  readonly crawler?: MetadataCrawler;
  /**
   * The source and the database it is filed under. Present whenever the list
   * sits inside a database, which is every case that matters: what a scan
   * found belongs to the source's own screen, so the link stays inside the
   * database rather than crossing into the standalone crawler area.
   */
  readonly databaseName?: string;
  readonly serviceId?: string;
}

const stateTone: Readonly<Record<string, 'success' | 'warning' | 'danger' | 'secondary'>> = {
  SUCCEEDED: 'success',
  RUNNING: 'warning',
  QUEUED: 'warning',
  PARTIAL: 'warning',
  FAILED: 'danger',
};

/**
 * A source's metadata scan, shown on the source itself.
 *
 * The two were separate destinations, yet the crawler list is keyed by the
 * database service name and `DatabaseMetadataCrawler.databaseServiceId` is
 * unique — one scan per source. Reading "when was this last scanned" therefore
 * meant leaving the screen that owns the connection and matching rows by name.
 */
export function SourceScanSummary({ crawler, databaseName, serviceId }: SourceScanSummaryProps) {
  const { t } = useTranslation();

  if (crawler === undefined) {
    // Into the source's own Scan tab, where the assign dialog lives, rather than
    // out to the workspace crawler list — which then asked which source this
    // was, from a row that had just named it.
    const assignHref =
      databaseName !== undefined && serviceId !== undefined
        ? sourceTabHref(databaseName, serviceId, 'scan')
        : '/metadata-crawler';

    return (
      <div className="mb-[17px] flex flex-wrap items-center gap-2.5 rounded-lg border border-dashed border-border px-3 py-2.5">
        <span className="text-caption text-muted-foreground">{t('source.scan.none')}</span>
        <Button asChild className="ml-auto" size="sm" variant="outline">
          <Link href={assignHref}>{t('source.scan.assign')}</Link>
        </Button>
      </div>
    );
  }

  const lastRunState = crawler.lastRun?.status;
  const sourceHref =
    databaseName !== undefined && serviceId !== undefined
      ? sourceTabHref(databaseName, serviceId, 'tables')
      : `/metadata-crawler/${encodeURIComponent(crawler.id)}`;

  return (
    <div className="mb-[17px] flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-muted px-3 py-2.5">
      <span className="text-micro font-[750] tracking-[0.06em] text-muted-foreground uppercase">
        {t('source.scan.label')}
      </span>
      <Badge variant={lastRunState ? (stateTone[lastRunState] ?? 'secondary') : 'secondary'}>
        {lastRunState ?? crawler.state}
      </Badge>
      <span className="text-caption text-muted-foreground">
        {t('source.scan.relations', { count: crawler.snapshotSummary.relationCount })}
      </span>
      <Button asChild className="ml-auto" size="sm" variant="outline">
        <Link href={sourceHref}>{t('source.scan.view')}</Link>
      </Button>
    </div>
  );
}
