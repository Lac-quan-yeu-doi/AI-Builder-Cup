'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { InlineError } from '@/app/_components/ui/page-alert';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { Spinner } from '@/app/_components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { Card, CardContent } from '@/app/_components/ui/card';
import { TextField, SelectField } from '@/app/_components/ui/fields';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { Translator } from '@/app/_i18n/translate';
import { ChatMarkdown } from '@/app/_components/chat/chat-markdown';
import { ArtifactCard } from '@/app/_components/chat/artifact-card';
import { DocumentBody } from '@/app/_components/documents/document-body';
import { DocumentFileViewer } from '@/app/_components/documents/document-file-viewer';
import { ReportPdfExportButton } from '@/app/_components/documents/report-pdf-export-button';
import { RunFilesTab } from '@/app/_components/chat/run-files-tab';
import { RunFileViewer } from '@/app/_components/chat/run-file-viewer';
import type { TabState } from '@/app/_components/chat/tab-state';
import { stripSuggestionTags } from '@/src/entities/models/suggestion';
import type { RunFileContent, RunFileEntry } from '@/src/entities/models/chat';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import type { Document } from '@/src/entities/models/document';
import type { DocumentContent } from '@/src/entities/models/document';
import type { GetDocumentContentController } from '@/src/interface-adapters/controllers/documents/get-document-content.controller';
import type {
  AutomationWorkflowTriggerField,
  AutomationWorkflowTriggerFieldType,
} from '@/src/entities/models/automation-workflow';
import type { AutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';
import type {
  AutomationWorkflowRunSummaryViewModel,
  AutomationWorkflowRunViewModel,
  AutomationWorkflowStepViewModel,
  AutomationWorkflowViewModel,
} from '@/src/interface-adapters/presenters/automation-workflow.presenter';
import {
  AutomationWorkflowRunStatusBadge,
  AutomationWorkflowStatusBadge,
} from '@/app/_components/automation-workflow/automation-workflow-status-badge';
import { AutomationWorkflowChain } from './automation-workflow-chain';
import { AutomationWorkflowDock } from './automation-workflow-dock';
import { XIcon } from 'lucide-react';

interface Props {
  readonly controller: AutomationWorkflowController;
  readonly workflowId: string;
  /** Lists the files a step's underlying agent run touched, keyed by agentRunId. */
  readonly listRunFiles: (runId: string) => Promise<readonly RunFileEntry[]>;
  /** Streams one file's content for a step's agent run. */
  readonly getRunFileContent: (runId: string, path: string) => Promise<RunFileContent>;
  readonly getDocumentContent: GetDocumentContentController;
  readonly documentRenderer?: ChartRenderer;
}

const RUN_POLL_INTERVAL_MS = 1500;

const TRIGGER_FIELD_PATTERN = /\$\.trigger\.([a-zA-Z0-9_]+)/g;
const TRIGGER_FIELD_NAME_PREFIX = 'tf_';

/**
 * The steps a workflow already has are the only declaration of what its
 * trigger payload needs — a step's input referencing "$.trigger.run_date"
 * means the test-fire form needs a "run_date" field. Only the first path
 * segment is captured (nested "$.trigger.a.b" collapses to "a"); every real
 * workflow so far only ever references one level.
 */
function deriveTriggerFields(steps: readonly AutomationWorkflowStepViewModel[]): string[] {
  const seen = new Set<string>();
  for (const step of steps) {
    for (const value of Object.values(step.inputTemplate)) {
      if (typeof value !== 'string') continue; // stored inputTemplate isn't schema-validated; legacy rows can hold non-strings
      for (const match of value.matchAll(TRIGGER_FIELD_PATTERN)) {
        const field = match[1];
        if (field !== undefined) seen.add(field);
      }
    }
  }
  return [...seen];
}

function humanizeFieldName(field: string): string {
  const words = field.replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function stepRunLabel(
  stepId: string,
  steps: readonly AutomationWorkflowStepViewModel[],
  t: Translator,
): string {
  const step = steps.find((candidate) => candidate.id === stepId);
  return step ? t('automationWorkflow.stepLabel', { number: step.order + 1 }) : stepId;
}

function runTriggeredByLabel(
  triggeredBy: AutomationWorkflowRunSummaryViewModel['triggeredBy'],
  t: Translator,
): string {
  return t(`automationWorkflow.runTriggeredBy.${triggeredBy}`);
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * The single files panel inside the run-details modal. The modal owns which
 * step is active and when its files are loaded; this component only renders
 * the selected step's list or viewer.
 */
function RunFilesPanel({
  agentRunId,
  state,
  selectedFile,
  onRefresh,
  onSelectFile,
  onBack,
  getRunFileContent,
  t,
}: {
  readonly agentRunId: string | null;
  readonly state: TabState<readonly RunFileEntry[]>;
  readonly selectedFile: RunFileEntry | null;
  readonly onRefresh: () => void;
  readonly onSelectFile: (file: RunFileEntry) => void;
  readonly onBack: () => void;
  readonly getRunFileContent: (runId: string, path: string) => Promise<RunFileContent>;
  readonly t: Translator;
}) {
  return (
    <aside className="min-w-0 overflow-auto rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t('automationWorkflow.filesTitle')}</span>
        {agentRunId && !selectedFile ? (
          <Button
            size="xs"
            variant="outline"
            onClick={onRefresh}
            disabled={state.status === 'loading'}
          >
            {t('automationWorkflow.refreshFiles')}
          </Button>
        ) : null}
      </div>
      {agentRunId ? (
        selectedFile ? (
          <RunFileViewer
            runId={agentRunId}
            entry={selectedFile}
            getRunFileContent={getRunFileContent}
            onBack={onBack}
            t={t}
          />
        ) : (
          <RunFilesTab state={state} onSelectFile={onSelectFile} t={t} />
        )
      ) : (
        <p className="m-0 text-sm text-muted-foreground">{t('automationWorkflow.showFiles')}</p>
      )}
    </aside>
  );
}

function describeTrigger(workflow: AutomationWorkflowViewModel, t: Translator): string {
  if (workflow.triggerType === 'EVENT') {
    return t('automationWorkflow.triggeredByEvent', { topic: workflow.eventTopic ?? '' });
  }
  const schedule = workflow.scheduleTimezone
    ? `${workflow.scheduleCron ?? ''} (${workflow.scheduleTimezone})`
    : (workflow.scheduleCron ?? '');
  return t('automationWorkflow.triggeredBySchedule', { schedule });
}

export function AutomationWorkflowDetailScreen({
  controller,
  workflowId,
  listRunFiles,
  getRunFileContent,
  getDocumentContent,
  documentRenderer,
}: Props) {
  const { t } = useTranslation();
  const [workflow, setWorkflow] = useState<AutomationWorkflowViewModel>();
  const [triggerFieldDrafts, setTriggerFieldDrafts] = useState<AutomationWorkflowTriggerField[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [testFireOpen, setTestFireOpen] = useState(false);
  const [testFireError, setTestFireError] = useState<string>();
  const [runs, setRuns] = useState<readonly AutomationWorkflowRunSummaryViewModel[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<AutomationWorkflowRunViewModel>();
  const [lastSelectedRunId, setLastSelectedRunId] = useState<string | null>(null);
  const [activeAgentRunId, setActiveAgentRunId] = useState<string | null>(null);
  const [fileState, setFileState] = useState<TabState<readonly RunFileEntry[]>>({ status: 'idle' });
  const [selectedFile, setSelectedFile] = useState<RunFileEntry | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [documentContent, setDocumentContent] = useState<DocumentContent | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const selectedDocumentReportRef = useRef<HTMLDivElement>(null);
  const documentRequestRef = useRef(0);
  const fileRequestRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const detailPollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  function resetFilePanel() {
    fileRequestRef.current += 1;
    documentRequestRef.current += 1;
    setActiveAgentRunId(null);
    setSelectedFile(null);
    setFileState({ status: 'idle' });
    setSelectedDocument(null);
    setDocumentContent(null);
    setDocumentLoading(false);
  }

  async function openDocument(document: Document) {
    resetFilePanel();
    const requestId = ++documentRequestRef.current;
    setSelectedDocument(document);
    setDocumentLoading(true);
    try {
      const content = await getDocumentContent({
        documentId: document.id,
        mimeType: document.mimeType,
      });
      if (documentRequestRef.current === requestId) setDocumentContent(content);
    } catch {
      if (documentRequestRef.current === requestId) setDocumentContent(null);
    } finally {
      if (documentRequestRef.current === requestId) setDocumentLoading(false);
    }
  }

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setWorkflow(await controller.get(workflowId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('automationWorkflow.loadError'));
    }
  }, [controller, workflowId, t]);

  // The workflow itself (steps, trigger config) can change from THREE places:
  // this screen's own edits, and — crucially — the workflow chat panel's
  // agent editing it live via MCP tool calls (add/update/remove step,
  // update trigger). Those MCP edits land in the DB mid-conversation without
  // going through this screen's controller, so a mount-only fetch goes stale.
  // Poll on the same cadence the run history already uses, so an agent edit
  // shows up within a poll interval. The trigger-field DRAFTS are guarded
  // separately (see seededForId below) so a poll never clobbers in-progress
  // edits in the trigger-fields editor.
  useEffect(() => {
    let active = true;
    const poll = () => {
      void controller
        .get(workflowId)
        .then((loaded) => {
          if (active) setWorkflow(loaded);
        })
        .catch((cause: unknown) => {
          if (active)
            setError(cause instanceof Error ? cause.message : t('automationWorkflow.loadError'));
        });
    };
    poll();
    const timer = setInterval(poll, RUN_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [controller, workflowId, t]);

  // Seed the editable trigger-field drafts once the workflow first loads (and
  // again only when navigating to a different workflow id) so a reload of the
  // same workflow after saving a step does not clobber in-progress edits.
  const seededForId = useRef<string | null>(null);
  useEffect(() => {
    if (!workflow || seededForId.current === workflow.id) return;
    seededForId.current = workflow.id;
    setTriggerFieldDrafts(workflow.triggerFields.map((field) => ({ ...field })));
  }, [workflow]);

  // A run can start from this dialog, from the workflow's chat panel, or
  // (eventually) from a real schedule firing — this screen has no way to
  // know a run's id in the latter two cases, so it always polls the full
  // history rather than waiting to be told about one run.
  useEffect(() => {
    let active = true;
    const poll = () => {
      void controller.listRuns(workflowId).then((list) => {
        if (active) setRuns(list);
      });
    };
    poll();
    pollRef.current = setInterval(poll, RUN_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(pollRef.current);
    };
  }, [controller, workflowId]);

  // The drill-down level: while a run's detail is open, keep polling that
  // one run's own step-by-step status so a still-running run updates live.
  useEffect(() => {
    if (!selectedRunId) return;
    let active = true;
    const poll = () => {
      void controller.getRunStatus(workflowId, selectedRunId).then((detail) => {
        if (active) setRunDetail(detail);
      });
    };
    poll();
    detailPollRef.current = setInterval(poll, RUN_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(detailPollRef.current);
    };
  }, [controller, workflowId, selectedRunId]);

  function addTriggerField() {
    setTriggerFieldDrafts((previous) => [...previous, { name: '', type: 'text', required: true }]);
  }

  function updateTriggerField(index: number, patch: Partial<AutomationWorkflowTriggerField>) {
    setTriggerFieldDrafts((previous) =>
      previous.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  }

  function removeTriggerField(index: number) {
    setTriggerFieldDrafts((previous) => previous.filter((_, i) => i !== index));
  }

  async function saveTriggerFields() {
    setBusy(true);
    setError(undefined);
    try {
      await controller.update(workflowId, {
        triggerFields: triggerFieldDrafts.map((field) => ({
          name: field.name,
          type: field.type,
          ...(field.label !== undefined ? { label: field.label } : {}),
          required: field.required ?? true,
        })),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function addStep() {
    setBusy(true);
    setError(undefined);
    try {
      // Default to the chain's existing agent (all steps use the same real
      // agent today) or the known chat agent for the first step. The user
      // fills in the instruction + optional per-step system prompt in the
      // inspector that opens once the new step is selected.
      const lastStep = workflow?.steps[workflow.steps.length - 1];
      const created = await controller.addStep(workflowId, {
        agentId: lastStep?.agentId ?? 'chat-assistant',
        inputTemplate: { message: '' },
      });
      await load();
      setSelectedStepId(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function saveStep(
    stepId: string,
    patch: { agentId: string; inputTemplate: Record<string, string>; systemPrompt?: string },
  ) {
    setBusy(true);
    setError(undefined);
    try {
      await controller.updateStep(workflowId, stepId, patch);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function removeStep(stepId: string) {
    if (!window.confirm(t('automationWorkflow.confirmRemoveStep'))) return;
    setBusy(true);
    setError(undefined);
    try {
      await controller.removeStep(workflowId, stepId);
      setSelectedStepId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function testFire(event: FormEvent<HTMLFormElement>, triggerFields: readonly string[]) {
    event.preventDefault();
    setTestFireError(undefined);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const field of triggerFields) {
      const value = String(form.get(`${TRIGGER_FIELD_NAME_PREFIX}${field}`) ?? '').trim();
      if (value !== '') payload[field] = value;
    }
    const forceFailAtStepRaw = String(form.get('forceFailAtStep') ?? '').trim();
    setBusy(true);
    try {
      const { runId } = await controller.testFire(workflowId, {
        payload,
        ...(forceFailAtStepRaw ? { forceFailAtStep: Number(forceFailAtStepRaw) } : {}),
      });
      resetFilePanel();
      setSelectedRunId(runId);
      setTestFireOpen(false);
    } catch (cause) {
      setTestFireError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function retryRun(runId: string, resumeFromStep: number) {
    setBusy(true);
    setError(undefined);
    try {
      await controller.retryRun(workflowId, runId, { resumeFromStep });
      setRunDetail(await controller.getRunStatus(workflowId, runId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  const loadRunFiles = useCallback(
    (agentRunId: string) => {
      const requestId = ++fileRequestRef.current;
      setFileState({ status: 'loading' });
      void listRunFiles(agentRunId)
        .then((data) => {
          if (requestId === fileRequestRef.current) setFileState({ status: 'loaded', data });
        })
        .catch((cause: unknown) => {
          if (requestId === fileRequestRef.current) {
            setFileState({
              status: 'error',
              message:
                cause instanceof Error ? cause.message : t('chat.runInspector.files.loadError'),
            });
          }
        });
    },
    [listRunFiles, t],
  );

  function toggleStepFiles(agentRunId: string) {
    if (activeAgentRunId === agentRunId) {
      resetFilePanel();
      return;
    }
    setActiveAgentRunId(agentRunId);
    setSelectedFile(null);
    loadRunFiles(agentRunId);
  }

  function closeRunDetails() {
    setSelectedRunId(null);
    resetFilePanel();
  }

  if (!workflow) {
    return (
      <main className="grid h-full min-h-[300px] place-items-center p-5">
        {error ? <InlineError>{error}</InlineError> : <Spinner className="size-7 text-primary" />}
      </main>
    );
  }

  // Clears stale detail from a previously-open run the moment the selection
  // changes, so switching runs shows a spinner instead of the old run's
  // content for a beat — adjusting state during render rather than in an
  // effect (see AutomationWorkflowDock for the same pattern).
  if (selectedRunId !== lastSelectedRunId) {
    setLastSelectedRunId(selectedRunId);
    setRunDetail(undefined);
  }

  const selectedStep = workflow.steps.find((step) => step.id === selectedStepId) ?? null;
  const triggerFields = deriveTriggerFields(workflow.steps);

  return (
    <div className="flex h-full min-h-0">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-6 py-8 min-[1081px]:px-10">
          <PageBar
            backTo={{ href: '/automations', label: t('automationWorkflow.back') }}
            meta={<AutomationWorkflowStatusBadge status={workflow.status} t={t} />}
            description={describeTrigger(workflow, t)}
            eyebrow={
              <>
                {t('nav.group.tools')} · {t('nav.automations')}
              </>
            }
            actions={
              <Button onClick={() => setTestFireOpen(true)} disabled={busy}>
                {t('automationWorkflow.testFire')}
              </Button>
            }
            title={workflow.name}
          />
          {error ? <InlineError>{error}</InlineError> : null}

          <Card>
            <CardContent className="grid gap-3">
              <div className="flex items-center gap-2">
                <h2 className="m-0 text-sm font-semibold">{t('automationWorkflow.stepsTitle')}</h2>
                <Badge variant="outline">
                  {t('automationWorkflow.stepCount', { count: workflow.steps.length })}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => void addStep()}
                  disabled={busy}
                >
                  {t('automationWorkflow.addStep')}
                </Button>
              </div>
              {workflow.steps.length === 0 ? (
                <EmptyBlock
                  title={t('automationWorkflow.noStepsTitle')}
                  description={t('automationWorkflow.noSteps')}
                />
              ) : (
                <AutomationWorkflowChain
                  steps={workflow.steps}
                  selectedStepId={selectedStepId}
                  onSelect={setSelectedStepId}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-3">
              <div className="flex items-center gap-2">
                <h2 className="m-0 text-sm font-semibold">
                  {t('automationWorkflow.triggerFieldsTitle')}
                </h2>
                <Badge variant="outline">
                  {t('automationWorkflow.stepCount', { count: triggerFieldDrafts.length })}
                </Badge>
              </div>
              <p className="m-0 text-xs text-muted-foreground">
                {t('automationWorkflow.triggerFieldsHint')}
              </p>
              {triggerFieldDrafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('automationWorkflow.noTriggerFields')}
                </p>
              ) : (
                <div className="grid gap-3">
                  {triggerFieldDrafts.map((field, index) => (
                    <TriggerFieldRow
                      key={index}
                      field={field}
                      onChange={(patch) => updateTriggerField(index, patch)}
                      onRemove={() => removeTriggerField(index)}
                      t={t}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={addTriggerField} disabled={busy}>
                  {t('automationWorkflow.addTriggerField')}
                </Button>
                <Button onClick={() => void saveTriggerFields()} disabled={busy}>
                  {t('automationWorkflow.saveTriggerFields')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-3">
              <h2 className="m-0 text-sm font-semibold">{t('automationWorkflow.runHistory')}</h2>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('automationWorkflow.noRuns')}</p>
              ) : (
                <div className="grid gap-2">
                  {runs.map((runSummary) => (
                    <button
                      key={runSummary.runId}
                      type="button"
                      onClick={() => {
                        resetFilePanel();
                        setSelectedRunId(runSummary.runId);
                      }}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-sm font-medium">
                          {runTriggeredByLabel(runSummary.triggeredBy, t)} ·{' '}
                          {formatTimestamp(runSummary.startedAt)}
                        </p>
                        {runSummary.finishedAt ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t('automationWorkflow.finishedAt')}:{' '}
                            {formatTimestamp(runSummary.finishedAt)}
                          </p>
                        ) : null}
                      </div>
                      <AutomationWorkflowRunStatusBadge status={runSummary.status} t={t} />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={selectedRunId !== null} onOpenChange={(open) => !open && closeRunDetails()}>
            <DialogContent className="@container/run-details min-w-0 w-full max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-5xl lg:max-w-6xl">
              <DialogHeader>
                <DialogTitle>{t('automationWorkflow.runDetailTitle')}</DialogTitle>
              </DialogHeader>
              {runDetail ? (
                <div className="grid min-h-0 min-w-0 max-h-[calc(85vh-8rem)] grid-cols-1 gap-4 @[68rem]/run-details:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
                  <div className="min-w-0 space-y-2 overflow-auto">
                    <div className="flex items-center justify-between gap-3">
                      <p className="m-0 min-w-0 text-xs text-muted-foreground">
                        {runTriggeredByLabel(runDetail.triggeredBy, t)} ·{' '}
                        {t('automationWorkflow.startedAt')} {formatTimestamp(runDetail.startedAt)}
                        {runDetail.finishedAt
                          ? ` · ${t('automationWorkflow.finishedAt')} ${formatTimestamp(runDetail.finishedAt)}`
                          : ''}
                      </p>
                      <AutomationWorkflowRunStatusBadge status={runDetail.status} t={t} />
                    </div>
                    {runDetail.steps.map((stepRun, index) => (
                      <div
                        className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                        key={stepRun.stepId}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="m-0 text-sm font-medium">
                            {stepRunLabel(stepRun.stepId, workflow.steps, t)}
                          </p>
                          {stepRun.output ? (
                            <div className="mt-1">
                              <ChatMarkdown content={stripSuggestionTags(stepRun.output, false)} />
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t('automationWorkflow.noOutput')}
                            </p>
                          )}
                          <p className="mt-1.5 font-mono text-caption break-all text-muted-foreground">
                            {stepRun.startedAt ? formatTimestamp(stepRun.startedAt) : ''}
                            {stepRun.finishedAt ? ` – ${formatTimestamp(stepRun.finishedAt)}` : ''}
                            {stepRun.agentRunId
                              ? ` · ${t('automationWorkflow.agentRunId')}: ${stepRun.agentRunId}`
                              : ''}
                          </p>
                          {stepRun.agentRunId ? (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                if (stepRun.agentRunId) toggleStepFiles(stepRun.agentRunId);
                              }}
                              aria-expanded={activeAgentRunId === stepRun.agentRunId}
                            >
                              {activeAgentRunId === stepRun.agentRunId
                                ? t('automationWorkflow.hideFiles')
                                : t('automationWorkflow.showFiles')}
                            </Button>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <AutomationWorkflowRunStatusBadge status={stepRun.status} t={t} />
                          {stepRun.status === 'failed' ? (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => void retryRun(runDetail.runId, index)}
                              disabled={busy}
                            >
                              {t('automationWorkflow.retryRun')}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {runDetail.documents && runDetail.documents.length > 0 ? (
                      <div className="grid gap-2 pt-2">
                        <p className="m-0 text-xs font-medium text-muted-foreground">
                          {t('automationWorkflow.documentsTitle')}
                        </p>
                        {runDetail.documents.map((document) => (
                          <ArtifactCard
                            key={document.id}
                            kind="document"
                            title={document.filename}
                            kindLabel={t('automationWorkflow.documentKind')}
                            open={selectedDocument?.id === document.id}
                            onOpen={() => void openDocument(document)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {selectedDocument ? (
                    <aside className="min-w-0 overflow-auto rounded-lg border border-border p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {selectedDocument.filename}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {selectedDocument.mimeType === 'text/markdown' ? (
                            <ReportPdfExportButton
                              contentRef={selectedDocumentReportRef}
                              filename={selectedDocument.filename}
                            />
                          ) : null}
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={resetFilePanel}
                            aria-label={t('automationWorkflow.closeDocument')}
                            title={t('automationWorkflow.closeDocument')}
                          >
                            <XIcon aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                      {documentContent?.kind === 'file' ? (
                        <DocumentFileViewer
                          filename={selectedDocument.filename}
                          mimeType={selectedDocument.mimeType}
                          blob={documentContent.blob}
                        />
                      ) : documentLoading ? (
                        <Spinner className="size-6 text-primary" />
                      ) : documentContent?.kind === 'text' &&
                        documentContent.content.extractionStatus === 'extracted' ? (
                        selectedDocument.mimeType === 'text/markdown' ? (
                          <DocumentBody
                            content={documentContent.content.text}
                            chartPreviews={documentContent.content.chartPreviews}
                            renderer={documentRenderer}
                            contentRef={selectedDocumentReportRef}
                          />
                        ) : (
                          <pre className="break-words whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                            {documentContent.content.text}
                          </pre>
                        )
                      ) : (
                        <p className="text-sm text-destructive">
                          {t('automationWorkflow.documentLoadError')}
                        </p>
                      )}
                    </aside>
                  ) : (
                    <RunFilesPanel
                      agentRunId={activeAgentRunId}
                      state={fileState}
                      selectedFile={selectedFile}
                      onRefresh={() => {
                        if (activeAgentRunId) loadRunFiles(activeAgentRunId);
                      }}
                      onSelectFile={setSelectedFile}
                      onBack={() => setSelectedFile(null)}
                      getRunFileContent={getRunFileContent}
                      t={t}
                    />
                  )}
                </div>
              ) : (
                <Spinner className="size-6 text-primary" />
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={testFireOpen} onOpenChange={setTestFireOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('automationWorkflow.testFireTitle')}</DialogTitle>
              </DialogHeader>
              <form
                className="grid gap-4"
                onSubmit={(event) => void testFire(event, triggerFields)}
              >
                {triggerFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('automationWorkflow.noTriggerInputNeeded')}
                  </p>
                ) : (
                  triggerFields.map((field) => (
                    <TextField
                      key={field}
                      label={humanizeFieldName(field)}
                      name={`${TRIGGER_FIELD_NAME_PREFIX}${field}`}
                    />
                  ))
                )}
                <TextField
                  label={t('automationWorkflow.forceFailAtStep')}
                  name="forceFailAtStep"
                  type="number"
                  min={0}
                  hint={t('automationWorkflow.forceFailAtStepHint')}
                />
                {testFireError ? <InlineError>{testFireError}</InlineError> : null}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" type="button" onClick={() => setTestFireOpen(false)}>
                    {t('automationWorkflow.cancel')}
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {t('automationWorkflow.run')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </main>
      <AutomationWorkflowDock
        workflowId={workflowId}
        workflowName={workflow.name}
        onWorkflowChanged={() => void load()}
        selectedStep={selectedStep}
        stepBusy={busy}
        onSaveStep={(patch) => {
          if (selectedStepId) void saveStep(selectedStepId, patch);
        }}
        onRemoveStep={() => {
          if (selectedStepId) void removeStep(selectedStepId);
        }}
      />
    </div>
  );
}

const TRIGGER_FIELD_TYPES: readonly AutomationWorkflowTriggerFieldType[] = [
  'text',
  'number',
  'date',
  'datetime',
  'boolean',
];

function TriggerFieldRow({
  field,
  onChange,
  onRemove,
  t,
}: {
  readonly field: AutomationWorkflowTriggerField;
  readonly onChange: (patch: Partial<AutomationWorkflowTriggerField>) => void;
  readonly onRemove: () => void;
  readonly t: Translator;
}) {
  const requiredId = useId();
  const typeLabels: Record<AutomationWorkflowTriggerFieldType, string> = {
    text: t('automationWorkflow.triggerFieldTypeText'),
    number: t('automationWorkflow.triggerFieldTypeNumber'),
    date: t('automationWorkflow.triggerFieldTypeDate'),
    datetime: t('automationWorkflow.triggerFieldTypeDatetime'),
    boolean: t('automationWorkflow.triggerFieldTypeBoolean'),
  };

  return (
    <div className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
      <TextField
        label={t('automationWorkflow.triggerFieldName')}
        placeholder={t('automationWorkflow.triggerFieldNamePlaceholder')}
        value={field.name}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <SelectField
        label={t('automationWorkflow.triggerFieldType')}
        value={field.type}
        data={TRIGGER_FIELD_TYPES.map((type) => ({ value: type, label: typeLabels[type] }))}
        onChange={(value) => onChange({ type: value as AutomationWorkflowTriggerFieldType })}
      />
      <label
        htmlFor={requiredId}
        className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground"
      >
        <input
          id={requiredId}
          type="checkbox"
          checked={field.required ?? true}
          onChange={(event) => onChange({ required: event.target.checked })}
          className="size-3.5"
        />
        {t('automationWorkflow.triggerFieldRequired')}
      </label>
      <Button variant="ghost" size="sm" onClick={onRemove} className="mb-1">
        {t('automationWorkflow.removeTriggerField')}
      </Button>
    </div>
  );
}
