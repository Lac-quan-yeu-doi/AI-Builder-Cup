import type { ReactNode } from 'react';

import { ScrollArea } from './scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { cn } from './utils';

export interface DataTableColumn<Row> {
  readonly align?: 'left' | 'right';
  readonly header: ReactNode;
  /** Identifies the column; also the React key. */
  readonly key: string;
  /** Renders in a monospace face, for identifiers and values. */
  readonly mono?: boolean;
  readonly render: (row: Row) => ReactNode;
  /** Secondary line under the header, e.g. the column's SQL type. */
  readonly subHeader?: ReactNode;
}

interface DataTableProps<Row> {
  readonly ariaLabel?: string;
  readonly columns: readonly DataTableColumn<Row>[];
  /** Shown in place of the rows when there are none. */
  readonly emptyMessage?: ReactNode;
  /** Caps the scroll region; omit to let the table grow. */
  readonly maxHeight?: number | string;
  readonly rowKey: (row: Row) => string;
  readonly rows: readonly Row[];
  /**
   * Marks the row a master-detail pane is currently showing. Without it a
   * drill-down list gives no sign of which row the panel beside it belongs to.
   * The row's own control still carries the accessible state; this is the
   * visual half.
   */
  readonly isRowSelected?: (row: Row) => boolean;
}

/**
 * Scrollable table with a header that stays put while the body scrolls.
 *
 * shadcn/ui's `Table` supplies the chrome; the columns are described as data so
 * five screens stop hand-writing the same `<thead>`.
 */
export function DataTable<Row>({
  ariaLabel,
  columns,
  emptyMessage,
  maxHeight,
  isRowSelected,
  rowKey,
  rows,
}: DataTableProps<Row>) {
  const body = (
    <Table aria-label={ariaLabel}>
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow>
          {columns.map((column) => (
            <TableHead
              key={column.key}
              className={cn('align-bottom', column.align === 'right' && 'text-right')}
            >
              <span className="text-micro font-semibold tracking-wide text-muted-foreground uppercase">
                {column.header}
              </span>
              {column.subHeader ? (
                <span className="block font-mono text-micro font-medium text-primary">
                  {column.subHeader}
                </span>
              ) : null}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-4 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow data-state={isRowSelected?.(row) ? 'selected' : undefined} key={rowKey(row)}>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    column.mono && 'font-mono',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  if (maxHeight === undefined) {
    return body;
  }

  return (
    <ScrollArea className="w-full" style={{ maxHeight }}>
      {body}
    </ScrollArea>
  );
}
