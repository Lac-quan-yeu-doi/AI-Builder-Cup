'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { Button } from '@/app/_components/ui/button';

import type { FilePreviewContext } from './file-preview.types';

export function JsonFilePreview({ context }: { readonly context: FilePreviewContext }) {
  const [rawMode, setRawMode] = useState(false);
  const text = context.text ?? '';
  const parsed = useMemo(() => parseJson(text), [text]);

  if (!parsed.valid) {
    return (
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs text-destructive">
          {context.t('chat.workspace.preview.invalidJson')}
        </p>
        <pre className="m-0 max-h-[420px] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
          {text}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={rawMode ? 'outline' : 'default'}
          aria-pressed={!rawMode}
          onClick={() => setRawMode(false)}
        >
          {context.t('chat.workspace.preview.rendered')}
        </Button>
        <Button
          size="sm"
          variant={rawMode ? 'default' : 'outline'}
          aria-pressed={rawMode}
          onClick={() => setRawMode(true)}
        >
          {context.t('chat.workspace.preview.raw')}
        </Button>
      </div>
      {rawMode ? (
        <pre className="m-0 max-h-[420px] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
          {JSON.stringify(parsed.value, null, 2)}
        </pre>
      ) : (
        <div className="flex flex-col gap-1 rounded-lg border border-border p-3 text-xs">
          <JsonNode label="root" value={parsed.value} />
        </div>
      )}
    </div>
  );
}

function JsonNode({ label, value }: { readonly label: string; readonly value: unknown }) {
  if (isRecord(value)) {
    return (
      <details open>
        <summary className="cursor-pointer font-medium">{label}</summary>
        <div className="ml-4 border-l border-border pl-3">
          {Object.entries(value).map(([key, child]) => (
            <JsonNode key={key} label={key} value={child} />
          ))}
        </div>
      </details>
    );
  }
  if (Array.isArray(value)) {
    return (
      <details open>
        <summary className="cursor-pointer font-medium">{label}</summary>
        <div className="ml-4 border-l border-border pl-3">
          {value.map((child, index) => (
            <JsonNode key={index} label={String(index)} value={child} />
          ))}
        </div>
      </details>
    );
  }
  return (
    <div className="flex gap-2 py-0.5">
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">{formatValue(value)}</span>
    </div>
  );
}

function parseJson(
  text: string,
): { readonly valid: true; readonly value: unknown } | { readonly valid: false } {
  try {
    return { valid: true, value: JSON.parse(text) };
  } catch {
    return { valid: false };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): ReactNode {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}
