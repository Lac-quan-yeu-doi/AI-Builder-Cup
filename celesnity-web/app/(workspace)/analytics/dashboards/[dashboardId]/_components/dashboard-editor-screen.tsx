'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3Icon,
  CalendarIcon,
  ChevronDownIcon,
  HeadingIcon,
  LayoutGridIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  TextIcon,
  XIcon,
} from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/_components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { useTranslation } from '@/app/_i18n/use-translation';
import { Input } from '@/app/_components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/_components/ui/popover';
import type { DashboardEditorState } from './dashboard-editor-state';
import type { ChartSummary } from '@/src/entities/models/canonical-chart';
import type { DashboardFilterTargetOption } from '@/src/entities/models/dashboard-runtime';
import type {
  DashboardCard,
  DashboardFilter,
  DashboardFilterMapping,
  DashboardGeometry,
  DashboardTab,
} from '@/src/entities/models/dashboard';
import { dashboardCardGeometry, dashboardContentVariables } from '@/src/entities/models/dashboard';
import { DashboardFilterSettings } from './dashboard-filter-settings';
import { DashboardGrid, dashboardGridStyle } from './dashboard-grid';
import { DashboardEditorChartPreview } from './dashboard-editor-chart-preview';

export function DashboardEditorScreen({
  state,
  charts,
  filterTargets,
  onRename,
  onAddCard,
  onUpdateCard,
  onRemoveCard,
  onAddTab,
  onUpdateTab,
  onRemoveTab,
  onAddFilter,
  onUpdateFilter,
  onReplaceFilterMappings,
  onRemoveFilter,
  onCancel,
  onSave,
  onReload,
  onSaveAsCopy,
}: {
  readonly state: DashboardEditorState;
  readonly charts: readonly ChartSummary[];
  readonly filterTargets?: readonly DashboardFilterTargetOption[];
  readonly onRename: (name: string, description: string | null) => void;
  readonly onAddCard: (card: DashboardCard) => void;
  readonly onUpdateCard: (card: DashboardCard) => void;
  readonly onRemoveCard: (cardId: string) => void;
  readonly onAddTab?: (tab: DashboardTab) => void;
  readonly onUpdateTab?: (tab: DashboardTab) => void;
  readonly onRemoveTab?: (tabId: string) => void;
  readonly onAddFilter: (filter: DashboardFilter) => void;
  readonly onUpdateFilter?: (filter: DashboardFilter) => void;
  readonly onReplaceFilterMappings?: (
    filterId: string,
    mappings: readonly DashboardFilterMapping[],
  ) => void;
  readonly onRemoveFilter: (filterId: string) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly onReload: () => void;
  readonly onSaveAsCopy: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [chartPicker, setChartPicker] = useState<DashboardGeometry | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [chartSearch, setChartSearch] = useState('');
  const [presetSlots, setPresetSlots] = useState<readonly DashboardGeometry[]>([]);
  const [copyName, setCopyName] = useState(`${state.draft.name} copy`);
  const [selectedFilterId, setSelectedFilterId] = useState<string | null>(null);
  // `window.prompt` and `window.confirm` were the rename and delete flows. A
  // native OS dialog in the middle of a designed editor is a seam, and neither
  // is styleable, translatable or testable.
  const [renamingTab, setRenamingTab] = useState<DashboardTab | null>(null);
  const [tabName, setTabName] = useState('');
  const [deletingTab, setDeletingTab] = useState<DashboardTab | null>(null);
  const orderedTabs = useMemo(
    () => [...state.draft.tabs].sort((left, right) => left.order - right.order),
    [state.draft.tabs],
  );
  const [activeTabId, setActiveTabId] = useState(orderedTabs[0]?.id ?? '');
  const tab = orderedTabs.find((item) => item.id === activeTabId) ?? orderedTabs[0];
  const cards = useMemo(
    () => state.draft.cards.filter((card) => card.tabId === tab?.id),
    [state.draft.cards, tab?.id],
  );
  const selectedFilter = state.draft.filters.find((filter) => filter.id === selectedFilterId);
  const availableFilterTargets = useMemo(
    () => withLocalContentTargets(filterTargets ?? [], state.draft.cards),
    [filterTargets, state.draft.cards],
  );
  const visibleCharts = useMemo(() => {
    const needle = chartSearch.trim().toLocaleLowerCase();
    return needle
      ? charts.filter((chart) => chart.title.toLocaleLowerCase().includes(needle))
      : charts;
  }, [chartSearch, charts]);

  function nextY(): number {
    return cards.reduce((max, card) => Math.max(max, card.geometry.y + card.geometry.height), 0);
  }

  function addContent(kind: 'HEADING' | 'TEXT'): void {
    if (!tab) return;
    onAddCard(
      kind === 'HEADING'
        ? {
            id: makeId(),
            tabId: tab.id,
            kind,
            content: { text: 'Heading' },
            geometry: dashboardCardGeometry(kind, nextY()),
          }
        : {
            id: makeId(),
            tabId: tab.id,
            kind,
            content: { markdown: 'Add text…' },
            geometry: dashboardCardGeometry(kind, nextY()),
          },
    );
  }

  function addChart(chart: ChartSummary): void {
    if (!tab) return;
    const geometry = chartPicker ?? dashboardCardGeometry('TABLE', nextY());
    onAddCard({
      id: makeId(),
      tabId: tab.id,
      kind: 'CHART',
      chartId: chart.id,
      chartRevisionNumber: chart.currentRevisionNumber,
      visualizationOverrides: {},
      geometry,
    });
    setChartPicker(null);
    if (presetSlots.length > 0)
      setPresetSlots((slots) => slots.filter((slot) => slot !== geometry));
  }

  function insertSectionPreset(kind: 'GRID' | 'HERO' | 'STRIP'): void {
    if (!tab) return;
    const y = nextY();
    onAddCard({
      id: makeId(),
      tabId: tab.id,
      kind: 'HEADING',
      content: { text: 'You can connect widgets to {{variables}} in heading cards.' },
      geometry: dashboardCardGeometry('HEADING', y),
    });
    setPresetSlots(sectionPreset(kind, y + 1));
  }

  function duplicateTab(source: DashboardTab): void {
    if (!onAddTab) return;
    const duplicate: DashboardTab = {
      id: makeId(),
      name: `${source.name} copy`,
      order: orderedTabs.length,
    };
    const idMap = new Map<string, string>();
    onAddTab(duplicate);
    for (const card of state.draft.cards.filter((item) => item.tabId === source.id)) {
      const id = makeId();
      idMap.set(card.id, id);
      onAddCard({ ...card, id, tabId: duplicate.id });
    }
    if (onReplaceFilterMappings) {
      for (const filter of state.draft.filters) {
        const mappings = state.draft.mappings.filter((mapping) => mapping.filterId === filter.id);
        const copies = mappings.flatMap((mapping) => {
          const cardId = idMap.get(mapping.cardId);
          return cardId ? [{ ...mapping, cardId }] : [];
        });
        if (copies.length > 0) onReplaceFilterMappings(filter.id, [...mappings, ...copies]);
      }
    }
    setActiveTabId(duplicate.id);
  }

  function moveTab(source: DashboardTab, delta: -1 | 1): void {
    if (!onUpdateTab) return;
    const index = orderedTabs.findIndex((item) => item.id === source.id);
    const target = orderedTabs[index + delta];
    if (!target) return;
    onUpdateTab({ ...source, order: target.order });
    onUpdateTab({ ...target, order: source.order });
  }

  return (
    <main className="min-h-screen bg-muted/20" aria-label="Dashboard editor">
      {/* A mode bar, not a brand bar: it says which mode you are in and offers
          the two ways out. Save is the near-black CTA, as it is everywhere
          else — both buttons used to be `secondary` on a full-bleed blue. */}
      <div className="sticky top-0 z-40 flex h-13 items-center justify-between border-b border-border bg-card px-6">
        <p className="flex items-center gap-2 text-body-sm font-medium">
          <PencilIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          {t('dashboard.editing')}
        </p>
        <div className="flex gap-2">
          {state.dirty ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost">
                  {t('action.cancel')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('dashboard.discardTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('dashboard.discardDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('dashboard.keepEditing')}</AlertDialogCancel>
                  <AlertDialogAction onClick={onCancel}>{t('dashboard.discard')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('action.cancel')}
            </Button>
          )}
          <Button
            type="button"
            disabled={!state.dirty || state.status === 'saving'}
            onClick={onSave}
          >
            {state.status === 'saving' ? t('builder.saving') : t('action.save')}
          </Button>
        </div>
      </div>

      <section className="mx-auto max-w-6xl bg-background px-2 pt-7 md:px-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Input
            aria-label={t('dashboard.name')}
            value={state.draft.name}
            onChange={(event) => onRename(event.target.value, state.draft.description)}
            className="h-auto max-w-xl border-0 px-0 text-heading-3 shadow-none focus-visible:ring-0"
          />
          {/* Six ghost icons in a row — plus, text-with-chevron, link, grid,
              sliders, ellipsis — with nothing to tell them apart but their
              glyphs. They are one labelled Add menu, one Filter control and an
              overflow now. Nothing left reach. */}
          <div className="flex items-center gap-2" aria-label="Dashboard tools">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  <PlusIcon aria-hidden="true" /> {t('dashboard.add')}
                  <ChevronDownIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onSelect={() => setChartPicker(dashboardCardGeometry('TABLE', nextY()))}
                >
                  <BarChart3Icon aria-hidden="true" /> {t('dashboard.addChartItem')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => addContent('HEADING')}>
                  <HeadingIcon aria-hidden="true" /> {t('dashboard.addHeading')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => addContent('TEXT')}>
                  <TextIcon aria-hidden="true" /> {t('dashboard.addText')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    if (!tab) return;
                    onAddCard({
                      id: makeId(),
                      tabId: tab.id,
                      kind: 'LINK',
                      content: { label: 'Link', url: 'https://' },
                      geometry: dashboardCardGeometry('TEXT', nextY()),
                    });
                  }}
                >
                  <LinkIcon aria-hidden="true" /> {t('dashboard.addLink')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-caption text-muted-foreground">
                  {t('dashboard.addSection')}
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => insertSectionPreset('GRID')}>
                  <LayoutGridIcon aria-hidden="true" /> {t('dashboard.sectionGrid')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => insertSectionPreset('HERO')}>
                  <LayoutGridIcon aria-hidden="true" /> {t('dashboard.sectionHero')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => insertSectionPreset('STRIP')}>
                  <LayoutGridIcon aria-hidden="true" /> {t('dashboard.sectionStrip')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline">
                  <SlidersHorizontalIcon aria-hidden="true" /> {t('dashboard.addFilter')}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-2">
                <p className="px-2 py-2 text-caption text-muted-foreground">
                  {t('dashboard.addFilterHint')}
                </p>
                <div className="grid gap-1">
                  {(
                    [
                      'DATE_PICKER',
                      'TIME_GROUPING',
                      'LOCATION',
                      'TEXT_CATEGORY',
                      'NUMBER',
                      'BOOLEAN',
                      'ID',
                    ] as const
                  ).map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant="ghost"
                      className="justify-start"
                      onClick={() => {
                        const created = makeFilter(type, state.draft.filters.length);
                        onAddFilter(created);
                        setSelectedFilterId(created.id);
                        setFilterOpen(false);
                      }}
                    >
                      {filterLabel(type)}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('dashboard.moreOptions')}
            >
              <MoreHorizontalIcon aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* A hand-rolled tablist with no roving tabindex and no aria-controls,
            styled as an underline the skin does not use anywhere else. */}
        <div className="mt-5 flex items-center gap-2 border-b border-border pb-2">
          <Tabs value={tab?.id ?? ''} onValueChange={setActiveTabId}>
            <TabsList aria-label={t('dashboard.tabs')}>
              {orderedTabs.map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {item.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {tab && onUpdateTab ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('dashboard.editTab', { name: tab.name })}
                >
                  <ChevronDownIcon aria-hidden="true" className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => {
                    setRenamingTab(tab);
                    setTabName(tab.name);
                  }}
                >
                  {t('analytics.rename')}
                </DropdownMenuItem>
                {onAddTab ? (
                  <DropdownMenuItem onSelect={() => duplicateTab(tab)}>
                    {t('dashboard.duplicate')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  disabled={orderedTabs[0]?.id === tab.id}
                  onSelect={() => moveTab(tab, -1)}
                >
                  {t('dashboard.moveLeft')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={orderedTabs.at(-1)?.id === tab.id}
                  onSelect={() => moveTab(tab, 1)}
                >
                  {t('dashboard.moveRight')}
                </DropdownMenuItem>
                {orderedTabs.length > 1 && onRemoveTab ? (
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeletingTab(tab)}>
                    {t('dashboard.delete')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('dashboard.addTab')}
            onClick={() => {
              if (!onAddTab) return;
              const created = {
                id: makeId(),
                name: `Tab ${orderedTabs.length + 1}`,
                order: orderedTabs.length,
              };
              onAddTab(created);
              setActiveTabId(created.id);
            }}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        </div>

        {state.draft.filters.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-b border-border py-2">
            {state.draft.filters.map((filter) => (
              <Button
                key={filter.id}
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setSelectedFilterId(filter.id)}
              >
                <CalendarIcon aria-hidden="true" />
                {filter.label}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${filter.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveFilter(filter.id);
                  }}
                >
                  ×
                </span>
              </Button>
            ))}
          </div>
        ) : null}

        {state.error ? (
          <div
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-body-sm text-destructive"
          >
            {state.error}
            {state.status === 'conflict' ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={onReload}>
                  Reload latest
                </Button>
                <Input
                  aria-label="Copy name"
                  value={copyName}
                  onChange={(event) => setCopyName(event.target.value)}
                  className="max-w-56"
                />
                <Button onClick={() => onSaveAsCopy(copyName)}>Save as copy</Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <DashboardGrid
          cards={cards}
          onChange={onUpdateCard}
          onRemove={onRemoveCard}
          onDuplicate={(card) =>
            onAddCard({
              ...card,
              id: makeId(),
              geometry: {
                ...card.geometry,
                x: Math.min(24 - card.geometry.width, card.geometry.x + 1),
                y: card.geometry.y + 1,
              },
            })
          }
          renderChart={(card) => <DashboardEditorChartPreview card={card} />}
        >
          {presetSlots.map((geometry, index) => (
            <button
              key={`${geometry.x}-${geometry.y}-${index}`}
              type="button"
              style={dashboardGridStyle(geometry)}
              className="min-h-32 rounded-lg border border-dashed border-border bg-background [grid-column:1/-1] md:[grid-column:var(--dashboard-column)] md:[grid-row:var(--dashboard-row)]"
              onClick={() => setChartPicker(geometry)}
            >
              Select question
            </button>
          ))}
          {cards.length === 0 && presetSlots.length === 0 ? (
            <div className="col-span-full grid min-h-96 place-items-center text-center">
              <div>
                <BarChart3Icon className="mx-auto size-12 text-muted-foreground" />
                <h2 className="mt-5 text-title">
                  Create a new question or browse your collections for an existing one.
                </h2>
                <Button
                  aria-label="Add a chart to empty dashboard"
                  className="mt-5 min-w-48"
                  onClick={() => setChartPicker(dashboardCardGeometry('TABLE', 0))}
                >
                  Add a chart
                </Button>
              </div>
            </div>
          ) : null}
        </DashboardGrid>
      </section>

      {chartPicker ? (
        <aside
          className="fixed top-13 right-0 z-30 flex h-[calc(100vh-3.25rem)] w-full max-w-96 flex-col border-l border-border bg-background shadow-300"
          aria-label="Add a chart"
        >
          <header className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-title">Add a chart</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close chart picker"
              onClick={() => setChartPicker(null)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </header>
          <div className="grid gap-3 border-b border-border p-4">
            <Input
              aria-label="Search charts"
              placeholder="Search…"
              value={chartSearch}
              onChange={(event) => setChartSearch(event.target.value)}
            />
            <div className="grid gap-2">
              <Button asChild variant="outline">
                <Link href="/analytics/charts/new">New question</Link>
              </Button>
            </div>
            <p className="truncate text-caption text-muted-foreground">
              Our analytics / {state.draft.name}
            </p>
          </div>
          <div className="flex-1 space-y-1 overflow-auto p-2">
            {visibleCharts.map((chart) => (
              <Button
                key={chart.id}
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => addChart(chart)}
              >
                <BarChart3Icon aria-hidden="true" />
                {chart.title}
              </Button>
            ))}
            {visibleCharts.length === 0 ? (
              <p className="py-12 text-center text-body-sm text-muted-foreground">Nothing here</p>
            ) : null}
          </div>
        </aside>
      ) : null}
      {selectedFilter && onUpdateFilter && onReplaceFilterMappings ? (
        <DashboardFilterSettings
          filter={selectedFilter}
          cards={state.draft.cards}
          options={availableFilterTargets}
          mappings={state.draft.mappings.filter(
            (mapping) => mapping.filterId === selectedFilter.id,
          )}
          onChange={onUpdateFilter}
          onMappingsChange={(mappings) => onReplaceFilterMappings(selectedFilter.id, mappings)}
          onRemove={() => {
            onRemoveFilter(selectedFilter.id);
            setSelectedFilterId(null);
          }}
          onDone={() => setSelectedFilterId(null)}
        />
      ) : null}

      <Dialog open={renamingTab !== null} onOpenChange={(open) => !open && setRenamingTab(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.renameTab')}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            aria-label={t('dashboard.tabName')}
            value={tabName}
            onChange={(event) => setTabName(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenamingTab(null)}>
              {t('action.cancel')}
            </Button>
            <Button
              type="button"
              disabled={!tabName.trim()}
              onClick={() => {
                if (renamingTab && onUpdateTab)
                  onUpdateTab({ ...renamingTab, name: tabName.trim() });
                setRenamingTab(null);
              }}
            >
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingTab !== null}
        onOpenChange={(open) => !open && setDeletingTab(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('dashboard.deleteTabTitle', { name: deletingTab?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('dashboard.deleteTabDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingTab && onRemoveTab) onRemoveTab(deletingTab.id);
                setDeletingTab(null);
              }}
            >
              {t('dashboard.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function sectionPreset(kind: 'GRID' | 'HERO' | 'STRIP', y: number): readonly DashboardGeometry[] {
  if (kind === 'GRID')
    return [
      { x: 0, y, width: 12, height: 5 },
      { x: 12, y, width: 12, height: 5 },
      { x: 0, y: y + 5, width: 12, height: 5 },
      { x: 12, y: y + 5, width: 12, height: 5 },
    ];
  if (kind === 'HERO')
    return [
      { x: 0, y, width: 18, height: 10 },
      { x: 18, y, width: 6, height: 5 },
      { x: 18, y: y + 5, width: 6, height: 5 },
    ];
  return [
    ...[0, 6, 12, 18].map((x) => ({ x, y, width: 6, height: 3 })),
    { x: 0, y: y + 3, width: 24, height: 9 },
  ];
}

function makeFilter(type: DashboardFilter['semanticType'], order: number): DashboardFilter {
  const label = filterLabel(type);
  return {
    id: makeId(),
    slug: `${label.toLowerCase().replaceAll(' ', '-')}-${order + 1}`,
    label,
    semanticType: type,
    operator: defaultOperator(type),
    defaultValue: null,
    required: false,
    multiple: false,
    valuesSource: null,
    placement: { kind: 'TOP_OF_PAGE' },
    order,
  };
}

function filterLabel(type: DashboardFilter['semanticType']): string {
  return {
    DATE_PICKER: 'Date picker',
    TIME_GROUPING: 'Time grouping',
    LOCATION: 'Location',
    TEXT_CATEGORY: 'Text or Category',
    NUMBER: 'Number',
    BOOLEAN: 'Boolean',
    ID: 'ID',
  }[type];
}

function defaultOperator(type: DashboardFilter['semanticType']): string {
  if (type === 'DATE_PICKER') return 'ALL_OPTIONS';
  if (type === 'TIME_GROUPING') return 'DAY';
  if (type === 'NUMBER') return 'EQUAL';
  return 'IS';
}

function makeId(): string {
  return globalThis.crypto.randomUUID();
}

function withLocalContentTargets(
  serverOptions: readonly DashboardFilterTargetOption[],
  cards: readonly DashboardCard[],
): readonly DashboardFilterTargetOption[] {
  const chartOptions = serverOptions.filter((option) =>
    cards.some((card) => card.id === option.cardId && card.kind === 'CHART'),
  );
  const semanticTypes: readonly DashboardFilter['semanticType'][] = [
    'DATE_PICKER',
    'TIME_GROUPING',
    'LOCATION',
    'TEXT_CATEGORY',
    'NUMBER',
    'BOOLEAN',
    'ID',
  ];
  const contentOptions = cards.flatMap((card) => {
    if (card.kind === 'CHART') return [];
    const variables = dashboardContentVariables(card);
    return variables.length === 0
      ? []
      : [
          {
            cardId: card.id,
            targets: variables.flatMap((variableName) =>
              semanticTypes.map((semanticType) => ({
                kind: 'CONTENT_VARIABLE' as const,
                variableName,
                semanticType,
              })),
            ),
          },
        ];
  });
  return [...chartOptions, ...contentOptions];
}
