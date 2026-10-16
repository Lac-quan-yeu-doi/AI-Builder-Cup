import { ChevronRightIcon } from 'lucide-react';
import type { TableRef } from '@/src/entities/models/catalog';
import { qualifiedTableName } from '@/src/entities/models/catalog';
import type {
  CatalogColumnViewModel,
  TableMetadataViewModel,
  TablePreviewViewModel,
  TableSnapshotViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';
import type { AsyncState } from '@/app/_components/catalog/catalog-view-state';
import { cn } from '@/app/_components/ui/utils';
import { BlockEmpty, BlockError, BlockLoading } from '@/app/_components/catalog/panel-state';
import type { Translator } from '@/app/_i18n/translate';
import { useTranslation } from '@/app/_i18n/use-translation';

const panelClass = 'px-[18px] py-[22px] sm:px-6';
const panelHeadingClass = 'mb-4 flex items-baseline justify-between gap-[14px]';
const panelTitleClass = 'm-0 text-body-lg font-medium';
const countPillClass =
  'inline-grid h-6 min-w-[26px] place-items-center rounded-full bg-accent px-2 text-caption font-semibold text-primary';
const headerCellClass =
  'sticky top-0 border-b border-border bg-muted px-3 py-[9px] text-left text-micro font-[750] tracking-[0.05em] whitespace-nowrap text-foreground uppercase';
const bodyCellClass = 'border-b border-border px-3 py-[9px] align-top text-foreground';
const badgeClass =
  'inline-flex items-center rounded-full px-2 py-[3px] text-micro font-semibold tracking-[0.02em]';
const metaLabelClass = 'text-micro font-[750] tracking-[0.05em] text-muted-foreground uppercase';
const rowIndexClass = 'sticky left-0 text-right text-micro text-muted-foreground select-none';

interface TableDetailProps {
  readonly table: TableRef;
  readonly metadata: AsyncState<TableMetadataViewModel>;
  readonly snapshots: AsyncState<readonly TableSnapshotViewModel[]>;
  readonly preview: AsyncState<TablePreviewViewModel>;
  readonly onRetryMetadata: () => void;
  readonly onRetrySnapshots: () => void;
  readonly onRetryPreview: () => void;
  readonly liveDeviceName?: string;
}

export function TableDetail({
  table,
  metadata,
  snapshots,
  preview,
  onRetryMetadata,
  onRetrySnapshots,
  onRetryPreview,
  liveDeviceName,
}: TableDetailProps) {
  const { t } = useTranslation();
  const columnCount = metadata.status === 'loaded' ? metadata.data.columns.length : undefined;
  const snapshotCount = snapshots.status === 'loaded' ? snapshots.data.length : undefined;
  const previewPanel = (
    <section
      className={cn(panelClass, liveDeviceName === undefined && 'border-t border-border')}
      aria-label={t('database.table.previewLabel')}
    >
      <div className={panelHeadingClass}>
        <div>
          <h3 className={panelTitleClass}>
            {liveDeviceName === undefined
              ? 'Preview'
              : t('catalog.deviceEventsTitle', { name: liveDeviceName })}
          </h3>
          {liveDeviceName === undefined ? null : (
            <p className="mb-0 mt-1 text-caption text-muted-foreground">
              {t('catalog.deviceEventsLiveDescription')}
            </p>
          )}
        </div>
        <span
          className={cn(
            'text-micro',
            liveDeviceName === undefined ? 'text-muted-foreground' : 'text-status-success-dark',
          )}
        >
          {liveDeviceName === undefined ? 'Server-limited sample' : t('catalog.live')}
        </span>
      </div>
      <div aria-live={liveDeviceName === undefined ? undefined : 'polite'}>
        {renderPreview(preview, onRetryPreview, t)}
      </div>
    </section>
  );

  return (
    <div className="min-w-0 overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border bg-card px-[18px] py-5 sm:px-6">
        <h2 className="m-0 font-mono text-body-md font-semibold wrap-anywhere">
          {qualifiedTableName(table)}
        </h2>
      </header>

      {/* Preview first. The panel used to open on the column list, then a wall
       * of raw Iceberg snapshot metadata — manifest paths, `added-data-files`,
       * `total-equality-deletes` — and only then the rows, which is what most
       * people opened the table to see. */}
      {previewPanel}

      <section
        className={cn(panelClass, 'border-t border-border')}
        aria-label={t('database.table.columnsLabel')}
      >
        <div className={panelHeadingClass}>
          <h3 className={panelTitleClass}>{t('database.table.columns')}</h3>
          {columnCount !== undefined ? <span className={countPillClass}>{columnCount}</span> : null}
        </div>
        {renderColumns(metadata, onRetryMetadata, t)}
      </section>

      {liveDeviceName === undefined ? (
        <section className="border-t border-border" aria-label={t('database.table.historyLabel')}>
          {/* Behind a disclosure: the commit history matters when something
           * looks wrong, and takes more vertical space than the table itself
           * when it does not. */}
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-[18px] py-4 text-body-sm text-muted-foreground hover:text-foreground sm:px-6">
              <ChevronRightIcon
                aria-hidden="true"
                className="shrink-0 transition-transform group-open:rotate-90"
                size={16}
              />
              {t('database.table.history')}
              {snapshotCount !== undefined ? (
                <span className={countPillClass}>{snapshotCount}</span>
              ) : null}
            </summary>
            <div className={cn(panelClass, 'pt-0')}>
              {renderSnapshots(snapshots, onRetrySnapshots, t)}
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}

function renderColumns(
  state: AsyncState<TableMetadataViewModel>,
  onRetry: () => void,
  t: Translator,
) {
  if (state.status === 'loading') {
    return <BlockLoading label={t('database.table.loadingColumns')} />;
  }
  if (state.status === 'error') {
    return <BlockError message={state.message} onRetry={onRetry} />;
  }
  if (state.data.columns.length === 0) {
    return (
      <BlockEmpty
        title={t('database.table.noColumns')}
        description="This table does not expose any columns."
      />
    );
  }

  return (
    <div className="max-w-full overflow-auto">
      <table className="w-full border-collapse text-caption">
        <thead>
          <tr>
            <th className={headerCellClass} scope="col">
              Column
            </th>
            <th className={headerCellClass} scope="col">
              Type
            </th>
            <th className={headerCellClass} scope="col">
              Nullable
            </th>
            <th className={headerCellClass} scope="col">
              Comment
            </th>
          </tr>
        </thead>
        <tbody>
          {state.data.columns.map((column) => (
            <ColumnRow key={`${column.ordinalPosition}-${column.name}`} column={column} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColumnRow({
  column,
  t,
}: {
  readonly column: CatalogColumnViewModel;
  readonly t: Translator;
}) {
  return (
    <tr className="group">
      <td className={cn(bodyCellClass, 'font-[650] group-hover:bg-accent')}>{column.name}</td>
      <td className={cn(bodyCellClass, 'group-hover:bg-accent')}>
        <span className="font-mono text-caption text-primary">{column.dataType}</span>
      </td>
      <td className={cn(bodyCellClass, 'group-hover:bg-accent')}>
        {column.nullable ? (
          <span className={cn(badgeClass, 'bg-muted text-muted-foreground')}>
            {t('database.table.nullable')}
          </span>
        ) : (
          <span className={cn(badgeClass, 'bg-accent text-primary')}>
            {t('database.table.required')}
          </span>
        )}
      </td>
      <td className={cn(bodyCellClass, 'group-hover:bg-accent')}>
        {column.comment ? (
          <span className="text-muted-foreground">{column.comment}</span>
        ) : (
          <span className="text-muted-foreground italic">{t('database.table.none')}</span>
        )}
      </td>
    </tr>
  );
}

function renderSnapshots(
  state: AsyncState<readonly TableSnapshotViewModel[]>,
  onRetry: () => void,
  t: Translator,
) {
  if (state.status === 'loading') {
    return <BlockLoading label={t('database.table.loadingHistory')} />;
  }
  if (state.status === 'error') {
    return <BlockError message={state.message} onRetry={onRetry} />;
  }
  if (state.data.length === 0) {
    return (
      <BlockEmpty
        title="No snapshots"
        description="Trino has not reported any Iceberg snapshots for this table yet."
      />
    );
  }

  return (
    <ul className="m-0 grid list-none gap-[10px] p-0">
      {state.data.map((snapshot) => (
        <SnapshotItem key={snapshot.snapshotId} snapshot={snapshot} t={t} />
      ))}
    </ul>
  );
}

function SnapshotItem({
  snapshot,
  t,
}: {
  readonly snapshot: TableSnapshotViewModel;
  readonly t: Translator;
}) {
  const summaryEntries = Object.entries(snapshot.summary);
  return (
    <li className="rounded-lg border border-border bg-card px-[15px] py-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-caption font-semibold wrap-anywhere text-foreground">
          {snapshot.snapshotId}
        </span>
        {snapshot.operation ? (
          <span className="flex-none rounded-full bg-accent px-[9px] py-[3px] text-micro font-semibold tracking-[0.03em] text-primary uppercase">
            {snapshot.operation}
          </span>
        ) : null}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-[18px] gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        {[
          { label: 'Committed', value: snapshot.committedAt },
          { label: 'Parent', value: snapshot.parentId ?? '—' },
          ...(snapshot.manifestList
            ? [{ label: 'Manifest list', value: snapshot.manifestList }]
            : []),
        ].map((entry) => (
          <div className="grid min-w-0 gap-[2px]" key={entry.label}>
            <dt className={metaLabelClass}>{entry.label}</dt>
            <dd className="m-0 font-mono text-micro leading-[1.45] wrap-anywhere text-foreground">
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>
      {summaryEntries.length > 0 ? (
        <div className="mt-3 border-t border-border pt-[11px]">
          <p className={cn(metaLabelClass, 'mb-[7px]')}>{t('database.table.summary')}</p>
          <div className="flex flex-wrap gap-[6px]">
            {summaryEntries.map(([key, value]) => (
              <span
                className="inline-flex gap-[5px] rounded-sm border border-border bg-card px-[9px] py-1 font-mono text-micro"
                key={key}
              >
                <span className="text-muted-foreground">{key}</span>
                <span className="font-semibold text-foreground">{value}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function renderPreview(
  state: AsyncState<TablePreviewViewModel>,
  onRetry: () => void,
  t: Translator,
) {
  if (state.status === 'loading') {
    return <BlockLoading label={t('database.table.loadingPreview')} />;
  }
  if (state.status === 'error') {
    return <BlockError message={state.message} onRetry={onRetry} />;
  }

  const { columns, rows, rowCount } = state.data;
  if (columns.length === 0 || rows.length === 0) {
    return (
      <BlockEmpty
        title="No rows to preview"
        description="This table returned no rows within the server-side preview limit."
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-caption text-muted-foreground">
        <span>
          {rowCount} {rowCount === 1 ? 'row' : 'rows'} sampled within the server-side limit
        </span>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-caption">
          <thead>
            <tr>
              <th
                className={cn(
                  rowIndexClass,
                  'top-0 border-b border-border bg-muted px-3 py-[9px] whitespace-nowrap',
                )}
                scope="col"
                aria-label={t('database.table.rowNumber')}
              />
              {columns.map((column, index) => (
                <th
                  className="sticky top-0 border-b border-border bg-muted px-3 py-[9px] text-left whitespace-nowrap"
                  key={`${index}-${column.name}`}
                  scope="col"
                >
                  <span className="block text-micro font-[750] tracking-[0.04em] text-foreground uppercase">
                    {column.name}
                  </span>
                  <span className="mt-[2px] block font-mono text-micro font-semibold text-primary normal-case">
                    {column.type}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr className="group" key={rowIndex}>
                <td
                  className={cn(
                    rowIndexClass,
                    'border-b border-border px-3 py-2 group-hover:bg-accent',
                  )}
                >
                  {rowIndex + 1}
                </td>
                {columns.map((column, cellIndex) => {
                  const cell = formatCell(row[cellIndex]);
                  return (
                    <td
                      key={`${rowIndex}-${cellIndex}`}
                      className={cn(
                        'border-b border-border px-3 py-2 font-mono whitespace-pre text-foreground group-hover:bg-accent',
                        cell.isNull && 'text-muted-foreground italic',
                      )}
                    >
                      {cell.text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatCell(value: unknown): { readonly text: string; readonly isNull: boolean } {
  if (value === null || value === undefined) {
    return { text: 'null', isNull: true };
  }
  if (typeof value === 'object') {
    try {
      return { text: JSON.stringify(value), isNull: false };
    } catch {
      return { text: String(value), isNull: false };
    }
  }
  return { text: String(value), isNull: false };
}
