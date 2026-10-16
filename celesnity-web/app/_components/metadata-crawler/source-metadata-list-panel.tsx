'use client';

import type { ReactNode } from 'react';

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { DataTable, type DataTableColumn } from '@/app/_components/ui/data-table';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { Pager } from '@/app/_components/ui/pager';
import { Card } from '@/app/_components/ui/card';
import { NativeSelect } from '@/app/_components/ui/native-select';
import { SearchField } from '@/app/_components/ui/search-field';
import { Spinner } from '@/app/_components/ui/spinner';
import { useTranslation } from '@/app/_i18n/use-translation';

interface Props<Row> {
  readonly title: string;
  /** What the rows belong to, e.g. the schema whose tables these are. */
  readonly context?: string;
  /** Row count for the header badge; omit when it is not known yet. */
  readonly count?: number;
  readonly isRowSelected?: (row: Row) => boolean;
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly sortBy: string;
  readonly sortOptions: readonly { readonly value: string; readonly label: string }[];
  readonly onSortChange: (value: string) => void;
  readonly sortDirection: 'asc' | 'desc';
  readonly onDirectionChange: (value: 'asc' | 'desc') => void;
  readonly rows: readonly Row[] | undefined;
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rowKey: (row: Row) => string;
  readonly emptyMessage: string;
  readonly page: number;
  readonly totalPages: number;
  readonly onPageChange: (page: number) => void;
}

export function SourceMetadataListPanel<Row>({
  title,
  context,
  count,
  isRowSelected,
  search,
  onSearchChange,
  sortBy,
  sortOptions,
  onSortChange,
  sortDirection,
  onDirectionChange,
  rows,
  columns,
  rowKey,
  emptyMessage,
  page,
  totalPages,
  onPageChange,
}: Props<Row>) {
  const { t } = useTranslation();
  return (
    <Card className="grid gap-3 p-4">
      {/* One row, not three stacked labelled fields. Search, sort field and
       * direction spent roughly 230px above every list — more than the rows
       * they filtered — on a screen that stacks three of these panels. */}
      <div className="grid gap-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="m-0 text-body-md font-[650] tracking-[-0.01em]">{title}</h2>
          {context ? (
            <Badge className="font-mono" variant="secondary">
              {context}
            </Badge>
          ) : null}
          {count === undefined ? null : (
            <span className="text-caption text-muted-foreground">{count}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            aria-label={t('metadataExplorer.search')}
            className="min-w-[150px] flex-1"
            placeholder={t('metadataExplorer.searchPlaceholder')}
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            onClear={() => onSearchChange('')}
          />
          <NativeSelect
            aria-label={t('metadataExplorer.sort')}
            className="h-8 w-auto text-caption"
            onChange={(event) => onSortChange(event.currentTarget.value)}
            value={sortBy}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          <Button
            aria-label={
              sortDirection === 'asc'
                ? t('metadataExplorer.ascending')
                : t('metadataExplorer.descending')
            }
            onClick={() => onDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')}
            size="icon-sm"
            title={
              sortDirection === 'asc'
                ? t('metadataExplorer.ascending')
                : t('metadataExplorer.descending')
            }
            variant="outline"
          >
            {sortDirection === 'asc' ? <ArrowUpIcon size={16} /> : <ArrowDownIcon size={16} />}
          </Button>
        </div>
      </div>
      {rows === undefined ? (
        <div className="grid min-h-36 place-items-center">
          <Spinner className="size-7 text-primary" />
        </div>
      ) : (
        <>
          <DataTable
            ariaLabel={title}
            columns={columns}
            isRowSelected={isRowSelected}
            rows={rows}
            rowKey={rowKey}
            emptyMessage={<EmptyBlock title={emptyMessage} />}
          />
          {totalPages > 0 ? (
            <div className="flex justify-end">
              <Pager ariaLabel={title} page={page} total={totalPages} onChange={onPageChange} />
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

export type SourceMetadataListColumn<Row> = DataTableColumn<Row>;
export type SourceMetadataListChild = ReactNode;
