import type { ReactNode } from 'react';

import type {
  CatalogViewModel,
  NamespaceViewModel,
  TableSummaryViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';
import type { AsyncState } from '@/app/_components/catalog/catalog-view-state';
import { cn } from '@/app/_components/ui/utils';
import { namespaceKeyOf, tableKeyOf } from './tree-keys';

const nodeListClass = 'm-0 grid list-none gap-[2px] p-0';
const childListClass =
  'm-0 mt-[2px] mb-1 grid list-none gap-[2px] border-l border-border p-0 pl-[14px]';
const nodeButtonClass =
  'flex w-full cursor-pointer items-center gap-2 rounded-lg border border-transparent bg-transparent py-2 text-left hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-border';
const chevronClass =
  'mx-px size-0 flex-none border-y-4 border-y-transparent border-l-[5px] border-l-muted-foreground transition-transform duration-150 ease-[ease]';

interface CatalogTreeProps {
  readonly catalogs: readonly CatalogViewModel[];
  readonly expandedCatalogs: ReadonlySet<string>;
  readonly expandedNamespaces: ReadonlySet<string>;
  readonly namespaceStates: Readonly<
    Record<string, AsyncState<readonly NamespaceViewModel[]> | undefined>
  >;
  readonly tableStates: Readonly<
    Record<string, AsyncState<readonly TableSummaryViewModel[]> | undefined>
  >;
  readonly selectedTableKey: string | undefined;
  readonly onToggleCatalog: (catalog: CatalogViewModel) => void;
  readonly onToggleNamespace: (namespace: NamespaceViewModel) => void;
  readonly onSelectTable: (table: TableSummaryViewModel) => void;
  readonly onRetryNamespaces: (catalog: CatalogViewModel) => void;
  readonly onRetryTables: (namespace: NamespaceViewModel) => void;
}

export function CatalogTree({
  catalogs,
  expandedCatalogs,
  expandedNamespaces,
  namespaceStates,
  tableStates,
  selectedTableKey,
  onToggleCatalog,
  onToggleNamespace,
  onSelectTable,
  onRetryNamespaces,
  onRetryTables,
}: CatalogTreeProps) {
  return (
    <ul className={nodeListClass} role="tree" aria-label="Data catalog">
      {catalogs.map((catalog) => {
        const open = expandedCatalogs.has(catalog.name);
        return (
          <li key={catalog.name} role="treeitem" aria-expanded={open} aria-selected={false}>
            <button
              className={cn(nodeButtonClass, 'px-[9px]')}
              type="button"
              onClick={() => onToggleCatalog(catalog)}
            >
              <span className={cn(chevronClass, open && 'rotate-90')} aria-hidden="true" />
              <span className="grid min-w-0 gap-px">
                <span className="overflow-hidden text-body-sm font-semibold text-ellipsis whitespace-nowrap">
                  {catalog.name}
                </span>
                <span className="overflow-hidden font-mono text-micro text-ellipsis whitespace-nowrap text-muted-foreground">
                  Managed Iceberg
                </span>
              </span>
              <span
                className="ml-auto flex-none rounded-full border border-border bg-accent px-[7px] py-[3px] font-mono text-micro font-semibold text-primary"
                title={`JDBC catalog identity: ${catalog.jdbcCatalogIdentity}`}
              >
                {catalog.jdbcCatalogIdentity}
              </span>
            </button>

            {open ? (
              <ul className={childListClass} role="group">
                {renderNamespaceLevel(
                  catalog,
                  namespaceStates[catalog.name],
                  expandedNamespaces,
                  tableStates,
                  selectedTableKey,
                  onToggleNamespace,
                  onSelectTable,
                  onRetryNamespaces,
                  onRetryTables,
                )}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function renderNamespaceLevel(
  catalog: CatalogViewModel,
  state: AsyncState<readonly NamespaceViewModel[]> | undefined,
  expandedNamespaces: ReadonlySet<string>,
  tableStates: Readonly<Record<string, AsyncState<readonly TableSummaryViewModel[]> | undefined>>,
  selectedTableKey: string | undefined,
  onToggleNamespace: (namespace: NamespaceViewModel) => void,
  onSelectTable: (table: TableSummaryViewModel) => void,
  onRetryNamespaces: (catalog: CatalogViewModel) => void,
  onRetryTables: (namespace: NamespaceViewModel) => void,
): ReactNode {
  if (!state || state.status === 'loading') {
    return <StateRow kind="loading" label="Loading namespaces" />;
  }

  if (state.status === 'error') {
    return (
      <StateRow kind="error" label={state.message} onRetry={() => onRetryNamespaces(catalog)} />
    );
  }

  if (state.data.length === 0) {
    return <StateRow kind="empty" label="No namespaces in this catalog" />;
  }

  return state.data.map((namespace) => {
    const key = namespaceKeyOf(namespace);
    const open = expandedNamespaces.has(key);
    return (
      <li key={key} role="treeitem" aria-expanded={open} aria-selected={false}>
        <button
          className={cn(nodeButtonClass, 'px-[9px]')}
          type="button"
          onClick={() => onToggleNamespace(namespace)}
        >
          <span className={cn(chevronClass, open && 'rotate-90')} aria-hidden="true" />
          <span className="grid min-w-0 gap-px">
            <span className="text-body-sm font-[650]">{namespace.name}</span>
          </span>
        </button>

        {open ? (
          <ul className={childListClass} role="group">
            {renderTableLevel(
              namespace,
              tableStates[key],
              selectedTableKey,
              onSelectTable,
              onRetryTables,
            )}
          </ul>
        ) : null}
      </li>
    );
  });
}

function renderTableLevel(
  namespace: NamespaceViewModel,
  state: AsyncState<readonly TableSummaryViewModel[]> | undefined,
  selectedTableKey: string | undefined,
  onSelectTable: (table: TableSummaryViewModel) => void,
  onRetryTables: (namespace: NamespaceViewModel) => void,
): ReactNode {
  if (!state || state.status === 'loading') {
    return <StateRow kind="loading" label="Loading tables" />;
  }

  if (state.status === 'error') {
    return <StateRow kind="error" label={state.message} onRetry={() => onRetryTables(namespace)} />;
  }

  if (state.data.length === 0) {
    return <StateRow kind="empty" label="No tables in this namespace" />;
  }

  return state.data.map((table) => {
    const key = tableKeyOf(table);
    const active = selectedTableKey === key;
    return (
      <li key={key} role="none">
        <button
          className={cn(
            nodeButtonClass,
            'pr-[9px] pl-3',
            active && 'border-primary/30 bg-accent hover:bg-accent',
          )}
          type="button"
          role="treeitem"
          aria-selected={active}
          onClick={() => onSelectTable(table)}
        >
          <span
            className={cn(
              'mr-[6px] ml-[3px] size-[6px] flex-none rounded-2xs',
              active ? 'bg-primary' : 'bg-muted-foreground/40',
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              'min-w-0 overflow-hidden text-caption text-ellipsis whitespace-nowrap',
              active && 'font-semibold text-primary',
            )}
          >
            {table.name}
          </span>
          <span className="ml-auto flex-none rounded-xs bg-muted px-[6px] py-[2px] text-micro font-semibold tracking-[0.04em] text-muted-foreground uppercase">
            {shortTableType(table.tableType)}
          </span>
        </button>
      </li>
    );
  });
}

interface StateRowProps {
  readonly kind: 'loading' | 'error' | 'empty';
  readonly label: string;
  readonly onRetry?: () => void;
}

function StateRow({ kind, label, onRetry }: StateRowProps) {
  return (
    <li role="none">
      <div
        className={cn(
          'flex items-center gap-2 px-[10px] py-2 text-caption',
          kind === 'error' ? 'text-destructive' : 'text-muted-foreground',
        )}
        role={kind === 'error' ? 'alert' : 'status'}
      >
        {kind === 'loading' ? (
          <span
            className="size-[13px] flex-none animate-[spin_800ms_linear_infinite] rounded-full border-2 border-border border-t-primary"
            aria-hidden="true"
          />
        ) : null}
        <span>{label}</span>
        {kind === 'error' && onRetry ? (
          <button
            className="cursor-pointer border-0 bg-transparent p-0 text-caption font-semibold text-primary underline hover:text-primary/80 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-border"
            type="button"
            onClick={onRetry}
          >
            Retry
          </button>
        ) : null}
      </div>
    </li>
  );
}

function shortTableType(tableType: string): string {
  return tableType.trim().toUpperCase() === 'BASE TABLE' ? 'TABLE' : tableType;
}
