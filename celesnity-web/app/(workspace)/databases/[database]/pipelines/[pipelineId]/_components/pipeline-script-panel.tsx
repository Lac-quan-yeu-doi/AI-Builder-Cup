'use client';

import Editor from '@monaco-editor/react';

import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import type { GeneratedPipelineScript } from '@/src/entities/models/pipeline';
import { editorFontFamily } from '@/app/_components/shared/editor-font';

interface PipelineScriptPanelProps {
  readonly pipelineName: string;
  readonly version: number;
  readonly script?: GeneratedPipelineScript;
  readonly error?: string;
  readonly loading: boolean;
  readonly showingSavedVersion: boolean;
  readonly onReload: () => void;
}

export function PipelineScriptPanel({
  pipelineName,
  version,
  script,
  error,
  loading,
  showingSavedVersion,
  onReload,
}: PipelineScriptPanelProps) {
  const download = () => {
    if (!script) {
      return;
    }
    const blobUrl = URL.createObjectURL(new Blob([script.source], { type: 'text/x-python' }));
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = `${safeFileName(pipelineName)}-v${version}.py`;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <div className="pointer-events-auto flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-300">
      <header className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-body-md font-semibold text-foreground">Generated PySpark</h2>
              <Badge variant="info">v{version}</Badge>
              <Badge>Read only</Badge>
            </div>
            <p className="mt-1 text-caption text-muted-foreground">
              Exact immutable source executed by the Spark runtime.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={loading} onClick={onReload}>
            {loading ? 'Loading…' : 'Reload'}
          </Button>
          <Button size="sm" disabled={!script || loading} onClick={download}>
            Download .py
          </Button>
        </div>
      </header>

      {showingSavedVersion ? (
        <div className="border-b border-status-warning/40 bg-status-warning-light px-4 py-2 text-caption text-status-warning-dark">
          The canvas has unsaved changes. This script represents the last saved version, v{version}.
        </div>
      ) : null}

      {script ? (
        <div className="flex flex-none flex-wrap items-center gap-x-5 gap-y-1 border-b border-border bg-card px-4 py-2 text-micro text-muted-foreground">
          <span>
            Compiler <strong className="text-foreground">{script.compilerVersion}</strong>
          </span>
          <span>
            Size <strong className="text-foreground">{formatBytes(script.contentSize)}</strong>
          </span>
          <span title={script.contentSha256}>
            SHA-256 <code className="text-foreground">{shortHash(script.contentSha256)}</code>
          </span>
          <span>
            Compiled{' '}
            <strong className="text-foreground">{formatTimestamp(script.compiledAt)}</strong>
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="p-3">
          <PageAlert>{error}</PageAlert>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 bg-editor-canvas" aria-label="Generated PySpark source">
        {loading && !script ? (
          <div
            className="grid h-full min-h-[420px] place-items-center content-center gap-3"
            role="status"
          >
            <Spinner className="size-7 text-primary" />
            <strong className="text-caption text-muted-foreground">Generating script…</strong>
          </div>
        ) : script ? (
          <Editor
            height="100%"
            language="python"
            path={`inmemory://celesnity/pipelines/${script.pipelineVersionId}.py`}
            theme="vs"
            value={script.source}
            options={{
              ariaLabel: 'Generated PySpark source code',
              automaticLayout: true,
              contextmenu: true,
              domReadOnly: true,
              fontFamily: editorFontFamily(),
              fontSize: 13,
              lineNumbersMinChars: 3,
              minimap: { enabled: false },
              padding: { top: 14, bottom: 14 },
              readOnly: true,
              renderWhitespace: 'selection',
              scrollBeyondLastLine: false,
              wordWrap: 'off',
            }}
          />
        ) : (
          <div className="grid h-full min-h-[420px] place-items-center p-8 text-center text-caption text-muted-foreground">
            The generated source is unavailable. Reload to compile the saved pipeline version.
          </div>
        )}
      </div>
    </div>
  );
}

function safeFileName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return normalized || 'pipeline';
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}
