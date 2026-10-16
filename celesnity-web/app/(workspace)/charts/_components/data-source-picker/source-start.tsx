'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ChevronRightIcon,
  ClockIcon,
  DatabaseIcon,
  FolderIcon,
  RefreshCwIcon,
  SearchIcon,
  Table2Icon,
} from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { cn } from '@/app/_components/ui/utils';
import { useAnalyticsRecentsStore } from '@/app/_stores/analytics-recents.store';
import type { TableRef } from '@/src/entities/models/catalog';

import { ScrollablePickerList } from '../ui/scrollable-picker-list';
import type { DataSourceBrowserControllers, DataSourceSelection } from './data-source-picker.types';
import { useDataSourceBrowser } from './use-data-source-browser';

/**
 * The first thing a new question shows.
 *
 * It used to be a 448×120px box in the top-left corner of a full-bleed page:
 * `catalog → schema → table`, one level at a time, with a "Browse all data"
 * dialog behind it holding the same three lists at a quarter the width. It
 * assumed you already knew the warehouse and offered no recall of what you
 * queried yesterday.
 *
 * The three columns are on the page now — the dialog had no capability this
 * does not — and the tables you have used come first, because the common case
 * is asking another question of a table you already work with.
 */
export function SourceStart({
  controllers,
  onSelect,
  title,
}: {
  readonly controllers: DataSourceBrowserControllers;
  readonly onSelect: (selection: DataSourceSelection) => void;
  readonly title: string;
}) {
  const browser = useDataSourceBrowser({ controllers });
  const [catalog, setCatalog] = useState('');
  const [schema, setSchema] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const recentTables = useAnalyticsRecentsStore((state) => state.tables);
  useEffect(() => {
    void useAnalyticsRecentsStore.persist.rehydrate();
  }, []);

  const needle = search.trim().toLowerCase();
  const catalogs = useMemo(
    () => browser.catalogs.filter((item) => item.name.toLowerCase().includes(needle)),
    [browser.catalogs, needle],
  );
  const namespaces = useMemo(
    () => browser.namespaces.filter((item) => item.name.toLowerCase().includes(needle)),
    [browser.namespaces, needle],
  );
  const tables = useMemo(
    () => browser.tables.filter((item) => item.name.toLowerCase().includes(needle)),
    [browser.tables, needle],
  );

  async function choose(ref: TableRef): Promise<void> {
    setBusy(`${ref.catalog}.${ref.schema}.${ref.table}`);
    try {
      const metadata = await browser.loadTableMetadata(ref);
      if (metadata) onSelect({ ...ref, columns: metadata.columns });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-5" aria-label="Data step" role="region">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title">{title}</h2>
        <label className="relative w-full sm:w-80">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search the data catalog"
            placeholder="Search catalogs, schemas, or tables"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      {browser.error ? (
        <PageAlert tone="error">
          <span className="flex items-center justify-between gap-3">
            {browser.error}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void browser.loadCatalogs()}
            >
              <RefreshCwIcon aria-hidden="true" /> Retry
            </Button>
          </span>
        </PageAlert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {recentTables.length > 0 ? (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-label text-muted-foreground">
              <ClockIcon aria-hidden="true" className="size-3.5" /> Recent tables
            </h3>
            <ul
              className="overflow-hidden rounded-xl border border-border bg-card"
              aria-label="Recent tables"
            >
              {recentTables.slice(0, 6).map((entry) => (
                <li key={`${entry.catalog}.${entry.schema}.${entry.table}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2.5 text-left"
                    disabled={busy !== null}
                    onClick={() =>
                      void choose({
                        catalog: entry.catalog,
                        schema: entry.schema,
                        table: entry.table,
                      })
                    }
                  >
                    <Table2Icon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-medium">{entry.table}</span>
                      <span className="block truncate text-caption font-normal text-muted-foreground">
                        {entry.catalog} / {entry.schema}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={cn(recentTables.length === 0 && 'lg:col-span-2')}>
          <h3 className="mb-2 text-label text-muted-foreground">Browse</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <BrowserColumn label="Catalogs" icon={<DatabaseIcon aria-hidden="true" />}>
              <ScrollablePickerList ariaLabel="Catalogs">
                {catalogs.map((item) => (
                  <PickerButton
                    key={item.name}
                    label={item.name}
                    selected={catalog === item.name}
                    icon={<DatabaseIcon aria-hidden="true" className="size-4" />}
                    onClick={() => {
                      setCatalog(item.name);
                      setSchema('');
                      void browser.loadNamespaces(item.name);
                    }}
                  />
                ))}
                {browser.loading === 'CATALOGS' ? <LoadingRow /> : null}
              </ScrollablePickerList>
            </BrowserColumn>

            <BrowserColumn label="Schemas" icon={<FolderIcon aria-hidden="true" />}>
              <ScrollablePickerList ariaLabel="Schemas">
                {catalog ? (
                  namespaces.map((item) => (
                    <PickerButton
                      key={`${item.catalog}.${item.name}`}
                      label={item.name}
                      selected={schema === item.name}
                      icon={<FolderIcon aria-hidden="true" className="size-4" />}
                      onClick={() => {
                        setSchema(item.name);
                        void browser.loadTables(catalog, item.name);
                      }}
                    />
                  ))
                ) : (
                  <Hint>Pick a catalog</Hint>
                )}
                {browser.loading === 'NAMESPACES' ? <LoadingRow /> : null}
              </ScrollablePickerList>
            </BrowserColumn>

            <BrowserColumn label="Tables" icon={<Table2Icon aria-hidden="true" />}>
              <ScrollablePickerList ariaLabel="Tables">
                {schema ? (
                  tables.map((item) => (
                    <PickerButton
                      key={`${item.catalog}.${item.schema}.${item.name}`}
                      label={item.name}
                      hint={item.tableType}
                      icon={<Table2Icon aria-hidden="true" className="size-4" />}
                      onClick={() => void choose({ catalog, schema, table: item.name })}
                    />
                  ))
                ) : (
                  <Hint>Pick a schema</Hint>
                )}
                {browser.loading === 'TABLES' || browser.loading === 'METADATA' ? (
                  <LoadingRow />
                ) : null}
              </ScrollablePickerList>
            </BrowserColumn>
          </div>
        </div>
      </div>
    </section>
  );
}

function BrowserColumn({
  label,
  icon,
  children,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section
      className="flex min-h-64 flex-col gap-2 rounded-xl border border-border bg-card p-2"
      aria-label={label}
    >
      <h4 className="flex items-center gap-2 px-2 py-1 text-caption font-medium text-muted-foreground uppercase">
        {icon}
        {label}
      </h4>
      {children}
    </section>
  );
}

function PickerButton({
  label,
  icon,
  hint,
  selected = false,
  onClick,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly hint?: string;
  readonly selected?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={selected ? 'secondary' : 'ghost'}
      className="w-full justify-between gap-2"
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2 truncate">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate text-left">{label}</span>
      </span>
      {hint ? (
        <span className="ml-auto shrink-0 text-micro text-muted-foreground">{hint}</span>
      ) : (
        <ChevronRightIcon aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
}

function Hint({ children }: { readonly children: ReactNode }) {
  return <p className="px-3 py-2 text-caption text-muted-foreground">{children}</p>;
}

function LoadingRow() {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 text-caption text-muted-foreground"
      aria-live="polite"
    >
      <RefreshCwIcon aria-hidden="true" className="size-3 animate-spin" /> Loading…
    </div>
  );
}
