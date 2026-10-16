'use client';

import { useEffect, useState } from 'react';

import type { Translator } from '@/app/_i18n/translate';
import { Button } from '@/app/_components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/app/_components/ui/collapsible';
import { ArrowLeftIcon, ChevronDownIcon, WorkflowIcon } from '@/app/_components/ui/icons';
import { Input } from '@/app/_components/ui/input';
import { Label } from '@/app/_components/ui/label';
import { useTranslation } from '@/app/_i18n/use-translation';
import {
  triggerInputSpecs,
  type TriggerInputSpec,
} from '@/src/entities/models/automation-workflow';
import type { AutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';
import type {
  AutomationWorkflowRunSummaryViewModel,
  AutomationWorkflowViewModel,
} from '@/src/interface-adapters/presenters/automation-workflow.presenter';

export interface AutomationsSidebarProps {
  /**
   * The same controller the Automations page uses — the chat sidebar and the
   * Automations page are one feature over one backend (`/automation-workflows`).
   */
  readonly automationWorkflow: AutomationWorkflowController;
  /** A run id opens the same run inspector chat's own runs use — see chat-screen.tsx's `onInspectRun`. */
  readonly onInspectRun: (runId: string) => void;
}

export function AutomationsSidebar({ automationWorkflow, onInspectRun }: AutomationsSidebarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [workflows, setWorkflows] = useState<readonly AutomationWorkflowViewModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [results, setResults] = useState<Readonly<Record<string, string>>>({});
  const [payloadDrafts, setPayloadDrafts] = useState<
    Readonly<Record<string, Readonly<Record<string, string>>>>
  >({});
  // `null` shows the root list; a string drills into that workflow's detail
  // view (name, fields, Run now, and its history — no per-card sub-toggle).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [histories, setHistories] = useState<
    Readonly<Record<string, readonly AutomationWorkflowRunSummaryViewModel[]>>
  >({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await automationWorkflow.list();
        if (!cancelled) setWorkflows(list);
      } catch {
        if (!cancelled) setError(t('automation.loadError'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [automationWorkflow, t]);

  const setField = (workflowId: string, field: string, value: string): void => {
    setPayloadDrafts((previous) => ({
      ...previous,
      [workflowId]: { ...previous[workflowId], [field]: value },
    }));
  };

  const canRun = (workflow: AutomationWorkflowViewModel): boolean => {
    const draft = payloadDrafts[workflow.id] ?? {};
    return triggerInputSpecs(workflow)
      .filter((spec) => spec.required)
      .every((spec) => {
        // A boolean is always "filled" (checked or unchecked); every other
        // type needs a non-empty value before the workflow can run.
        if (spec.type === 'boolean') return true;
        return (draft[spec.name] ?? '').trim().length > 0;
      });
  };

  const coerceField = (spec: TriggerInputSpec, raw: string): unknown => {
    switch (spec.type) {
      case 'number':
        return Number(raw);
      case 'boolean':
        return raw === 'true';
      default:
        // text, date, datetime — carried as their string values.
        return raw;
    }
  };

  const handleRunNow = async (workflow: AutomationWorkflowViewModel): Promise<void> => {
    setRunningId(workflow.id);
    try {
      const draft = payloadDrafts[workflow.id] ?? {};
      const payload: Record<string, unknown> = {};
      for (const spec of triggerInputSpecs(workflow)) {
        const raw = draft[spec.name] ?? '';
        if (spec.type === 'boolean') {
          payload[spec.name] = raw === 'true';
          continue;
        }
        // An empty optional field is omitted from the payload entirely.
        if (raw.trim().length === 0) continue;
        payload[spec.name] = coerceField(spec, raw);
      }
      const { runId } = await automationWorkflow.testFire(workflow.id, { payload });
      setResults((previous) => ({ ...previous, [workflow.id]: runId }));
    } catch {
      setError(t('automation.loadError'));
    } finally {
      setRunningId(null);
    }
  };

  // Fetches once per workflow drilled into — not re-fetched on returning to
  // it later in the same sidebar session, matching the Run Inspector's
  // same lazy-once convention.
  useEffect(() => {
    if (selectedId === null || histories[selectedId] !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const runs = await automationWorkflow.listRuns(selectedId);
        if (!cancelled) setHistories((previous) => ({ ...previous, [selectedId]: runs }));
      } catch {
        if (!cancelled) setError(t('automation.loadError'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, histories, automationWorkflow, t]);

  const selected = workflows.find((workflow) => workflow.id === selectedId) ?? null;

  return (
    <div className="flex shrink-0 flex-col border-t border-border">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-1.5 border-b border-border bg-transparent px-4 py-3 text-left transition-colors hover:bg-muted"
          >
            <ChevronDownIcon
              size={16}
              className={open ? 'transition-transform' : '-rotate-90 transition-transform'}
            />
            <h3 className="m-0 text-caption font-semibold text-foreground">
              {t('automation.title')}{' '}
              <span className="text-caption font-normal text-muted-foreground">
                ({workflows.length})
              </span>
            </h3>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto p-3">
            {error && (
              <p className="m-0 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-caption text-destructive">
                {error}
              </p>
            )}
            {selected ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-caption font-medium text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeftIcon size={14} />
                  {t('automation.title')}
                </button>
                <p className="m-0 truncate text-caption font-semibold text-foreground">
                  {selected.name}
                </p>
                <AutomationDetail
                  workflow={selected}
                  resultRunId={results[selected.id]}
                  history={histories[selected.id]}
                  fieldValues={payloadDrafts[selected.id] ?? {}}
                  onFieldChange={(field, value) => setField(selected.id, field, value)}
                  running={runningId === selected.id}
                  canRun={canRun(selected)}
                  onRunNow={() => void handleRunNow(selected)}
                  onInspectRun={onInspectRun}
                  t={t}
                />
              </>
            ) : workflows.length === 0 && !error ? (
              <p className="py-6 text-center text-caption text-muted-foreground">
                {t('automation.empty')}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {workflows.map((workflow) => (
                  <li key={workflow.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(workflow.id)}
                      className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2 py-1 text-left text-caption font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <WorkflowIcon size={16} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{workflow.name}</span>
                      <span className="shrink-0 text-micro font-normal text-muted-foreground">
                        {workflow.triggerType === 'EVENT'
                          ? t('automation.eventTrigger')
                          : t('automation.scheduleTrigger')}
                        {workflow.status !== 'enabled' && ` · ${t('automation.disabled')}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function AutomationDetail({
  workflow,
  resultRunId,
  history,
  fieldValues,
  onFieldChange,
  running,
  canRun,
  onRunNow,
  onInspectRun,
  t,
}: {
  readonly workflow: AutomationWorkflowViewModel;
  readonly resultRunId: string | undefined;
  readonly history: readonly AutomationWorkflowRunSummaryViewModel[] | undefined;
  readonly fieldValues: Readonly<Record<string, string>>;
  readonly onFieldChange: (field: string, value: string) => void;
  readonly running: boolean;
  readonly canRun: boolean;
  readonly onRunNow: () => void;
  readonly onInspectRun: (runId: string) => void;
  readonly t: Translator;
}) {
  const specs = triggerInputSpecs(workflow);
  return (
    <div className="flex flex-col gap-3">
      {specs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {specs.map((spec) => {
            const inputId = `automation-${workflow.id}-${spec.name}`;
            const labelText = spec.label ?? spec.name;
            if (spec.type === 'boolean') {
              return (
                <div key={spec.name} className="flex items-center gap-1.5">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={(fieldValues[spec.name] ?? '') === 'true'}
                    onChange={(event) =>
                      onFieldChange(spec.name, event.target.checked ? 'true' : '')
                    }
                    className="size-3.5"
                  />
                  <Label htmlFor={inputId} className="text-caption text-muted-foreground">
                    {labelText}
                  </Label>
                </div>
              );
            }
            const inputType =
              spec.type === 'date'
                ? 'date'
                : spec.type === 'datetime'
                  ? 'datetime-local'
                  : spec.type === 'number'
                    ? 'number'
                    : 'text';
            return (
              <div key={spec.name} className="flex flex-col gap-0.5">
                <Label htmlFor={inputId} className="text-caption text-muted-foreground">
                  {labelText}
                </Label>
                <Input
                  id={inputId}
                  type={inputType}
                  value={fieldValues[spec.name] ?? ''}
                  onChange={(event) => onFieldChange(spec.name, event.target.value)}
                  className="h-7 text-caption"
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={running || !canRun}
          title={canRun ? undefined : t('automation.fieldRequired')}
          onClick={onRunNow}
        >
          {running ? t('automation.running') : t('automation.runNow')}
        </Button>
        {resultRunId && (
          <div className="flex items-center gap-1.5">
            <span className="text-caption text-muted-foreground">{t('automation.runStarted')}</span>
            <Button size="sm" variant="ghost" onClick={() => onInspectRun(resultRunId)}>
              {t('automation.viewRun')}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <p className="m-0 text-caption font-medium text-foreground">{t('automation.history')}</p>
        {history === undefined ? null : history.length === 0 ? (
          <p className="m-0 text-caption text-muted-foreground">{t('automation.noHistory')}</p>
        ) : (
          history.map((run) => (
            <div
              key={run.runId}
              className="flex items-center justify-between gap-2 text-caption text-muted-foreground"
            >
              <span>
                {run.status} · {run.startedAt}
              </span>
              <Button size="sm" variant="ghost" onClick={() => onInspectRun(run.runId)}>
                {t('automation.viewRun')}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
