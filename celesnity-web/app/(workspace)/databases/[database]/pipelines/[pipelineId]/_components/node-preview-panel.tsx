'use client';

import { XIcon } from 'lucide-react';

import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import type { NodePreviewViewModel } from '@/src/interface-adapters/presenters/pipeline.presenter';

interface NodePreviewPanelProps {
  readonly preview?: NodePreviewViewModel;
  readonly error?: string;
  readonly onDismiss: () => void;
}

export function NodePreviewPanel({ preview, error, onDismiss }: NodePreviewPanelProps) {
  if (!preview && !error) {
    return null;
  }

  return (
    <section
      className="border-t border-border bg-card"
      aria-label="Node data preview"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-4 px-[18px] py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-caption">Node preview</strong>
          {preview ? (
            <>
              <Badge variant="info">{preview.returnedRows} rows</Badge>
              <Badge>{preview.executionTimeMs} ms</Badge>
              {preview.truncated ? <Badge variant="warning">Truncated</Badge> : null}
            </>
          ) : null}
        </div>
        <Button onClick={onDismiss} size="icon-sm" variant="ghost" aria-label="Dismiss preview">
          <XIcon />
        </Button>
      </div>

      {error ? (
        <p className="px-[18px] pb-4 text-caption leading-[1.5] text-destructive md:px-6">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="max-h-[260px] overflow-auto px-[18px] pb-4 md:px-6">
          <table className="w-full border-collapse text-left text-caption">
            <thead>
              <tr>
                {preview.columns.map((column) => (
                  <th
                    className="sticky top-0 border-b border-border bg-card px-2 py-[7px] font-[750] whitespace-nowrap"
                    key={column.name}
                    scope="col"
                  >
                    {column.name}
                    <span className="ml-1 font-normal text-muted-foreground">
                      {column.dataType}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, index) => (
                <tr key={index}>
                  {preview.columns.map((column) => (
                    <td
                      className="border-b border-border px-2 py-[6px] font-mono whitespace-nowrap"
                      key={column.name}
                    >
                      {formatCell(row[column.name])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {preview.rows.length === 0 ? (
            <p className="py-4 text-caption text-muted-foreground">The node returned no rows.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
