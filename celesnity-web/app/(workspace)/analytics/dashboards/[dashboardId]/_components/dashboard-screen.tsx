'use client';

import Link from 'next/link';
import { LayoutDashboardIcon, Maximize2Icon, PencilIcon, RefreshCwIcon } from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/app/_components/ui/breadcrumb';
import { Button } from '@/app/_components/ui/button';
import { EmptyState } from '@/app/_components/ui/empty-state';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { Tabs, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/_components/ui/tooltip';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { Dashboard } from '@/src/entities/models/dashboard';
import { DashboardCardShell } from './dashboard-card-shell';
import { DashboardFilterControls } from './dashboard-filter-controls';
import type { DashboardRuntimeState } from './dashboard-runtime-state';

export function DashboardScreen({
  dashboard,
  loading,
  error,
  runtime = { cards: {} },
  filterValues = {},
  onFilterChange = () => undefined,
  onRetryCard = () => undefined,
  onRefresh = () => undefined,
  activeTabId,
  onTabChange = () => undefined,
  collectionName,
  standalone = false,
}: {
  readonly dashboard: Dashboard | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly runtime?: DashboardRuntimeState;
  readonly filterValues?: Readonly<Record<string, unknown>>;
  readonly onFilterChange?: (filterId: string, value: unknown) => void;
  readonly onRetryCard?: (cardId: string) => void;
  readonly onRefresh?: () => void;
  readonly activeTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
  readonly collectionName?: string | null;
  /** Page chrome — the breadcrumb — only belongs to the standalone route. */
  readonly standalone?: boolean;
}) {
  const { locale, t } = useTranslation();

  if (loading)
    return <main className="p-8 text-body-sm text-muted-foreground">{t('dashboard.loading')}</main>;
  if (!dashboard) {
    return (
      <main className="py-8">
        <PageAlert tone="error">{error ?? t('dashboard.notFound')}</PageAlert>
      </main>
    );
  }

  const orderedTabs = [...dashboard.tabs].sort((left, right) => left.order - right.order);
  const activeTab = orderedTabs.find((tab) => tab.id === activeTabId) ?? orderedTabs[0];
  const cards = dashboard.cards
    .filter((card) => card.tabId === activeTab?.id)
    .sort(
      (left, right) => left.geometry.y - right.geometry.y || left.geometry.x - right.geometry.x,
    );
  const topFilters = dashboard.filters
    .filter((filter) => filter.placement.kind === 'TOP_OF_PAGE')
    .sort((left, right) => left.order - right.order);
  // How many filters are actually narrowing what you are looking at. The strip
  // used to give no sign of it, so a dashboard filtered yesterday looked like
  // one that had never been filtered at all.
  const activeFilters = topFilters.filter((filter) => isSet(filterValues[filter.id])).length;
  const editHref = `/analytics/dashboards/${encodeURIComponent(dashboard.id)}/edit`;

  return (
    <main className="min-h-[calc(100vh-8rem)]" aria-label={t('dashboard.label')}>
      <header className="flex flex-wrap items-start justify-between gap-4 pb-4">
        <div className="min-w-0">
          {standalone ? (
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
                      <Link
                        href={`/analytics/collections/${encodeURIComponent(dashboard.collectionId)}`}
                      >
                        {collectionName}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{t('dashboard.label')}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : null}
          <h1 className="text-heading-2">{dashboard.name}</h1>
          {dashboard.description ? (
            <p className="mt-1.5 max-w-3xl text-body-sm text-muted-foreground">
              {dashboard.description}
            </p>
          ) : null}
          <p className="mt-2 text-caption text-muted-foreground">
            {t('dashboard.updated', { date: formatDate(dashboard.updatedAt, locale) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t('dashboard.refresh')}
                onClick={onRefresh}
              >
                <RefreshCwIcon aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('dashboard.refresh')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t('dashboard.fullscreen')}
                onClick={() => void document.documentElement.requestFullscreen?.()}
              >
                <Maximize2Icon aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('dashboard.fullscreen')}</TooltipContent>
          </Tooltip>
          {/* Editing was a ghost icon among three ghost icons. It is the thing
              people come here to do second-most, so it looks like an action. */}
          <Button asChild>
            <Link href={editHref} aria-label={t('dashboard.editLabel')}>
              <PencilIcon aria-hidden="true" /> {t('dashboard.edit')}
            </Link>
          </Button>
        </div>
      </header>

      {orderedTabs.length > 1 ? (
        <Tabs value={activeTab?.id ?? ''} onValueChange={onTabChange} className="mb-4">
          <TabsList aria-label={t('dashboard.tabs')}>
            {orderedTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      {topFilters.length > 0 ? (
        <section
          aria-label={t('dashboard.filters')}
          className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"
        >
          <DashboardFilterControls
            filters={topFilters}
            values={filterValues}
            onChange={(filter, value) => onFilterChange(filter.id, value)}
          />
          {activeFilters > 0 ? (
            <>
              <span className="text-caption text-muted-foreground">
                {t('dashboard.filtersActive', { count: activeFilters })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => topFilters.forEach((filter) => onFilterChange(filter.id, undefined))}
              >
                {t('dashboard.resetFilters')}
              </Button>
            </>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <PageAlert tone="error" className="mb-3">
          {error}
        </PageAlert>
      ) : null}

      {cards.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            mark={<LayoutDashboardIcon aria-hidden="true" />}
            title={t('dashboard.emptyTitle')}
            description={t('dashboard.emptyDescription')}
            action={
              <Button asChild>
                <Link href={editHref}>{t('dashboard.addChart')}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <section
          className="grid grid-cols-1 gap-1.5 py-2 md:auto-rows-[2.5rem] md:grid-cols-24"
          aria-label={t('dashboard.cards')}
        >
          {cards.map((card) => (
            <DashboardCardShell
              key={card.id}
              card={card}
              runtime={runtime.cards[card.id]}
              onRetry={() => onRetryCard(card.id)}
              inlineFilters={dashboard.filters.filter(
                (filter) =>
                  filter.placement.kind === 'INLINE_CARD' && filter.placement.cardId === card.id,
              )}
              filterValues={filterValues}
              onFilterChange={onFilterChange}
              mappings={dashboard.mappings.filter((mapping) => mapping.cardId === card.id)}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
