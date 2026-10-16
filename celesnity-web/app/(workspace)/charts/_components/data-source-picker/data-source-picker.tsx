'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FolderIcon,
  RefreshCwIcon,
  SearchIcon,
  Table2Icon,
  XIcon,
} from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import type { TableRef } from '@/src/entities/models/catalog';

import { ScrollablePickerList } from '../ui/scrollable-picker-list';
import type { DataSourcePickerLevel, DataSourcePickerProps } from './data-source-picker.types';
import { useDataSourceBrowser } from './use-data-source-browser';

/** Compact one-level Data Catalog picker with a fixed Browse all footer. */
export function DataSourcePicker({
  mode,
  catalogLock,
  controllers,
  onSelect,
}: DataSourcePickerProps) {
  const browser = useDataSourceBrowser({ controllers, catalogLock });
  const [level, setLevel] = useState<DataSourcePickerLevel>('CATALOG');
  const [catalog, setCatalog] = useState(catalogLock ?? '');
  const [schema, setSchema] = useState('');
  const [search, setSearch] = useState('');

  const normalizedSearch = search.trim().toLowerCase();
  const visibleCatalogs = useMemo(
    () =>
      browser.catalogs
        .filter((item) => !catalogLock || item.name === catalogLock)
        .filter((item) => item.name.toLowerCase().includes(normalizedSearch)),
    [browser.catalogs, catalogLock, normalizedSearch],
  );
  const visibleNamespaces = useMemo(
    () => browser.namespaces.filter((item) => item.name.toLowerCase().includes(normalizedSearch)),
    [browser.namespaces, normalizedSearch],
  );
  const visibleTables = useMemo(
    () => browser.tables.filter((item) => item.name.toLowerCase().includes(normalizedSearch)),
    [browser.tables, normalizedSearch],
  );

  function chooseCatalog(nextCatalog: string): void {
    setCatalog(nextCatalog);
    setSchema('');
    setSearch('');
    if (nextCatalog) {
      setLevel('NAMESPACE');
      void browser.loadNamespaces(nextCatalog);
    } else {
      setLevel('CATALOG');
    }
  }

  function chooseSchema(nextSchema: string): void {
    setSchema(nextSchema);
    setSearch('');
    if (!nextSchema) {
      setLevel('NAMESPACE');
      return;
    }
    if (mode === 'TABLE') {
      setLevel('TABLE');
      void browser.loadTables(catalog, nextSchema);
    } else {
      onSelect({ catalog, schema: nextSchema, columns: [] });
    }
  }

  async function chooseTable(table: string): Promise<void> {
    const ref: TableRef = { catalog, schema, table };
    const metadata = await browser.loadTableMetadata(ref);
    if (metadata) onSelect({ catalog, schema, table, columns: metadata.columns });
  }

  function retry(): void {
    if (level === 'CATALOG') void browser.loadCatalogs();
    else if (level === 'NAMESPACE' && catalog) void browser.loadNamespaces(catalog);
    else if (level === 'TABLE' && catalog && schema) void browser.loadTables(catalog, schema);
  }

  const title = mode === 'TABLE' ? null : 'Choose query context';
  const placeholder =
    level === 'CATALOG'
      ? 'Search catalogs'
      : level === 'NAMESPACE'
        ? 'Search schemas'
        : 'Search tables';
  const loadingKind =
    level === 'CATALOG' ? 'CATALOGS' : level === 'NAMESPACE' ? 'NAMESPACES' : 'TABLES';
  const listLabel = level === 'CATALOG' ? 'Catalogs' : level === 'NAMESPACE' ? 'Schemas' : 'Tables';

  return (
    <section className="max-w-md space-y-3" aria-label="Data source picker">
      {title ? (
        <div>
          <h3 className="text-label">{title}</h3>
          <p className="text-caption text-muted-foreground">
            Search the Data Catalog and choose a source for this question.
          </p>
        </div>
      ) : null}
      <div className="relative w-full">
        <SearchIcon
          aria-hidden="true"
          className="absolute top-3 left-3 size-4 text-muted-foreground"
        />
        <Input
          aria-label="Search data catalog"
          className="h-11 border-0 bg-muted pl-10 pr-10 text-body-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={placeholder}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-2.5 right-2"
            aria-label="Clear catalog search"
            onClick={() => setSearch('')}
          >
            <XIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div>
        <div
          className="mb-1 flex items-center gap-2 text-caption text-muted-foreground"
          aria-live="polite"
        >
          {level !== 'CATALOG' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => (level === 'TABLE' ? setLevel('NAMESPACE') : chooseCatalog(''))}
            >
              <ArrowLeftIcon aria-hidden="true" />
              {level === 'TABLE' ? schema : 'All catalogs'}
            </Button>
          ) : null}
          {browser.loading ? <span>Loading…</span> : null}
        </div>
        <ScrollablePickerList ariaLabel={listLabel}>
          {level === 'CATALOG'
            ? visibleCatalogs.map((item) => (
                <Button
                  key={item.name}
                  type="button"
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => chooseCatalog(item.name)}
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <DatabaseIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                    {item.name}
                  </span>
                  <ChevronRightIcon aria-hidden="true" className="size-4" />
                </Button>
              ))
            : null}
          {level === 'NAMESPACE'
            ? visibleNamespaces.map((item) => (
                <Button
                  key={`${item.catalog}.${item.name}`}
                  type="button"
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => chooseSchema(item.name)}
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <FolderIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                    {item.name}
                  </span>
                  <ChevronRightIcon aria-hidden="true" className="size-4" />
                </Button>
              ))
            : null}
          {level === 'TABLE'
            ? visibleTables.map((item) => (
                <Button
                  key={`${item.catalog}.${item.schema}.${item.name}`}
                  type="button"
                  variant="ghost"
                  className="w-full justify-start gap-2"
                  onClick={() => void chooseTable(item.name)}
                >
                  <Table2Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  <span className="truncate text-left">{item.name}</span>
                  <span className="ml-auto text-micro text-muted-foreground">{item.tableType}</span>
                </Button>
              ))
            : null}
          {browser.loading === loadingKind || browser.loading === 'METADATA' ? (
            <LoadingRow />
          ) : null}
        </ScrollablePickerList>
      </div>
      {browser.error ? (
        <div
          className="flex max-w-sm items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-caption text-destructive"
          role="alert"
        >
          <span>{browser.error}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Refresh data catalog"
            onClick={retry}
          >
            <RefreshCwIcon aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </section>
  );
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
