'use client';

import { useEffect, useState } from 'react';
import { Code2Icon, CopyIcon, RefreshCwIcon, XIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import type {
  ChartDraft,
  CompiledChartQuery,
  NativeQueryDefinition,
  VisualQueryDefinition,
} from '@/src/entities/models/canonical-chart';
import type { CompileCanonicalChartQueryController } from '@/src/interface-adapters/controllers/canonical-charts/compile-canonical-chart-query.controller';

export interface CompiledSqlDrawerProps {
  readonly visualQuery: VisualQueryDefinition;
  readonly parameterValues: ChartDraft['parameterValues'];
  readonly compileQuery: CompileCanonicalChartQueryController;
  readonly onConvert: (query: NativeQueryDefinition) => void;
}

/** Exact SQL returned by Core for a visual question, with explicit one-way conversion. */
export function CompiledSqlDrawer({
  visualQuery,
  parameterValues,
  compileQuery,
  onConvert,
}: CompiledSqlDrawerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [compiled, setCompiled] = useState<CompiledChartQuery | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSql(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const result = await compileQuery({ queryDefinition: visualQuery, parameterValues });
      setCompiled(result);
    } catch (cause) {
      setCompiled(null);
      setError(cause instanceof Error ? cause.message : 'Core could not compile this question.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void compileQuery({ queryDefinition: visualQuery, parameterValues })
      .then((result) => {
        if (cancelled) return;
        setCompiled(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setCompiled(null);
        setError(cause instanceof Error ? cause.message : 'Core could not compile this question.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compileQuery, open, parameterValues, visualQuery]);

  function convert(): void {
    if (!compiled?.sql) return;
    onConvert({
      schemaVersion: 1,
      mode: 'NATIVE',
      context: compiled.context,
      parameters: visualQuery.parameters,
      sql: compiled.sql,
    });
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setLoading(true);
          setError(null);
          setOpen(true);
        }}
      >
        <Code2Icon aria-hidden="true" /> View SQL
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation">
          <aside
            className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-card shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Compiled SQL"
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-body-lg font-semibold">SQL for this question</h2>
                <p className="text-caption text-muted-foreground">
                  This is the exact SQL compiled by Core; Web does not re-create or execute it.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close compiled SQL"
                onClick={() => setOpen(false)}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {loading ? (
                <p
                  className="flex items-center gap-2 text-body-sm text-muted-foreground"
                  role="status"
                >
                  <RefreshCwIcon aria-hidden="true" className="size-4 animate-spin" /> Compiling…
                </p>
              ) : error ? (
                <div className="space-y-3" role="alert">
                  <p className="text-body-sm text-destructive">{error}</p>
                  <Button type="button" variant="outline" onClick={() => void loadSql()}>
                    <RefreshCwIcon aria-hidden="true" /> Retry
                  </Button>
                </div>
              ) : compiled ? (
                <pre className="overflow-auto rounded-lg bg-muted p-4 font-mono text-caption whitespace-pre-wrap">
                  {compiled.sql}
                </pre>
              ) : (
                <p className="text-body-sm text-muted-foreground">
                  Open the drawer to compile SQL.
                </p>
              )}
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
              {compiled ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void navigator.clipboard?.writeText(compiled.sql)}
                >
                  <CopyIcon aria-hidden="true" /> Copy SQL
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button type="button" disabled={!compiled || loading} onClick={convert}>
                Convert this question to SQL
              </Button>
            </footer>
          </aside>
        </div>
      ) : null}
    </>
  );
}
