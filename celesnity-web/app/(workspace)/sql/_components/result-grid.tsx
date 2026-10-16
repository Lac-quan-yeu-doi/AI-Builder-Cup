'use client';

import { useState } from 'react';

import type { ResultColumn } from '@/src/entities/models/query';
import { cn } from '@/app/_components/ui/utils';
import { formatCellValue, formatInteger, isNullValue } from './format';

const noticeClass = 'rounded-xl border border-border bg-card p-5';
const noticeTitleClass = 'block text-body-sm';
const noticeCopyClass = 'mt-[7px] text-caption leading-[1.55] text-muted-foreground';
const rowIndexClass = 'w-[52px] text-right text-muted-foreground';

interface ResultGridProps {
  readonly columns: readonly ResultColumn[];
  readonly rows: readonly (readonly unknown[])[];
  readonly truncated: boolean;
  readonly resultsAvailable: boolean;
  readonly rowCount?: number;
}

const ROW_HEIGHT = 33;
const VIEWPORT_HEIGHT = 420;
const OVERSCAN = 8;

export function ResultGrid({
  columns,
  rows,
  truncated,
  resultsAvailable,
  rowCount,
}: ResultGridProps) {
  const [scrollTop, setScrollTop] = useState(0);

  if (!resultsAvailable) {
    return (
      <div className={noticeClass} role="status">
        <strong className={noticeTitleClass}>
          Results are no longer held by this API instance.
        </strong>
        <p className={noticeCopyClass}>
          Capped rows are retained in memory and were released after a restart. Re-run the statement
          to fetch them again.
        </p>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className={noticeClass} role="status">
        <strong className={noticeTitleClass}>No columns returned.</strong>
        <p className={noticeCopyClass}>This statement produced no tabular result set.</p>
      </div>
    );
  }

  const total = rows.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(total, startIndex + visibleCount);
  const topPad = startIndex * ROW_HEIGHT;
  const bottomPad = Math.max(0, (total - endIndex) * ROW_HEIGHT);
  const visibleRows = rows.slice(startIndex, endIndex);

  return (
    <div className="grid gap-[10px]">
      <div className="flex items-center gap-3 text-caption text-muted-foreground">
        <span>
          {formatInteger(total)} {total === 1 ? 'row' : 'rows'}
          {rowCount !== undefined && rowCount !== total
            ? ` of ${formatInteger(rowCount)} retained`
            : ''}
        </span>
        {truncated ? (
          <span
            className="rounded-full bg-status-warning-light px-2 py-[3px] text-micro font-[750] text-status-warning-dark"
            title="More rows existed than the configured cap"
          >
            Truncated to server cap
          </span>
        ) : null}
      </div>
      <div
        className="overflow-auto rounded-xl border border-border bg-card"
        style={{ maxHeight: VIEWPORT_HEIGHT }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        role="region"
        aria-label="Query result rows"
        tabIndex={0}
      >
        <table className="w-full border-collapse text-caption">
          <thead>
            <tr>
              <th
                className={cn(
                  rowIndexClass,
                  'sticky top-0 z-1 border-b border-border bg-muted px-3 py-[9px] align-bottom whitespace-nowrap',
                )}
                scope="col"
              >
                #
              </th>
              {columns.map((column, index) => (
                <th
                  className="sticky top-0 z-1 border-b border-border bg-muted px-3 py-[9px] text-left align-bottom whitespace-nowrap"
                  key={`${column.name}-${index}`}
                  scope="col"
                >
                  <span className="block font-[750] text-foreground">{column.name}</span>
                  <span className="mt-[2px] block font-mono text-micro font-medium text-muted-foreground">
                    {column.type}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topPad > 0 ? (
              <tr aria-hidden="true" style={{ height: topPad }}>
                <td colSpan={columns.length + 1} />
              </tr>
            ) : null}
            {visibleRows.map((row, offset) => {
              const rowIndex = startIndex + offset;
              return (
                <tr className="group" key={rowIndex} style={{ height: ROW_HEIGHT }}>
                  <td
                    className={cn(
                      rowIndexClass,
                      'border-b border-border px-3 py-[7px] font-mono text-caption tabular-nums whitespace-nowrap group-hover:bg-accent',
                    )}
                  >
                    {rowIndex + 1}
                  </td>
                  {columns.map((column, columnIndex) => {
                    const value = row[columnIndex];
                    return (
                      <td
                        key={columnIndex}
                        className={cn(
                          'border-b border-border px-3 py-[7px] font-mono text-caption whitespace-nowrap text-foreground group-hover:bg-accent',
                          isNullValue(value) && 'text-muted-foreground italic',
                        )}
                      >
                        {formatCellValue(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {bottomPad > 0 ? (
              <tr aria-hidden="true" style={{ height: bottomPad }}>
                <td colSpan={columns.length + 1} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
