'use client';

import { useCallback, useEffect, useState } from 'react';

import type { GetExecutionLogsController } from '@/src/interface-adapters/controllers/executions/get-execution-logs.controller';
import type { ExecutionLogViewModel } from '@/src/interface-adapters/presenters/execution.presenter';
import { contextualErrorMessage } from '@/app/_components/shared/error-message';
import { cn } from '@/app/_components/ui/utils';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { Spinner } from '@/app/_components/ui/spinner';
import { Button } from '@/app/_components/ui/button';
import { formatByteSize } from './execution-format';

const toolbarClass = 'flex flex-wrap items-center justify-between gap-3';

type LogsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly log: ExecutionLogViewModel }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'error'; readonly message: string };

interface ExecutionLogsProps {
  readonly getLogs: GetExecutionLogsController;
  readonly executionId: string;
}

export function ExecutionLogs({ getLogs, executionId }: ExecutionLogsProps) {
  const [state, setState] = useState<LogsState>({ kind: 'loading' });

  const fetchLogsState = useCallback(async (): Promise<LogsState> => {
    try {
      const log = await getLogs(executionId);
      return log ? { kind: 'ready', log } : { kind: 'unavailable' };
    } catch (error) {
      const message = contextualErrorMessage(error, 'The execution log could not be loaded.');
      return { kind: 'error', message };
    }
  }, [getLogs, executionId]);

  useEffect(() => {
    let cancelled = false;
    void fetchLogsState().then((next) => {
      if (!cancelled) {
        setState(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchLogsState]);

  const refresh = () => {
    setState({ kind: 'loading' });
    void fetchLogsState().then(setState);
  };

  return (
    <div className="grid gap-3">
      <div className={toolbarClass}>
        <small className="text-caption text-muted-foreground">
          Secret-redacted output captured by the Core API.
        </small>
        <Button disabled={state.kind === 'loading'} onClick={refresh} size="sm" variant="link">
          {state.kind === 'loading' ? 'Loading…' : 'Refresh log'}
        </Button>
      </div>

      {state.kind === 'loading' ? (
        <div
          className="grid min-h-[200px] place-items-center content-center gap-[10px] p-[30px] text-caption text-muted-foreground"
          role="status"
        >
          <Spinner className="size-7 text-primary" />
          <p>Loading execution log…</p>
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <>
          <pre className="m-0 max-h-[360px] overflow-auto rounded-xl bg-editor-canvas p-4 font-mono text-caption leading-[1.6] whitespace-pre-wrap wrap-anywhere text-editor-ink-muted">
            {state.log.content || 'The log is empty.'}
          </pre>
          <small className={cn(toolbarClass, 'text-caption text-muted-foreground')}>
            {formatByteSize(state.log.byteSize)} captured
          </small>
        </>
      ) : null}

      {state.kind === 'unavailable' ? (
        <EmptyBlock
          description="Output appears once the run starts producing it. Refresh to check again."
          role="status"
          title="No log available yet"
        />
      ) : null}

      {state.kind === 'error' ? (
        <EmptyBlock description={state.message} role="alert" title="The log could not be loaded" />
      ) : null}
    </div>
  );
}
