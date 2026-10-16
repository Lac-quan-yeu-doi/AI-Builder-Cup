'use client';

import { useMemo } from 'react';

import { parseDelimitedText } from './delimited-text-parser';
import type { FilePreviewContext } from './file-preview.types';

export function DelimitedFilePreview({ context }: { readonly context: FilePreviewContext }) {
  const delimiter = context.path.toLowerCase().endsWith('.tsv') ? '\t' : ',';
  const table = useMemo(
    () =>
      parseDelimitedText(context.text ?? '', {
        delimiter,
        maxRows: 2_000,
        maxColumns: 100,
      }),
    [context.text, delimiter],
  );

  if (table.headers.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs text-destructive">
          {context.t('chat.workspace.preview.invalidDelimited')}
        </p>
        <RawText value={context.text ?? ''} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{context.t('chat.workspace.preview.rows', { count: table.rows.length })}</span>
        <span>{context.t('chat.workspace.preview.columns', { count: table.headers.length })}</span>
        {table.truncated && <span>{context.t('chat.workspace.preview.truncated')}</span>}
      </div>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-muted">
            <tr>
              {table.headers.map((header, index) => (
                <th
                  key={`${header}-${index}`}
                  scope="col"
                  className="border-b border-border px-2.5 py-1.5"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="even:bg-muted/40">
                {table.headers.map((header, columnIndex) => (
                  <td
                    key={`${header}-${columnIndex}`}
                    className="border-b border-border px-2.5 py-1.5"
                  >
                    {row[columnIndex] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RawText({ value }: { readonly value: string }) {
  return (
    <pre className="m-0 max-h-[420px] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
      {value}
    </pre>
  );
}
