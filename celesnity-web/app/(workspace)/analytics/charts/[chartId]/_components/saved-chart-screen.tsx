'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDownIcon, PencilIcon, RefreshCwIcon, SparklesIcon } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/app/_components/ui/alert-dialog';
import { Badge } from '@/app/_components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/app/_components/ui/breadcrumb';
import { Button } from '@/app/_components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/app/_components/ui/collapsible';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { Skeleton } from '@/app/_components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/_components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/_components/ui/tooltip';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import { ChartRenderPreview } from '@/app/_components/shared/chart-render-preview';
import type {
  CanonicalChart,
  ChartPreview,
  ChartRevision,
} from '@/src/entities/models/canonical-chart';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';

export interface SavedChartScreenProps {
  readonly chart: CanonicalChart | null;
  readonly preview: ChartPreview | null;
  readonly revisions: readonly ChartRevision[];
  readonly loading: boolean;
  readonly running: boolean;
  readonly restoringRevisionNumber: number | null;
  readonly notice: { readonly from: number; readonly to: number } | null;
  readonly error: string | null;
  readonly onRefresh: () => void;
  readonly onRestore: (revisionNumber: number) => void;
  readonly renderer: ChartRenderer;
  /** Where this chart lives, for the way back. */
  readonly collectionName?: string | null;
}

type ResultView = 'CHART' | 'DATA';

export function SavedChartScreen({
  chart,
  preview,
  revisions,
  loading,
  running,
  restoringRevisionNumber,
  notice,
  error,
  onRefresh,
  onRestore,
  renderer,
  collectionName,
}: SavedChartScreenProps) {
  const { locale, t } = useTranslation();
  const [view, setView] = useState<ResultView>('CHART');

  if (loading) return <SavedChartSkeleton label={t('chart.loading')} />;
  if (!chart)
    return (
      <main className="py-8">
        <PageAlert tone="error">{error ?? t('chart.notFound')}</PageAlert>
      </main>
    );

  const draft = {
    title: chart.title,
    description: chart.description,
    collectionId: chart.collectionId,
    queryDefinition: chart.queryDefinition,
    visualizationDefinition: chart.visualizationDefinition,
    outputSchema: chart.outputSchema,
    parameterValues: {},
  } as const;
  // A table visualization has no chart to switch to: the grid is the chart.
  const tabular = chart.visualizationDefinition.type === 'TABLE';
  const showData = tabular || view === 'DATA';

  return (
    <main className="h-full min-h-0 space-y-6 overflow-y-auto" aria-label={t('chart.savedChart')}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <Breadcrumb className="mb-1.5">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/analytics">{t('nav.analytics')}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {collectionName ? (
                  <BreadcrumbLink asChild>
                    <Link href={`/analytics/collections/${encodeURIComponent(chart.collectionId)}`}>
                      {collectionName}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{t('chart.single')}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="text-heading-2">{chart.title}</h1>
          {chart.description ? (
            <p className="mt-1.5 max-w-3xl text-body-sm text-muted-foreground">
              {chart.description}
            </p>
          ) : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {/* `CHAT` used to be rendered raw, next to the version number. */}
            {chart.provenance === 'CHAT' ? (
              <Badge variant="secondary" className="gap-1">
                <SparklesIcon aria-hidden="true" /> {t('analytics.fromChat')}
              </Badge>
            ) : null}
            <span className="text-caption text-muted-foreground">
              {t('chart.version', { version: chart.currentRevisionNumber })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={running ? t('chart.refreshing') : t('chart.refresh')}
                onClick={onRefresh}
                disabled={running}
              >
                <RefreshCwIcon
                  aria-hidden="true"
                  className={running ? 'animate-spin' : undefined}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('chart.refresh')}</TooltipContent>
          </Tooltip>
          <Button asChild>
            <Link href={`/analytics/charts/${encodeURIComponent(chart.id)}/edit`}>
              <PencilIcon aria-hidden="true" /> {t('chart.edit')}
            </Link>
          </Button>
        </div>
      </header>

      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      {notice ? (
        <PageAlert tone="success">
          {t('chart.restoreSuccess', { from: notice.from, to: notice.to })}
        </PageAlert>
      ) : null}

      <section className="space-y-3" aria-label={t('chart.visualization')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Chart and grid used to be stacked, always, so every visit scrolled
              past the picture to reach the numbers under it. */}
          {tabular ? (
            <span />
          ) : (
            <Tabs value={view} onValueChange={(value) => setView(value as ResultView)}>
              <TabsList aria-label={t('chart.resultView')}>
                <TabsTrigger value="CHART">{t('chart.viewChart')}</TabsTrigger>
                <TabsTrigger value="DATA">{t('chart.viewData')}</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <span className="text-caption text-muted-foreground tabular-nums">
            {running
              ? t('chart.runningQuery')
              : preview
                ? t('chart.rowCount', { count: preview.rowCount })
                : t('chart.noResult')}
          </span>
        </div>

        {preview ? (
          <div className="rounded-xl border border-border bg-card p-5">
            {showData ? (
              <ResultGrid columns={preview.columns} rows={preview.rows} />
            ) : (
              <ChartRenderPreview draft={draft} rows={preview.rows} renderer={renderer} />
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-body-sm text-muted-foreground">
            {t('chart.latestQueryEmpty')}
          </p>
        )}
      </section>

      <Collapsible className="rounded-xl border border-border bg-card">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="group h-auto w-full justify-between rounded-xl px-5 py-4 text-label"
          >
            {t('chart.versionHistory', { count: revisions.length })}
            <ChevronDownIcon
              aria-hidden="true"
              className="transition-transform group-data-[state=open]:rotate-180"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="border-t border-border" aria-label={t('chart.versionHistoryList')}>
            {revisions.map((revision) => (
              <li
                key={`${revision.chartId}-${revision.revisionNumber}`}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-b-0"
              >
                <div>
                  <div className="flex items-center gap-2 text-body-sm font-medium">
                    <span>{t('chart.version', { version: revision.revisionNumber })}</span>
                    {revision.revisionNumber === chart.currentRevisionNumber ? (
                      <Badge variant="info">{t('chart.currentVersion')}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-caption text-muted-foreground">
                    <time dateTime={revision.createdAt}>
                      {formatRevisionDate(revision.createdAt, locale)}
                    </time>
                    {revision.restoredFromRevisionNumber !== null ? (
                      <span>
                        {t('chart.restoredFrom', {
                          version: revision.restoredFromRevisionNumber,
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
                {revision.revisionNumber !== chart.currentRevisionNumber ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restoringRevisionNumber !== null}
                      >
                        {restoringRevisionNumber === revision.revisionNumber
                          ? t('chart.restoring')
                          : t('chart.restore')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('chart.restoreTitle', { version: revision.revisionNumber })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('chart.restoreDescription', {
                            version: revision.revisionNumber,
                            next: chart.currentRevisionNumber + 1,
                          })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onRestore(revision.revisionNumber)}>
                          {t('chart.restore')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </main>
  );
}

function SavedChartSkeleton({ label }: { readonly label: string }) {
  return (
    <main className="space-y-6" aria-busy="true" aria-label={label}>
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-96 max-w-full" />
        <Skeleton className="h-4 w-120 max-w-full" />
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </main>
  );
}

function formatRevisionDate(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/**
 * The rows behind the chart. Numerals are right-aligned and tabular so they
 * line up on the decimal point, which is the only reason to read the grid
 * rather than the picture.
 */
function ResultGrid({
  columns,
  rows,
}: {
  readonly columns: ChartPreview['columns'];
  readonly rows: ChartPreview['rows'];
}) {
  return (
    <div className="max-h-120 overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.name}
                className={cn(
                  'whitespace-nowrap',
                  column.family === 'NUMBER' ? 'text-right' : 'text-left',
                )}
              >
                {column.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.map((value, valueIndex) => (
                <TableCell
                  key={valueIndex}
                  className={cn(
                    columns[valueIndex]?.family === 'NUMBER'
                      ? 'text-right tabular-nums'
                      : 'text-left',
                  )}
                >
                  {String(value ?? '')}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
