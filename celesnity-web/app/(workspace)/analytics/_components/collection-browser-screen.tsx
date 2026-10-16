'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import {
  ArchiveIcon,
  BarChart3Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  Code2Icon,
  FolderIcon,
  FolderInputIcon,
  FolderPlusIcon,
  LayoutDashboardIcon,
  LayersIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  UserRoundIcon,
} from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/_components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { EmptyState } from '@/app/_components/ui/empty-state';
import { Input } from '@/app/_components/ui/input';
import { NativeSelect } from '@/app/_components/ui/native-select';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { Pager } from '@/app/_components/ui/pager';
import { SearchField } from '@/app/_components/ui/search-field';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { Translator } from '@/app/_i18n/translate';
import type { ChartCollection } from '@/src/entities/models/chart-collection';
import type { ChartSummary } from '@/src/entities/models/canonical-chart';
import type { DashboardSummary } from '@/src/entities/models/dashboard';

import { LibraryRow, type LibraryItem } from './library-row';

type CollectionDialog =
  | { readonly mode: 'CREATE' }
  | { readonly mode: 'RENAME'; readonly collection: ChartCollection }
  | { readonly mode: 'MOVE'; readonly collection: ChartCollection }
  | null;

type TypeFilter = 'ALL' | 'DASHBOARD' | 'CHART';

/** Past this many rows a filter earns its place; below it, it is furniture. */
const SEARCH_THRESHOLD = 8;
/** Enough to recognise the one you want, few enough to stay one row. */
const RECENT_SHOWN = 4;
/** A library is a list you scan, not one you scroll to the end of. */
const PAGE_SIZE = 20;

export function CollectionBrowserScreen({
  collections,
  charts,
  dashboards,
  selectedCollectionId,
  recentIds = [],
  loading = false,
  error,
  onCreate,
  onRename,
  onMove,
  onArchive,
  onCreateDashboard,
}: {
  readonly collections: readonly ChartCollection[];
  readonly charts: readonly ChartSummary[];
  readonly dashboards: readonly DashboardSummary[];
  readonly selectedCollectionId?: string;
  /** Object ids this browser opened, most recent first. */
  readonly recentIds?: readonly string[];
  readonly loading?: boolean;
  readonly error: string | null;
  readonly onCreate: (name: string, parentId: string | null) => Promise<boolean>;
  readonly onRename: (id: string, name: string) => Promise<boolean>;
  readonly onMove: (id: string, parentId: string | null) => Promise<boolean>;
  readonly onArchive: (id: string) => Promise<boolean>;
  readonly onCreateDashboard: (
    name: string,
    description: string | null,
    collectionId: string,
  ) => Promise<boolean>;
}) {
  const { locale, t } = useTranslation();
  const [dialog, setDialog] = useState<CollectionDialog>(null);
  const [name, setName] = useState('');
  const [movingParentId, setMovingParentId] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [page, setPage] = useState(1);
  const [working, setWorking] = useState(false);
  const [dashboardDialogOpen, setDashboardDialogOpen] = useState(false);
  const [dashboardName, setDashboardName] = useState('');
  const [dashboardDescription, setDashboardDescription] = useState('');
  const [dashboardCollectionId, setDashboardCollectionId] = useState('');

  const visible = useMemo(
    () => collections.filter((collection) => collection.archivedAt === null),
    [collections],
  );

  function labelFor(collection: ChartCollection): string {
    if (collection.kind === 'PERSONAL') return t('analytics.personal');
    if (collection.kind === 'ROOT') return t('analytics.shared');
    return collection.name;
  }

  const byId = useMemo(
    () => new Map(visible.map((collection) => [collection.id, collection])),
    [visible],
  );
  const scope = selectedCollectionId ? byId.get(selectedCollectionId) : undefined;
  /** Narrowing by a collection includes what is nested inside it — a parent that
   * hid its children's work would be a worse answer than no filter at all. */
  const scopeIds = useMemo(
    () => (scope ? descendantIds(scope.id, visible) : null),
    [scope, visible],
  );

  const items = useMemo<readonly LibraryItem[]>(() => {
    const all: LibraryItem[] = [
      ...dashboards.map((dashboard) => ({
        id: dashboard.id,
        kind: 'DASHBOARD' as const,
        title: dashboard.name,
        description: dashboard.description,
        collectionId: dashboard.collectionId,
        updatedAt: dashboard.updatedAt,
        href: `/analytics/dashboards/${encodeURIComponent(dashboard.id)}`,
      })),
      ...charts.map((chart) => ({
        id: chart.id,
        kind: 'CHART' as const,
        title: chart.title,
        description: chart.description,
        collectionId: chart.collectionId,
        updatedAt: chart.updatedAt,
        fromChat: chart.provenance === 'CHAT',
        href: `/analytics/charts/${encodeURIComponent(chart.id)}`,
      })),
    ];
    return all.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [charts, dashboards]);

  const inScope = useMemo(
    () => (scopeIds ? items.filter((item) => scopeIds.has(item.collectionId)) : items),
    [items, scopeIds],
  );
  const filtered = useMemo(
    () =>
      inScope.filter(
        (item) => (typeFilter === 'ALL' || item.kind === typeFilter) && matches(item, query.trim()),
      ),
    [inScope, query, typeFilter],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [current, filtered],
  );

  const recent = useMemo(() => {
    const order = new Map(recentIds.map((id, index) => [id, index]));
    return inScope
      .filter((item) => order.has(item.id))
      .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
      .slice(0, RECENT_SHOWN);
  }, [inScope, recentIds]);

  const roots = visible.filter((collection) => collection.parentId === null);
  const curatable = visible.filter((collection) => collection.access === 'CURATE');
  const createParent = scope?.access === 'CURATE' ? scope : roots[0];
  const newChartQuery = scope ? `?collectionId=${encodeURIComponent(scope.id)}` : '';
  const searchable = inScope.length > SEARCH_THRESHOLD || query.length > 0;

  return (
    <main className="min-h-[calc(100vh-8rem)]" aria-label={t('analytics.library')}>
      {/* The page is "Analytics". It used to title itself with whichever
          collection was open — a container's name, repeated from the rail
          beside it and the nav beside that. */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-6">
        <h1 className="text-heading-2">{t('nav.analytics')}</h1>
        <div className="flex items-center gap-2">
          {searchable ? (
            <SearchField
              className="w-full sm:w-72"
              aria-label={t('analytics.searchLibrary')}
              placeholder={t('analytics.searchLibrary')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              onClear={() => {
                setQuery('');
                setPage(1);
              }}
              clearLabel={t('analytics.clearSearch')}
            />
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" className="gap-1.5">
                <PlusIcon aria-hidden="true" /> {t('analytics.new')}{' '}
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link
                  href={`/analytics/charts/new${newChartQuery}${newChartQuery ? '&' : '?'}entry=question`}
                >
                  <BarChart3Icon aria-hidden="true" /> {t('analytics.newQuestion')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/analytics/charts/new${newChartQuery}${newChartQuery ? '&' : '?'}entry=sql`}
                >
                  <Code2Icon aria-hidden="true" /> {t('analytics.newSqlQuery')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={curatable.length === 0}
                onSelect={() => {
                  setDashboardName('');
                  setDashboardDescription('');
                  setDashboardCollectionId(createParent?.id ?? curatable[0]?.id ?? '');
                  setDashboardDialogOpen(true);
                }}
              >
                <LayoutDashboardIcon aria-hidden="true" /> {t('analytics.newDashboard')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!createParent}
                onSelect={() => {
                  setName('');
                  setDialog({ mode: 'CREATE' });
                }}
              >
                <FolderPlusIcon aria-hidden="true" /> {t('analytics.newCollection')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {error ? (
        <PageAlert tone="error" className="mb-5">
          {error}
        </PageAlert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* A scope filter, not a tree of destinations. Counts come from
            `chartCount`, which Core has always sent and nothing rendered. */}
        <nav className="space-y-0.5" aria-label={t('analytics.scope')}>
          <ScopeLink
            href="/analytics"
            icon={<LayersIcon aria-hidden="true" className="size-4 shrink-0" />}
            label={t('analytics.everything')}
            count={items.length}
            active={!scope}
          />
          {roots.map((root) => (
            <Fragment key={root.id}>
              <ScopeLink
                href={`/analytics/collections/${encodeURIComponent(root.id)}`}
                icon={
                  root.kind === 'PERSONAL' ? (
                    <UserRoundIcon aria-hidden="true" className="size-4 shrink-0" />
                  ) : (
                    <FolderIcon aria-hidden="true" className="size-4 shrink-0" />
                  )
                }
                label={labelFor(root)}
                count={countIn(root.id, visible, items)}
                active={scope?.id === root.id}
              />
              {visible
                .filter((child) => child.parentId === root.id)
                .map((child) => (
                  <ScopeLink
                    key={child.id}
                    href={`/analytics/collections/${encodeURIComponent(child.id)}`}
                    icon={<FolderIcon aria-hidden="true" className="size-4 shrink-0" />}
                    label={labelFor(child)}
                    count={countIn(child.id, visible, items)}
                    active={scope?.id === child.id}
                    nested
                    actions={
                      child.access === 'CURATE' ? (
                        <CollectionMenu
                          collection={child}
                          working={working}
                          t={t}
                          onRename={() => {
                            setName(child.name);
                            setDialog({ mode: 'RENAME', collection: child });
                          }}
                          onMove={() => {
                            setMovingParentId(child.parentId ?? '');
                            setDialog({ mode: 'MOVE', collection: child });
                          }}
                          onArchive={async () => {
                            setWorking(true);
                            try {
                              await onArchive(child.id);
                            } finally {
                              setWorking(false);
                            }
                          }}
                        />
                      ) : null
                    }
                  />
                ))}
            </Fragment>
          ))}
        </nav>

        <section className="min-w-0 space-y-6" aria-label={t('analytics.libraryContent')}>
          {loading ? (
            <LibrarySkeleton />
          ) : (
            <>
              {recent.length > 0 && !query && typeFilter === 'ALL' ? (
                <section aria-label={t('analytics.recent')}>
                  <h2 className="mb-2 text-label text-muted-foreground">{t('analytics.recent')}</h2>
                  <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {recent.map((item) => (
                      <li key={item.id}>
                        <RecentCard
                          item={item}
                          collectionName={nameOf(item.collectionId, byId, labelFor)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section aria-label={t('analytics.allItems')}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <Tabs
                    value={typeFilter}
                    onValueChange={(value) => {
                      setTypeFilter(value as TypeFilter);
                      setPage(1);
                    }}
                  >
                    <TabsList aria-label={t('analytics.filterByType')}>
                      <TabsTrigger value="ALL">{t('analytics.typeAll')}</TabsTrigger>
                      <TabsTrigger value="DASHBOARD">{t('analytics.typeDashboards')}</TabsTrigger>
                      <TabsTrigger value="CHART">{t('analytics.typeQuestions')}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <span className="text-caption text-muted-foreground tabular-nums">
                    {t('state.itemCount', { count: filtered.length })}
                  </span>
                </div>

                {filtered.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card">
                    <EmptyState
                      mark={<BarChart3Icon aria-hidden="true" />}
                      title={query ? t('analytics.noMatches') : t('analytics.emptyTitle')}
                      description={
                        query ? t('analytics.noMatchesHint') : t('analytics.emptyDescription')
                      }
                      action={
                        query ? (
                          <Button type="button" variant="outline" onClick={() => setQuery('')}>
                            {t('analytics.clearSearch')}
                          </Button>
                        ) : (
                          <Button asChild>
                            <Link
                              href={`/analytics/charts/new${newChartQuery}${newChartQuery ? '&' : '?'}entry=question`}
                            >
                              <BarChart3Icon aria-hidden="true" /> {t('analytics.newQuestion')}
                            </Link>
                          </Button>
                        )
                      }
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {paged.map((item) => (
                      <li key={item.id}>
                        <LibraryRow
                          item={item}
                          collectionName={nameOf(item.collectionId, byId, labelFor)}
                          locale={locale}
                          questionLabel={t('analytics.question')}
                          dashboardLabel={t('analytics.dashboard')}
                          fromChatLabel={t('analytics.fromChat')}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {pageCount > 1 ? (
                  <div className="mt-4">
                    <Pager
                      ariaLabel={t('analytics.libraryPages')}
                      page={current}
                      total={pageCount}
                      onChange={setPage}
                    />
                  </div>
                ) : null}
              </section>
            </>
          )}
        </section>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'RENAME'
                ? t('analytics.renameCollection')
                : dialog?.mode === 'MOVE'
                  ? t('analytics.moveCollection')
                  : t('analytics.createCollection')}
            </DialogTitle>
            <DialogDescription>
              {dialog?.mode === 'MOVE'
                ? t('analytics.moveCollectionHint')
                : createParent
                  ? t('analytics.createCollectionHintIn', { name: labelFor(createParent) })
                  : t('analytics.createCollectionHint')}
            </DialogDescription>
          </DialogHeader>
          {dialog?.mode === 'MOVE' ? (
            <NativeSelect
              aria-label={t('analytics.destinationCollection')}
              value={movingParentId}
              onChange={(event) => setMovingParentId(event.target.value)}
            >
              {curatable
                .filter((candidate) => candidate.id !== dialog.collection.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {labelFor(candidate)}
                  </option>
                ))}
            </NativeSelect>
          ) : (
            <Input
              autoFocus
              aria-label={t('analytics.collectionName')}
              placeholder={t('analytics.collectionNamePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              {t('action.cancel')}
            </Button>
            <Button
              type="button"
              disabled={working || (dialog?.mode !== 'MOVE' && !name.trim())}
              onClick={async () => {
                if (!dialog) return;
                setWorking(true);
                try {
                  const succeeded =
                    dialog.mode === 'CREATE'
                      ? await onCreate(name.trim(), createParent?.id ?? null)
                      : dialog.mode === 'RENAME'
                        ? await onRename(dialog.collection.id, name.trim())
                        : await onMove(dialog.collection.id, movingParentId || null);
                  if (succeeded) setDialog(null);
                } finally {
                  setWorking(false);
                }
              }}
            >
              {working
                ? t('analytics.saving')
                : dialog?.mode === 'MOVE'
                  ? t('analytics.move')
                  : t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dashboardDialogOpen} onOpenChange={setDashboardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('analytics.newDashboardTitle')}</DialogTitle>
            <DialogDescription>{t('analytics.newDashboardHintAny')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="grid gap-2 text-label">
              {t('analytics.dashboardNameLabel')}
              <Input
                autoFocus
                aria-label={t('analytics.dashboardName')}
                placeholder={t('analytics.dashboardNamePlaceholder')}
                value={dashboardName}
                onChange={(event) => setDashboardName(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-label">
              {t('analytics.dashboardDescriptionLabel')}
              <Input
                aria-label={t('analytics.dashboardDescription')}
                placeholder={t('analytics.dashboardDescriptionPlaceholder')}
                value={dashboardDescription}
                onChange={(event) => setDashboardDescription(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-label">
              {t('analytics.dashboardCollectionLabel')}
              <NativeSelect
                aria-label={t('analytics.dashboardCollection')}
                value={dashboardCollectionId}
                onChange={(event) => setDashboardCollectionId(event.target.value)}
                className="font-normal"
              >
                {curatable.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {labelFor(collection)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDashboardDialogOpen(false)}>
              {t('action.cancel')}
            </Button>
            <Button
              type="button"
              disabled={working || !dashboardName.trim() || !dashboardCollectionId}
              onClick={async () => {
                if (!dashboardCollectionId) return;
                setWorking(true);
                try {
                  const succeeded = await onCreateDashboard(
                    dashboardName.trim(),
                    dashboardDescription.trim() || null,
                    dashboardCollectionId,
                  );
                  if (succeeded) setDashboardDialogOpen(false);
                } finally {
                  setWorking(false);
                }
              }}
            >
              {working ? t('analytics.creating') : t('analytics.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function descendantIds(id: string, all: readonly ChartCollection[]): ReadonlySet<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const collection of all) {
      if (collection.parentId && ids.has(collection.parentId) && !ids.has(collection.id)) {
        ids.add(collection.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** What the rail counts: everything the scope would show, nesting included. */
function countIn(
  id: string,
  all: readonly ChartCollection[],
  items: readonly LibraryItem[],
): number {
  const ids = descendantIds(id, all);
  return items.filter((item) => ids.has(item.collectionId)).length;
}

function nameOf(
  id: string,
  byId: ReadonlyMap<string, ChartCollection>,
  labelFor: (collection: ChartCollection) => string,
): string | null {
  const collection = byId.get(id);
  return collection ? labelFor(collection) : null;
}

function matches(item: LibraryItem, query: string): boolean {
  if (!query) return true;
  const needle = query.toLocaleLowerCase();
  return (
    item.title.toLocaleLowerCase().includes(needle) ||
    (item.description ?? '').toLocaleLowerCase().includes(needle)
  );
}

function ScopeLink({
  href,
  icon,
  label,
  count,
  active,
  nested = false,
  actions,
}: {
  readonly href: string;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly nested?: boolean;
  readonly actions?: React.ReactNode;
}) {
  return (
    <div className={cn('group/scope flex items-center gap-1', nested && 'ml-3')}>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-body-sm font-medium transition-colors',
          active
            ? 'bg-sidebar-selected text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{count}</span>
      </Link>
      {actions ? (
        <div className="shrink-0 opacity-0 transition-opacity group-focus-within/scope:opacity-100 group-hover/scope:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function CollectionMenu({
  collection,
  working,
  t,
  onRename,
  onMove,
  onArchive,
}: {
  readonly collection: ChartCollection;
  readonly working: boolean;
  readonly t: Translator;
  readonly onRename: () => void;
  readonly onMove: () => void;
  readonly onArchive: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('analytics.actionsFor', { name: collection.name })}
          disabled={working}
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRename}>
          <PencilIcon aria-hidden="true" /> {t('analytics.rename')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onMove}>
          <FolderInputIcon aria-hidden="true" /> {t('analytics.move')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void onArchive()}>
          <ArchiveIcon aria-hidden="true" /> {t('analytics.archive')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RecentCard({
  item,
  collectionName,
}: {
  readonly item: LibraryItem;
  readonly collectionName: string | null;
}) {
  const Icon = item.kind === 'DASHBOARD' ? LayoutDashboardIcon : BarChart3Icon;
  return (
    <Link
      href={item.href}
      className="flex h-full min-w-0 items-start gap-2.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-ring/40 hover:bg-accent"
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-medium">{item.title}</span>
        {collectionName ? (
          <span className="mt-0.5 block truncate text-caption text-muted-foreground">
            {collectionName}
          </span>
        ) : null}
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

function LibrarySkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <Skeleton key={card} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            className="flex items-center gap-3 border-b border-border p-4 last:border-0"
          >
            <Skeleton className="size-4 shrink-0 rounded-xs" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-64 max-w-full" />
              <Skeleton className="h-3 w-96 max-w-full" />
            </div>
            <Skeleton className="hidden h-3 w-16 shrink-0 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
