'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Translator } from '@/app/_i18n/translate';
import { useTranslation } from '@/app/_i18n/use-translation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/app/_components/ui/breadcrumb';
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  FileCodeIcon,
  FileTextIcon,
  HistoryIcon,
  type IconComponent,
  MessageSquareIcon,
  ShieldIcon,
  WorkflowIcon,
} from '@/app/_components/ui/icons';
import { Button } from '@/app/_components/ui/button';
import { cn } from '@/app/_components/ui/utils';
import { NotFoundError } from '@/src/entities/errors/application-errors';
import type {
  ChatTranscriptMessage,
  RunFileContent,
  RunFileEntry,
  RunManifest,
  RunReport,
  RunTraceSpan,
  RunValidation,
} from '@/src/entities/models/chat';
import type { GovernanceEvidencePage, RunGovernance } from '@/src/entities/models/governance';
import type { ApprovePendingActionController } from '@/src/interface-adapters/controllers/pending-actions/approve-pending-action.controller';
import type { ListPendingActionsController } from '@/src/interface-adapters/controllers/pending-actions/list-pending-actions.controller';
import type { RejectPendingActionController } from '@/src/interface-adapters/controllers/pending-actions/reject-pending-action.controller';

import { ChatMarkdown } from '@/app/_components/chat/chat-markdown';
import { PendingActionsForRun } from '@/app/_components/chat/pending-action-card';
import { RunProvenanceGraph } from './run-provenance-graph';
import { RunFilesTab } from '@/app/_components/chat/run-files-tab';
import { RunFileViewer } from '@/app/_components/chat/run-file-viewer';
import type { TabState } from '@/app/_components/chat/tab-state';

type RunInspectorTab =
  'result' | 'manifest' | 'trace' | 'graph' | 'validation' | 'governance' | 'approvals' | 'files';

/** File-explorer-style root listing: one row per section, in display order. */
const SECTIONS: readonly { readonly key: RunInspectorTab; readonly icon: IconComponent }[] = [
  { key: 'result', icon: MessageSquareIcon },
  { key: 'manifest', icon: FileCodeIcon },
  { key: 'trace', icon: HistoryIcon },
  { key: 'graph', icon: WorkflowIcon },
  { key: 'validation', icon: CheckIcon },
  { key: 'governance', icon: ShieldIcon },
  { key: 'approvals', icon: ShieldIcon },
  { key: 'files', icon: FileTextIcon },
];

export type { TabState };

function loadTab<T>(fetcher: () => Promise<T>, setState: (state: TabState<T>) => void): void {
  fetcher()
    .then((data) => setState({ status: 'loaded', data }))
    .catch((error: unknown) => {
      if (error instanceof NotFoundError) {
        setState({ status: 'not-found' });
        return;
      }
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    });
}

type ResultData =
  | { readonly kind: 'report'; readonly markdown: string }
  | { readonly kind: 'transcript'; readonly messages: readonly ChatTranscriptMessage[] };

/** Saves an already-fetched report as a local `.md` file — same pattern as `PipelineScriptPanel`'s "Download .py". */
function downloadReportMarkdown(runId: string, markdown: string): void {
  const blobUrl = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `run-${runId}.md`;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}

export interface RunInspectorContentProps {
  readonly runId: string;
  readonly onClose?: () => void;
  readonly getRunManifest: (runId: string) => Promise<RunManifest>;
  readonly getRunTrace: (runId: string) => Promise<readonly RunTraceSpan[]>;
  readonly getRunReport: (runId: string) => Promise<RunReport>;
  readonly getRunValidation: (runId: string) => Promise<RunValidation>;
  readonly getRunGovernance?: (runId: string) => Promise<RunGovernance>;
  readonly getRunGovernanceEvidence?: (
    runId: string,
    cursor?: string,
  ) => Promise<GovernanceEvidencePage>;
  readonly listRunFiles: (runId: string) => Promise<readonly RunFileEntry[]>;
  readonly getRunFileContent: (runId: string, path: string) => Promise<RunFileContent>;
  readonly getSessionResult: (sessionId: string) => Promise<readonly ChatTranscriptMessage[]>;
  readonly listPendingActions: ListPendingActionsController;
  readonly approvePendingAction: ApprovePendingActionController;
  readonly rejectPendingAction: RejectPendingActionController;
}

interface RunInspectorModalProps extends Omit<RunInspectorContentProps, 'onClose'> {
  readonly onClose: () => void;
}

export function RunInspectorModal({ onClose, ...contentProps }: RunInspectorModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgb(0_0_0/48%)] p-6 backdrop-blur-[4px]"
      role="presentation"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="max-h-[80vh] w-[min(100%,720px)] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-400"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-inspector-title"
        onClick={(e) => e.stopPropagation()}
      >
        <RunInspectorContent {...contentProps} onClose={onClose} />
      </div>
    </div>
  );
}

/**
 * The inspector's state, data fetching, tab navigation, and tab content,
 * without the modal chrome (backdrop, escape-to-close, dialog role) around
 * it — reused by `RunInspectorModal` (the modal) and
 * `stage/terminal-pane.tsx` (the Stage pane). `onClose` is optional: only the
 * modal needs a visible close button, since the pane's close control lives in
 * the Stage's own pane header.
 */
export function RunInspectorContent({
  runId,
  onClose,
  getRunManifest,
  getRunTrace,
  getRunReport,
  getRunValidation,
  getRunGovernance,
  getRunGovernanceEvidence,
  listRunFiles,
  getRunFileContent,
  getSessionResult,
  listPendingActions,
  approvePendingAction,
  rejectPendingAction,
}: RunInspectorContentProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<RunInspectorTab>('result');
  // true = the root section listing; false = drilled into `tab`'s detail view.
  const [inList, setInList] = useState(true);
  const [manifestState, setManifestState] = useState<TabState<RunManifest>>({ status: 'idle' });
  const [traceState, setTraceState] = useState<TabState<readonly RunTraceSpan[]>>({
    status: 'idle',
  });
  const [validationState, setValidationState] = useState<TabState<RunValidation>>({
    status: 'idle',
  });
  const [governanceState, setGovernanceState] = useState<TabState<RunGovernance>>({
    status: 'idle',
  });
  const [governanceEvidenceState, setGovernanceEvidenceState] = useState<
    TabState<GovernanceEvidencePage>
  >({ status: 'idle' });
  const [resultState, setResultState] = useState<TabState<ResultData>>({
    status: 'idle',
  });
  const [filesState, setFilesState] = useState<TabState<readonly RunFileEntry[]>>({
    status: 'idle',
  });
  // C5: the file the viewer will show. null = the file list; an entry =
  // the file-content viewer. The entry (not just its path) is kept so the
  // viewer can apply the 2 MB inline cap from `sizeBytes` before fetching.
  const [selectedFile, setSelectedFile] = useState<RunFileEntry | null>(null);

  const loadManifest = useCallback(
    () => loadTab(() => getRunManifest(runId), setManifestState),
    [getRunManifest, runId],
  );

  const loadTrace = useCallback(
    () => loadTab(() => getRunTrace(runId), setTraceState),
    [getRunTrace, runId],
  );

  const loadValidation = useCallback(
    () => loadTab(() => getRunValidation(runId), setValidationState),
    [getRunValidation, runId],
  );
  const loadGovernance = useCallback(
    () =>
      getRunGovernance === undefined
        ? setGovernanceState({ status: 'not-found' })
        : loadTab(() => getRunGovernance(runId), setGovernanceState),
    [getRunGovernance, runId],
  );
  const loadGovernanceEvidence = useCallback(
    (cursor?: string) => {
      if (getRunGovernanceEvidence === undefined) {
        setGovernanceEvidenceState({ status: 'not-found' });
        return;
      }
      if (cursor !== undefined && governanceEvidenceState.status === 'loaded') {
        getRunGovernanceEvidence(runId, cursor)
          .then((page) =>
            setGovernanceEvidenceState({
              status: 'loaded',
              data: {
                items: [...governanceEvidenceState.data.items, ...page.items],
                ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
              },
            }),
          )
          .catch((error: unknown) =>
            setGovernanceEvidenceState({
              status: 'error',
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        return;
      }
      loadTab(() => getRunGovernanceEvidence(runId, cursor), setGovernanceEvidenceState);
    },
    [getRunGovernanceEvidence, governanceEvidenceState, runId],
  );

  const loadFiles = useCallback(
    () => loadTab(() => listRunFiles(runId), setFilesState),
    [listRunFiles, runId],
  );

  // ponytail: idle is rendered identically to loading (see TabPanel), so the fetch
  // never needs a synchronous "start loading" setState — this ref just stops the
  // effect from re-firing the same tab's fetch on every render.
  const startedTabs = useRef<Set<RunInspectorTab>>(new Set());
  useEffect(() => {
    if (inList) return; // still on the root listing — nothing drilled into yet
    // 'graph' renders the same fetch as 'trace' (see RunProvenanceGraph) —
    // keyed together so visiting either first doesn't fetch it twice.
    const resource = tab === 'graph' ? 'trace' : tab;
    if (resource === 'result') return; // handled below — needs the manifest's sessionId first
    if (startedTabs.current.has(resource)) return;
    startedTabs.current.add(resource);
    if (resource === 'manifest') loadManifest();
    if (resource === 'trace') loadTrace();
    if (resource === 'validation') loadValidation();
    // Optional for legacy test doubles and hosts without governance transport.
    if (resource === 'governance') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadGovernance();
      loadGovernanceEvidence();
    }
    if (resource === 'files') loadFiles();
  }, [
    tab,
    inList,
    loadManifest,
    loadTrace,
    loadValidation,
    loadGovernance,
    loadGovernanceEvidence,
    loadFiles,
  ]);

  // Automation runs get a written report (see the write_report tool); every
  // other run falls back to the plain transcript, which needs the manifest's
  // `sessionId` first — not gated on the manifest tab having been opened,
  // since a viewer is expected to land on "Result" by default and may never
  // visit "Manifest" at all.
  //
  // `loadTranscriptFallback` handles one state transition per call (idle ->
  // triggers the fetch and returns; loading -> waits; loaded -> resolves)
  // rather than the whole sequence, so two different effects call it: the
  // report-fetch effect below on an immediate 404, and the manifest-watching
  // effect after it on every later manifestState transition until it
  // resolves.
  const loadTranscriptFallback = useCallback(() => {
    if (manifestState.status === 'idle') {
      loadManifest();
      return;
    }
    if (manifestState.status === 'loading') return;
    if (manifestState.status !== 'loaded' || !manifestState.data.sessionId) {
      setResultState({ status: 'not-found' });
      return;
    }
    loadTab(
      () =>
        getSessionResult(manifestState.data.sessionId as string).then((messages) => ({
          kind: 'transcript' as const,
          messages,
        })),
      setResultState,
    );
  }, [manifestState, loadManifest, getSessionResult]);

  const [reportMissing, setReportMissing] = useState(false);

  useEffect(() => {
    if (tab !== 'result' || inList) return;
    if (startedTabs.current.has('result')) return;
    startedTabs.current.add('result');

    getRunReport(runId)
      .then((report) => {
        setResultState({ status: 'loaded', data: { kind: 'report', markdown: report.markdown } });
      })
      .catch((error: unknown) => {
        if (!(error instanceof NotFoundError)) {
          setResultState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        setReportMissing(true);
      });
  }, [tab, inList, runId, getRunReport]);

  useEffect(() => {
    if (tab !== 'result' || inList || !reportMissing) return;
    // Synchronizes with the report-fetch effect's own 404 — not derived
    // render state, so react-hooks/set-state-in-effect's "adjust state
    // during render instead" advice doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTranscriptFallback();
  }, [tab, inList, reportMissing, loadTranscriptFallback]);

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Plain identifier (not a `resultState.data.markdown` access chain) so the
  // 'report' narrowing survives into the download button's onClick closure.
  const reportMarkdown =
    resultState.status === 'loaded' && resultState.data.kind === 'report'
      ? resultState.data.markdown
      : null;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 id="run-inspector-title" className="m-0 text-sm font-semibold text-foreground">
          {t('chat.runInspector.title')}
        </h2>
        {onClose ? (
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('chat.runInspector.close')}
            className="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            ×
          </button>
        ) : null}
      </div>

      {inList ? (
        <SectionList
          onSelect={(key) => {
            setTab(key);
            setInList(false);
          }}
          t={t}
        />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <button
                      type="button"
                      onClick={() => setInList(true)}
                      className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeftIcon size={16} />
                      {t('chat.runInspector.title')}
                    </button>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{t(`chat.runInspector.tab.${tab}`)}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            {tab === 'result' && reportMarkdown !== null && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadReportMarkdown(runId, reportMarkdown)}
              >
                {t('chat.runInspector.downloadReport')}
              </Button>
            )}
          </div>

          {tab === 'result' && (
            <TabPanel
              state={resultState}
              loadingLabel={t('chat.runInspector.loading')}
              notFoundLabel={t('chat.runInspector.notFound')}
              renderData={(data) =>
                data.kind === 'report' ? (
                  <ChatMarkdown content={data.markdown} />
                ) : data.messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t('chat.runInspector.resultEmpty')}
                  </p>
                ) : (
                  <ResultMessages messages={data.messages} t={t} />
                )
              }
            />
          )}
          {tab === 'manifest' && (
            <TabPanel
              state={manifestState}
              loadingLabel={t('chat.runInspector.loading')}
              notFoundLabel={t('chat.runInspector.notFound')}
              renderData={(manifest) => <ManifestFields manifest={manifest} t={t} />}
            />
          )}
          {tab === 'trace' && (
            <TabPanel
              state={traceState}
              loadingLabel={t('chat.runInspector.loading')}
              notFoundLabel={t('chat.runInspector.notFound')}
              emptyLabel={t('chat.runInspector.traceEmpty')}
              renderData={(spans) => <TraceSpans spans={spans} />}
            />
          )}
          {tab === 'graph' && (
            <TabPanel
              state={traceState}
              loadingLabel={t('chat.runInspector.loading')}
              notFoundLabel={t('chat.runInspector.notFound')}
              emptyLabel={t('chat.runInspector.traceEmpty')}
              renderData={(spans) => <RunProvenanceGraph spans={spans} />}
            />
          )}
          {tab === 'validation' && (
            <TabPanel
              state={validationState}
              loadingLabel={t('chat.runInspector.loading')}
              notFoundLabel={t('chat.runInspector.notFound')}
              renderData={(validation) => <ValidationFields validation={validation} t={t} />}
            />
          )}
          {tab === 'governance' && (
            <TabPanel
              state={governanceState}
              loadingLabel={t('chat.runInspector.loading')}
              notFoundLabel={t('chat.runInspector.notFound')}
              renderData={(governance) => (
                <GovernanceFields
                  governance={governance}
                  evidenceState={governanceEvidenceState}
                  onLoadMoreEvidence={
                    governanceEvidenceState.status === 'loaded' &&
                    governanceEvidenceState.data.nextCursor !== undefined
                      ? () => loadGovernanceEvidence(governanceEvidenceState.data.nextCursor)
                      : undefined
                  }
                />
              )}
            />
          )}
          {tab === 'approvals' && (
            <PendingActionsForRun
              runId={runId}
              listPendingActions={listPendingActions}
              approvePendingAction={approvePendingAction}
              rejectPendingAction={rejectPendingAction}
              emptyLabel={t('chat.runInspector.approvalsEmpty')}
            />
          )}
          {tab === 'files' &&
            (selectedFile === null ? (
              <RunFilesTab state={filesState} onSelectFile={setSelectedFile} t={t} />
            ) : (
              <RunFileViewer
                runId={runId}
                entry={selectedFile}
                getRunFileContent={getRunFileContent}
                onBack={() => setSelectedFile(null)}
                t={t}
              />
            ))}
        </>
      )}
    </>
  );
}

/** Root file-explorer-style listing: one focused row per section. */
function SectionList({
  onSelect,
  t,
}: {
  readonly onSelect: (key: RunInspectorTab) => void;
  readonly t: Translator;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {SECTIONS.map(({ key, icon: SectionIcon }) => (
        <li key={key}>
          <button
            type="button"
            onClick={() => onSelect(key)}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <SectionIcon size={18} className="shrink-0 text-muted-foreground" />
            <span className="flex-1">{t(`chat.runInspector.tab.${key}`)}</span>
            <ChevronDownIcon size={16} className="shrink-0 -rotate-90 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function TabPanel<T>({
  state,
  loadingLabel,
  notFoundLabel,
  emptyLabel,
  renderData,
}: {
  readonly state: TabState<T>;
  readonly loadingLabel: string;
  readonly notFoundLabel: string;
  readonly emptyLabel?: string;
  readonly renderData: (data: T) => ReactNode;
}) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <p className="text-xs text-muted-foreground">{loadingLabel}</p>;
  }
  if (state.status === 'not-found') {
    return <p className="text-xs text-muted-foreground">{notFoundLabel}</p>;
  }
  if (state.status === 'error') {
    return <p className="text-xs text-destructive">{state.message}</p>;
  }
  if (emptyLabel && Array.isArray(state.data) && state.data.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  return <>{renderData(state.data)}</>;
}

function ResultMessages({
  messages,
  t,
}: {
  readonly messages: readonly ChatTranscriptMessage[];
  readonly t: Translator;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0 text-xs">
      {messages.map((message, index) => (
        // A transcript message carries no id of its own — role plus position
        // is what's stable here, since the list itself never reorders.
        <li key={`${message.role}-${index}`} className="flex flex-col gap-1">
          <span className="text-micro font-semibold tracking-wide text-muted-foreground uppercase">
            {message.role === 'user'
              ? t('chat.runInspector.role.user')
              : t('chat.runInspector.role.assistant')}
          </span>
          <p className="m-0 whitespace-pre-wrap text-foreground">{message.content}</p>
          {message.reasoning && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">
                {t('chat.runInspector.reasoning')}
              </summary>
              <p className="m-0 mt-1 whitespace-pre-wrap text-muted-foreground">
                {message.reasoning}
              </p>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function ManifestFields({
  manifest,
  t,
}: {
  readonly manifest: RunManifest;
  readonly t: Translator;
}) {
  return (
    <div className="flex flex-col gap-3 text-xs">
      <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
        <FieldRow label={t('chat.runInspector.field.manifestId')} value={manifest.manifestId} />
        <FieldRow
          label={t('chat.runInspector.field.manifestVersion')}
          value={String(manifest.manifestVersion)}
        />
        <FieldRow label={t('chat.runInspector.field.runId')} value={manifest.runId} />
        <FieldRow
          label={t('chat.runInspector.field.sessionId')}
          value={manifest.sessionId ?? '—'}
        />
        <FieldRow
          label={t('chat.runInspector.field.parentRunId')}
          value={manifest.parentRunId ?? '—'}
        />
        <FieldRow label={t('chat.runInspector.field.rootRunId')} value={manifest.rootRunId} />
      </dl>
      <JsonBlock label={t('chat.runInspector.field.agent')} value={manifest.agent} />
      <JsonBlock label={t('chat.runInspector.field.model')} value={manifest.model} />
      <JsonBlock label={t('chat.runInspector.field.instructions')} value={manifest.instructions} />
      <JsonBlock label={t('chat.runInspector.field.skills')} value={manifest.skills} />
      <JsonBlock label={t('chat.runInspector.field.tools')} value={manifest.tools} />
      <JsonBlock label={t('chat.runInspector.field.runtime')} value={manifest.runtime} />
      <JsonBlock label={t('chat.runInspector.field.environment')} value={manifest.environment} />
      <JsonBlock label={t('chat.runInspector.field.input')} value={manifest.input} />
    </div>
  );
}

function FieldRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 break-words">{value}</dd>
    </>
  );
}

function JsonBlock({ label, value }: { readonly label: string; readonly value: unknown }) {
  return (
    <details>
      <summary className="cursor-pointer text-muted-foreground">{label}</summary>
      <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-2 text-caption">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function TraceSpans({ spans }: { readonly spans: readonly RunTraceSpan[] }) {
  const ordered = [...spans].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const depthOf = (span: RunTraceSpan): number => {
    let depth = 0;
    let parentId = span.parentSpanId;
    while (parentId) {
      const parent = spans.find((s) => s.spanId === parentId);
      if (!parent) break;
      depth += 1;
      parentId = parent.parentSpanId;
    }
    return depth;
  };
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
      {ordered.map((span) => (
        <li
          key={span.spanId}
          style={{ paddingLeft: `${depthOf(span) * 16}px` }}
          className="flex items-center gap-2"
        >
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-micro font-semibold',
              // minder-runtime reports 'succeeded' | 'failed' | 'cancelled' |
              // 'skipped' | 'running' (see minder-reliability's SpanStatus) —
              // never the literal 'ok' this used to compare against, so
              // every span rendered as failed regardless of its real outcome.
              span.status === 'succeeded'
                ? 'bg-accent text-primary'
                : 'bg-destructive/10 text-destructive',
            )}
          >
            {span.kind}
          </span>
          <span>{span.name}</span>
          {span.error && <span className="text-destructive">{span.error.message}</span>}
        </li>
      ))}
    </ul>
  );
}

function GovernanceFields({
  governance,
  evidenceState,
  onLoadMoreEvidence,
}: {
  readonly governance: RunGovernance;
  readonly evidenceState: TabState<GovernanceEvidencePage>;
  readonly onLoadMoreEvidence?: () => void;
}) {
  const budget = governance.policy.budget;
  return (
    <div className="grid gap-4 text-xs">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="m-0 font-semibold text-foreground">Policy revision</p>
        <p className="m-0 mt-1 break-all font-mono text-micro text-muted-foreground">
          {governance.policyRevision}
        </p>
        <p className="m-0 mt-1 text-muted-foreground">Admitted {governance.admittedAt}</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="m-0 font-semibold text-foreground">Data scope</p>
        {governance.dataScope ? (
          <p className="m-0 mt-1 font-mono text-micro text-muted-foreground">
            {governance.dataScope.catalog ? `${governance.dataScope.catalog}.` : ''}
            {governance.dataScope.schema}
          </p>
        ) : (
          <p className="m-0 mt-1 text-muted-foreground">Unscoped</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Autonomy" value={governance.policy.autonomy} />
        <Metric
          label="Auto approvals"
          value={String(governance.policy.autoApprovals?.length ?? 0)}
        />
        <Metric label="Sensitive files" value={governance.policy.sensitiveFiles} />
        <Metric label="Tool-call limit" value={String(budget.maxToolCalls)} />
        <Metric label="Input tokens" value={String(budget.maxInputTokens)} />
        <Metric label="Output tokens" value={String(budget.maxOutputTokens)} />
        <Metric
          label="Cost limit"
          value={budget.maxCostUsd === null ? 'none' : `$${budget.maxCostUsd}`}
        />
      </div>
      <p className="m-0 text-muted-foreground">
        Governance data is redacted. Tool arguments, secrets, command lists, and writable paths are
        never displayed.
      </p>
      <GovernanceEvidenceTimeline state={evidenceState} onLoadMore={onLoadMoreEvidence} />
    </div>
  );
}

function GovernanceEvidenceTimeline({
  state,
  onLoadMore,
}: {
  readonly state: TabState<GovernanceEvidencePage>;
  readonly onLoadMore?: () => void;
}) {
  if (state.status === 'idle' || state.status === 'loading')
    return <p className="m-0 text-muted-foreground">Loading evidence…</p>;
  if (state.status === 'not-found') return null;
  if (state.status === 'error') return <p className="m-0 text-destructive">{state.message}</p>;
  if (state.data.items.length === 0)
    return <p className="m-0 text-muted-foreground">No governance events recorded.</p>;
  return (
    <section className="flex flex-col gap-2" aria-label="Governance evidence">
      <h3 className="m-0 text-xs font-semibold text-foreground">Evidence timeline</h3>
      <ol className="m-0 flex list-none flex-col gap-2 border-l border-border pl-3 text-xs">
        {state.data.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{item.kind}</span>
            <time className="text-micro text-muted-foreground">{item.at}</time>
            <EvidenceDetail detail={item.detail} />
          </li>
        ))}
      </ol>
      {state.data.nextCursor !== undefined && onLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          className="self-start rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
        >
          Load more evidence
        </button>
      )}
    </section>
  );
}

function EvidenceDetail({ detail }: { readonly detail: Record<string, unknown> }) {
  const values = [
    'action',
    'decision',
    'status',
    'reason',
    'phase',
    'server',
    'agent',
    'tool',
    'toolCount',
    'code',
  ]
    .map((key) => [key, detail[key]] as const)
    .filter(
      (entry): entry is readonly [string, string | number] =>
        typeof entry[1] === 'string' || typeof entry[1] === 'number',
    );
  if (values.length === 0) return null;
  return (
    <p className="m-0 text-muted-foreground">
      {values.map(([key, value], index) => (
        <span key={key}>
          {index > 0 ? ' · ' : ''}
          {key}: {value}
        </span>
      ))}
    </p>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="m-0 text-micro uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="m-0 mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

function ValidationFields({
  validation,
  t,
}: {
  readonly validation: RunValidation;
  readonly t: Translator;
}) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
        <FieldRow label={t('chat.runInspector.field.status')} value={validation.status} />
        <FieldRow
          label={t('chat.runInspector.field.contract')}
          value={`${validation.contractId} v${validation.contractVersion}`}
        />
        <FieldRow
          label={t('chat.runInspector.field.attempts')}
          value={String(validation.attempts)}
        />
        <FieldRow label={t('chat.runInspector.field.outputHash')} value={validation.outputHash} />
        <FieldRow label={t('chat.runInspector.field.validatedAt')} value={validation.validatedAt} />
      </dl>
      {validation.errors.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {validation.errors.map((error) => (
            <li key={error.path} className="text-destructive">
              {error.path}: {error.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
