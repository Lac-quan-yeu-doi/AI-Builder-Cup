'use client';

import { useMemo, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/_components/ui/table';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';

import type { TableBlockContent } from './message-block-content';

/** What the pane draws at once. Rows beyond this are held, never rendered. */
const RENDER_CAP = 200;

interface BlockTableViewProps {
  readonly content: TableBlockContent;
  /** Sticks the header while the body scrolls. Off inside a transcript card. */
  readonly scrollable?: boolean;
}

/**
 * A `table` block, drawn.
 *
 * Sorting is reading state and belongs to the person looking, so it lives here
 * rather than in the block: sorting a table is not a new answer and must not
 * look like one. Numeric columns are right-aligned and `tabular-nums`, which is
 * the one place tabular figures belong, because the digits have to line up down
 * the column.
 *
 * Empty cells sort last in both directions, so a sort never buries the rows
 * somebody is looking for under a block of blanks.
 */
export function BlockTableView({ content, scrollable }: BlockTableViewProps) {
  const { locale, t } = useTranslation();
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const rows = useMemo(() => {
    if (sort === null) return content.rows;
    const { key, direction } = sort;
    const factor = direction === 'asc' ? 1 : -1;
    return [...content.rows].sort((left, right) => {
      const a = left[key];
      const b = right[key];
      if (a === null || a === undefined || a === '') return 1;
      if (b === null || b === undefined || b === '') return -1;
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor;
      return String(a).localeCompare(String(b), locale) * factor;
    });
  }, [content.rows, locale, sort]);

  const shown = rows.slice(0, RENDER_CAP);

  const toggle = (key: string): void => {
    setSort((current) => {
      if (current === null || current.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const format = (value: unknown): string | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return new Intl.NumberFormat(locale).format(value);
    return String(value);
  };

  return (
    <div className={cn('min-w-0', scrollable ? 'min-h-0 flex-1 overflow-auto' : 'overflow-x-auto')}>
      <Table className="text-caption">
        <TableHeader className={cn(scrollable && 'sticky top-0 z-10 bg-card/95 backdrop-blur')}>
          <TableRow>
            {content.columns.map((column) => {
              const active = sort?.key === column.key;
              const Icon = !active
                ? ChevronsUpDownIcon
                : sort.direction === 'asc'
                  ? ArrowUpIcon
                  : ArrowDownIcon;
              return (
                <TableHead
                  aria-sort={
                    active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  className="p-0"
                  key={column.key}
                >
                  <button
                    className={cn(
                      'flex h-9 w-full cursor-pointer items-center gap-1 border-0 bg-transparent px-3 text-left text-micro font-medium tracking-wide uppercase transition-colors',
                      column.numeric && 'justify-end',
                      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => toggle(column.key)}
                    type="button"
                  >
                    {column.label}
                    <Icon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row, index) => (
            <TableRow key={index}>
              {content.columns.map((column) => {
                const text = format(row[column.key]);
                return (
                  <TableCell
                    className={cn(
                      'max-w-[16rem] truncate px-3',
                      column.numeric && 'text-right tabular-nums',
                    )}
                    key={column.key}
                    title={text ?? undefined}
                  >
                    {text ?? (
                      <span
                        aria-label={t('chat.artifact.table.empty')}
                        className="text-muted-foreground"
                      >
                        &ndash;
                      </span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { RENDER_CAP as TABLE_RENDER_CAP };
