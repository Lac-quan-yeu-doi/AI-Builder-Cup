'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDownIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { EmptyState } from '@/app/_components/ui/empty-state';
import { InlineError } from '@/app/_components/ui/page-alert';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Spinner } from '@/app/_components/ui/spinner';
import { isCurrentRequestToken } from '@/app/_components/shared/request-token';
import type { Translator } from '@/app/_i18n/translate';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { DataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';
import type { DataWorkflowDetail } from '@/src/entities/models/data-workflow';
import type { DataWorkflowViewModel } from '@/src/interface-adapters/presenters/data-workflow.presenter';

import { DataWorkflowHistoryPanel } from './data-workflow-history-panel';

interface Props {
  readonly controller: DataWorkflowController;
}

type LoadState = 'LOADING' | 'READY' | 'FAILED';

function triggerLabel(workflow: DataWorkflowViewModel, t: Translator): string {
  const labels = {
    MANUAL: t('dataWorkflow.trigger.manual'),
    CALENDAR: t('dataWorkflow.trigger.calendar'),
    INTERVAL: t('dataWorkflow.trigger.interval'),
    WATCH_SOURCE: t('dataWorkflow.trigger.watchSource'),
  } as const;
  return labels[workflow.triggerKind];
}

function lifecycle(workflow: DataWorkflowViewModel, t: Translator): string {
  const value =
    workflow.schedule?.lifecycle ??
    (workflow.paused ? 'PAUSED' : workflow.publishedVersion === undefined ? 'DRAFT' : 'READY');
  return {
    MANUAL: t('dataWorkflow.lifecycle.manual'),
    ENABLED: t('dataWorkflow.lifecycle.enabled'),
    PAUSED: t('dataWorkflow.lifecycle.paused'),
    DRAFT: t('dataWorkflow.lifecycle.draft'),
    READY: t('dataWorkflow.lifecycle.ready'),
  }[value];
}

function nextDue(workflow: DataWorkflowViewModel, t: Translator): string {
  return workflow.schedule?.nextDueAt === undefined
    ? t('dataWorkflow.unavailable')
    : new Date(workflow.schedule.nextDueAt).toLocaleString();
}

interface WorkflowRowProps {
  readonly controller: DataWorkflowController;
  readonly item: DataWorkflowViewModel;
  readonly t: Translator;
}

function DataWorkflowRow({ controller, item, t }: WorkflowRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [workflow, setWorkflow] = useState<DataWorkflowDetail>();
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const detailRequestToken = useRef(0);
  const activityRegionId = `workflow-activity-${item.id}`;

  const loadDetail = useCallback(async () => {
    const requestToken = ++detailRequestToken.current;
    setLoading(true);
    setLoadError(undefined);
    try {
      const detail = await controller.get(item.id);
      if (isCurrentRequestToken(detailRequestToken.current, requestToken)) setWorkflow(detail);
    } catch (cause) {
      if (isCurrentRequestToken(detailRequestToken.current, requestToken)) {
        setLoadError(cause instanceof Error ? cause.message : t('dataWorkflow.activityLoadError'));
      }
    } finally {
      if (isCurrentRequestToken(detailRequestToken.current, requestToken)) setLoading(false);
    }
  }, [controller, item.id, t]);

  const toggleActivity = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && workflow === undefined && !loading) void loadDetail();
  }, [expanded, loadDetail, loading, workflow]);

  return (
    <>
      <tr className="border-b border-border">
        <td className="px-4 py-4 font-semibold text-foreground">
          <Link
            className="underline-offset-4 hover:underline"
            href={`/data-workflows/${encodeURIComponent(item.id)}`}
          >
            {item.name}
          </Link>
        </td>
        <td className="px-4 py-4">{triggerLabel(item, t)}</td>
        <td className="px-4 py-4">{lifecycle(item, t)}</td>
        <td className="px-4 py-4 text-muted-foreground">{nextDue(item, t)}</td>
        <td className="px-4 py-4 text-muted-foreground">
          {item.lastRunStatus ?? t('dataWorkflow.unavailable')}
        </td>
        <td className="px-4 py-3 text-right">
          <Button
            aria-controls={activityRegionId}
            aria-expanded={expanded}
            aria-label={`${t('dataWorkflow.activity')}: ${item.name}`}
            className="gap-1.5"
            onClick={toggleActivity}
            size="sm"
            variant="ghost"
          >
            {t('dataWorkflow.activity')}
            <ChevronDownIcon
              aria-hidden="true"
              className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </Button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-border bg-muted/20">
          <td className="p-0" colSpan={6} id={activityRegionId}>
            {loading ? (
              <div className="grid min-h-28 place-items-center" role="status">
                <Spinner className="size-5" />
              </div>
            ) : loadError !== undefined ? (
              <div className="grid gap-3 px-6 py-5">
                <InlineError>{loadError}</InlineError>
                <Button className="w-fit" onClick={() => void loadDetail()} variant="outline">
                  {t('action.retry')}
                </Button>
              </div>
            ) : workflow === undefined ? null : (
              <DataWorkflowHistoryPanel
                controller={controller}
                onWorkflowChanged={setWorkflow}
                workflow={workflow}
              />
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function DataWorkflowScreen({ controller }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<readonly DataWorkflowViewModel[]>();
  const [error, setError] = useState<string>();
  const [loadState, setLoadState] = useState<LoadState>('LOADING');
  const listRequestToken = useRef(0);

  const load = useCallback(async () => {
    const requestToken = ++listRequestToken.current;
    setLoadState('LOADING');
    try {
      const page = await controller.list();
      if (isCurrentRequestToken(listRequestToken.current, requestToken)) {
        setError(undefined);
        setItems(page.items);
        setLoadState('READY');
      }
    } catch (cause) {
      if (isCurrentRequestToken(listRequestToken.current, requestToken)) {
        setError(cause instanceof Error ? cause.message : t('dataWorkflow.loadError'));
        setLoadState('FAILED');
      }
    }
  }, [controller, t]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      listRequestToken.current += 1;
    };
  }, [load]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-6 py-8 min-[1081px]:px-10">
        <PageBar
          title={t('dataWorkflow.title')}
          description={t('dataWorkflow.description')}
          actions={
            <div className="flex items-center gap-2">
              <Button asChild>
                <Link href="/data-workflows/new">New workflow</Link>
              </Button>
              <Button variant="outline" onClick={() => void load()}>
                {t('dataWorkflow.refresh')}
              </Button>
            </div>
          }
        />
        {error === undefined ? null : <InlineError>{error}</InlineError>}
        <Card className="min-h-0 overflow-hidden p-0" asChild>
          <section aria-label={t('dataWorkflow.title')}>
            {items === undefined && loadState === 'LOADING' ? (
              <div className="grid min-h-[300px] place-items-center">
                <Spinner className="size-7 text-primary" />
              </div>
            ) : items === undefined ? (
              <div className="grid min-h-[300px] place-items-center gap-4 px-6 text-center">
                <p className="text-sm text-muted-foreground">{t('dataWorkflow.loadError')}</p>
                <Button onClick={() => void load()} variant="outline">
                  {t('action.retry')}
                </Button>
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                title={t('dataWorkflow.empty')}
                description={t('dataWorkflow.emptyDescription')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="border-b border-border bg-muted text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <tr>
                      {[
                        t('dataWorkflow.name'),
                        t('dataWorkflow.trigger'),
                        t('dataWorkflow.lifecycle'),
                        t('dataWorkflow.nextDue'),
                        t('dataWorkflow.lastRun'),
                        t('dataWorkflow.activity'),
                      ].map((heading) => (
                        <th className="px-4 py-3" key={heading}>
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <DataWorkflowRow controller={controller} item={item} key={item.id} t={t} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </Card>
      </div>
    </main>
  );
}
