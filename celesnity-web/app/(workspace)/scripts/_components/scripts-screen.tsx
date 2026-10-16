'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/app/_components/shared/error-message';
import type { EditableScriptDraft } from '@/src/entities/models/script';
import type { GetScriptController } from '@/src/interface-adapters/controllers/scripts/get-script.controller';
import type { ListActiveConnectionsController } from '@/src/interface-adapters/controllers/scripts/list-active-connections.controller';
import type { ListScriptVersionsController } from '@/src/interface-adapters/controllers/scripts/list-script-versions.controller';
import type { ListScriptsController } from '@/src/interface-adapters/controllers/scripts/list-scripts.controller';
import type { LoadScriptVersionSourceController } from '@/src/interface-adapters/controllers/scripts/load-script-version-source.controller';
import type { SaveAndRunScriptController } from '@/src/interface-adapters/controllers/scripts/save-and-run-script.controller';
import type { SaveScriptController } from '@/src/interface-adapters/controllers/scripts/save-script.controller';
import type {
  ActiveConnectionOptionViewModel,
  SaveScriptResultViewModel,
  ScriptVersionViewModel,
  ScriptViewModel,
} from '@/src/interface-adapters/presenters/script.presenter';
import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { useTranslation } from '@/app/_i18n/use-translation';
import { cn } from '@/app/_components/ui/utils';
import { SelectField } from '@/app/_components/ui/fields';
import { TextField } from '@/app/_components/ui/fields';
import { TextareaField } from '@/app/_components/ui/fields';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { Spinner } from '@/app/_components/ui/spinner';
import { Badge } from '@/app/_components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { Card } from '@/app/_components/ui/card';
import { describeScriptSaveFailure } from './script-save-failure';

const panelEyebrowClass =
  'mb-[5px] block text-micro font-[750] tracking-[0.12em] text-primary uppercase';
const workbenchHeadingClass = 'm-0 font-medium tracking-[-0.02em]';
const pillClass =
  'inline-flex items-center rounded-full text-micro font-semibold tracking-[0.02em]';
const amberPillClass = 'bg-status-warning-light px-[7px] py-1 text-status-warning-dark';
const scriptActionsClass =
  'grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-none md:items-center';
const panelHeadingRowClass = 'mb-[17px] flex items-center justify-between gap-4';
const panelEmptyCopyClass = 'my-2 text-caption leading-[1.55] text-muted-foreground';
const detailPanelClass = 'min-w-0 px-[18px] py-[22px] md:px-6';
const workbenchStateClass =
  'flex min-h-[590px] flex-col items-center justify-center px-7 py-[42px] text-center';
const workbenchStateMarkClass = 'mb-4 grid size-12 place-items-center rounded-xl';
const workbenchStateCopyClass =
  'mt-[10px] mb-[21px] max-w-[470px] text-body-sm leading-[1.6] text-muted-foreground';

const PythonEditor = dynamic(
  () => import('./python-editor').then((module) => module.PythonEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className="grid h-[360px] place-items-center content-center gap-0 bg-editor-canvas text-caption text-editor-ink-muted sm:h-[410px] md:h-[470px]"
        role="status"
        aria-label="Loading Python editor"
      >
        <Spinner className="size-7 text-primary" />
        <strong>Loading Python editor…</strong>
      </div>
    ),
  },
);

const STARTER_SOURCE = `from pyspark.sql import DataFrame


def transform(input_df: DataFrame) -> DataFrame:
    """Return the transformed source data."""
    return input_df
`;

const ERROR_FALLBACK = 'Check the Core API and try again.';

interface ScriptsScreenProps {
  readonly controllers: Readonly<{
    listScripts: ListScriptsController;
    getScript: GetScriptController;
    listVersions: ListScriptVersionsController;
    loadVersionSource: LoadScriptVersionSourceController;
    listActiveConnections: ListActiveConnectionsController;
    save: SaveScriptController;
    saveAndRun: SaveAndRunScriptController;
  }>;
}

interface EditorSession {
  readonly key: number;
  readonly script?: ScriptViewModel;
  readonly draft: EditableScriptDraft;
  readonly baseline: EditableScriptDraft;
  readonly versions: readonly ScriptVersionViewModel[];
  readonly viewedVersion?: ScriptVersionViewModel;
  readonly needsPublish: boolean;
}

type WorkspaceState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly scriptId: string }
  | { readonly kind: 'error'; readonly scriptId: string }
  | { readonly kind: 'ready'; readonly session: EditorSession };

interface Feedback {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

interface DiscardRequest {
  readonly title: string;
  readonly message: string;
  readonly action: () => void;
}

export function ScriptsScreen({ controllers }: ScriptsScreenProps) {
  const { t } = useTranslation();
  const operationSequence = useRef(0);
  const sessionSequence = useRef(0);
  const [scripts, setScripts] = useState<readonly ScriptViewModel[]>();
  const [connections, setConnections] = useState<readonly ActiveConnectionOptionViewModel[]>();
  const [registryError, setRegistryError] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceState>({ kind: 'idle' });
  const [feedback, setFeedback] = useState<Feedback>();
  const [discardRequest, setDiscardRequest] = useState<DiscardRequest>();
  const [isSaving, setIsSaving] = useState(false);
  const [loadingVersion, setLoadingVersion] = useState<number>();

  const session = workspace.kind === 'ready' ? workspace.session : undefined;
  const isDirty = session ? sessionIsDirty(session) : false;
  const metadataDirty = session ? metadataIsDirty(session.draft, session.baseline) : false;
  const sourceDirty = session
    ? session.needsPublish || session.draft.source !== session.baseline.source
    : false;

  const selectedConnection = connections?.find(
    (connection) => connection.id === session?.draft.connectionId,
  );

  useEffect(() => {
    let cancelled = false;

    Promise.all([controllers.listScripts(), controllers.listActiveConnections()])
      .then(([scriptItems, connectionItems]) => {
        if (!cancelled) {
          setScripts(scriptItems);
          setConnections(connectionItems);
          setRegistryError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRegistryError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [controllers]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const retryRegistry = async () => {
    setScripts(undefined);
    setConnections(undefined);
    setRegistryError(false);
    setFeedback(undefined);
    try {
      const [scriptItems, connectionItems] = await Promise.all([
        controllers.listScripts(),
        controllers.listActiveConnections(),
      ]);
      setScripts(scriptItems);
      setConnections(connectionItems);
    } catch {
      setRegistryError(true);
    }
  };

  const requestDiscard = (title: string, message: string, action: () => void) => {
    if (isDirty) {
      setDiscardRequest({ title, message, action });
      return;
    }
    action();
  };

  const createDraft = () => {
    requestDiscard(
      'Discard unsaved changes?',
      'Creating another draft will discard the source and metadata changes in this workbench.',
      () => {
        operationSequence.current += 1;
        const connectionId = connections?.[0]?.id ?? '';
        const draft: EditableScriptDraft = {
          name: '',
          connectionId,
          source: STARTER_SOURCE,
        };
        setWorkspace({
          kind: 'ready',
          session: {
            key: ++sessionSequence.current,
            draft,
            baseline: draft,
            versions: [],
            needsPublish: true,
          },
        });
        setFeedback(undefined);
      },
    );
  };

  const selectScript = (scriptId: string) => {
    if (session?.script?.id === scriptId) {
      return;
    }
    requestDiscard(
      'Switch scripts and discard changes?',
      'Your unsaved source or metadata changes will not be kept.',
      () => void loadScript(scriptId),
    );
  };

  const loadScript = async (scriptId: string) => {
    const operation = ++operationSequence.current;
    setWorkspace({ kind: 'loading', scriptId });
    setFeedback(undefined);
    setLoadingVersion(undefined);

    try {
      const [script, versions] = await Promise.all([
        controllers.getScript(scriptId),
        controllers.listVersions(scriptId),
      ]);
      let source = STARTER_SOURCE;
      let viewedVersion: ScriptVersionViewModel | undefined;
      let needsPublish = true;

      if (script.currentVersion) {
        const publishedSource = await controllers.loadVersionSource(
          script.id,
          script.currentVersion.versionNumber,
        );
        source = publishedSource.source;
        viewedVersion = publishedSource.version;
        needsPublish = false;
      }

      if (operationSequence.current !== operation) {
        return;
      }

      const draft = draftFromScript(script, source, viewedVersion?.versionNumber);
      setWorkspace({
        kind: 'ready',
        session: {
          key: ++sessionSequence.current,
          script,
          draft,
          baseline: draft,
          versions,
          ...(viewedVersion ? { viewedVersion } : {}),
          needsPublish,
        },
      });
    } catch {
      if (operationSequence.current === operation) {
        setWorkspace({ kind: 'error', scriptId });
      }
    }
  };

  const requestVersion = (version: ScriptVersionViewModel) => {
    if (!session?.script || version.versionNumber === session.viewedVersion?.versionNumber) {
      return;
    }
    requestDiscard(
      `Load version ${version.versionNumber} and discard changes?`,
      'The exact published source will replace the current editor contents and reset the dirty baseline.',
      () => void loadVersion(session.script?.id ?? '', version.versionNumber),
    );
  };

  const loadVersion = async (scriptId: string, versionNumber: number) => {
    if (!scriptId) {
      return;
    }
    const operation = ++operationSequence.current;
    setLoadingVersion(versionNumber);
    setFeedback(undefined);

    try {
      const publishedSource = await controllers.loadVersionSource(scriptId, versionNumber);
      if (operationSequence.current !== operation) {
        return;
      }
      setWorkspace((current) => {
        if (current.kind !== 'ready' || current.session.script?.id !== scriptId) {
          return current;
        }
        const draft = draftFromScript(
          current.session.script,
          publishedSource.source,
          publishedSource.version.versionNumber,
        );
        return {
          kind: 'ready',
          session: {
            ...current.session,
            key: ++sessionSequence.current,
            draft,
            baseline: draft,
            viewedVersion: publishedSource.version,
            needsPublish: false,
          },
        };
      });
    } catch (error) {
      if (operationSequence.current === operation) {
        setFeedback({
          kind: 'error',
          message: `Version ${versionNumber} could not be loaded. ${errorMessage(error, ERROR_FALLBACK)}`,
        });
      }
    } finally {
      if (operationSequence.current === operation) {
        setLoadingVersion(undefined);
      }
    }
  };

  const updateDraft = (change: Partial<EditableScriptDraft>) => {
    setWorkspace((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            session: {
              ...current.session,
              draft: { ...current.session.draft, ...change },
            },
          }
        : current,
    );
    setFeedback(undefined);
  };

  const validateDraft = (draft: EditableScriptDraft): string | undefined => {
    if (!draft.name.trim()) {
      return 'Give this script a name.';
    }
    if (draft.name.trim().length > 120) {
      return 'Keep the script name to 120 characters or fewer.';
    }
    if ((draft.description?.trim().length ?? 0) > 2000) {
      return 'Keep the description to 2,000 characters or fewer.';
    }
    if (!draft.connectionId || !connections?.some(({ id }) => id === draft.connectionId)) {
      return 'Select an active connection before saving.';
    }
    if (!draft.source.trim()) {
      return 'Add Python source before publishing a version.';
    }
    return undefined;
  };

  const save = async (runAfterSave: boolean) => {
    if (!session || isSaving) {
      return;
    }
    const validationMessage = validateDraft(session.draft);
    if (validationMessage) {
      setFeedback({ kind: 'error', message: validationMessage });
      return;
    }

    setIsSaving(true);
    setFeedback(undefined);
    try {
      if (runAfterSave) {
        const result = await controllers.saveAndRun(session.draft, session.script);
        applySaved(result.saved);
        if (result.run.outcome === 'execution-service-unavailable') {
          setFeedback({
            kind: 'success',
            message: `Version ${result.saved.version.versionNumber} was saved, but the execution service is not available yet. Retry Save & Run once it comes online.`,
          });
        } else {
          const executionLabel = result.run.executionId
            ? ` Execution ${result.run.executionId} was accepted.`
            : ' The execution request was accepted.';
          setFeedback({
            kind: 'success',
            message: `Version ${result.saved.version.versionNumber} was saved.${executionLabel}`,
          });
        }
      } else {
        const result = await controllers.save(session.draft, session.script);
        applySaved(result);
        setFeedback({
          kind: 'success',
          message: `Version ${result.version.versionNumber} was published successfully.`,
        });
      }
    } catch (error) {
      const failure = describeScriptSaveFailure(error);
      if (failure.kind === 'run') {
        applySaved(failure.saved);
      } else if (failure.kind === 'publish') {
        applyPartialSave(failure.persistedScript);
      }
      setFeedback({ kind: 'error', message: failure.message });
    } finally {
      setIsSaving(false);
    }
  };

  const applySaved = (saved: SaveScriptResultViewModel) => {
    setScripts((current) => upsertScript(current ?? [], saved.script));
    setWorkspace((current) => {
      if (current.kind !== 'ready') {
        return current;
      }
      const draft = draftFromScript(
        saved.script,
        current.session.draft.source,
        saved.version.versionNumber,
      );
      return {
        kind: 'ready',
        session: {
          ...current.session,
          script: saved.script,
          draft,
          baseline: draft,
          versions: sortVersions([
            saved.version,
            ...current.session.versions.filter((version) => version.id !== saved.version.id),
          ]),
          viewedVersion: saved.version,
          needsPublish: false,
        },
      };
    });
  };

  const applyPartialSave = (persistedScript: ScriptViewModel) => {
    setScripts((current) => upsertScript(current ?? [], persistedScript));
    setWorkspace((current) => {
      if (current.kind !== 'ready') {
        return current;
      }
      const draft: EditableScriptDraft = {
        ...current.session.draft,
        scriptId: persistedScript.id,
        name: persistedScript.name,
        description: persistedScript.description,
        connectionId: persistedScript.connectionId,
      };
      const baseline: EditableScriptDraft = {
        ...current.session.baseline,
        scriptId: persistedScript.id,
        name: persistedScript.name,
        description: persistedScript.description,
        connectionId: persistedScript.connectionId,
      };
      return {
        kind: 'ready',
        session: {
          ...current.session,
          script: persistedScript,
          draft,
          baseline,
          needsPublish: true,
        },
      };
    });
  };

  const confirmDiscard = () => {
    const action = discardRequest?.action;
    setDiscardRequest(undefined);
    action?.();
  };

  const registryLoading = !scripts || !connections;

  return (
    <section className="grid gap-5">
      <PageBar
        actions={
          <Button
            disabled={registryLoading || registryError || connections.length === 0 || isSaving}
            onClick={createDraft}
          >
            New script
          </Button>
        }
        description={t('page.scripts.description')}
        title={t('page.scripts.title')}
      />

      {feedback ? (
        <div
          className={cn(
            'flex min-h-[50px] items-center justify-between gap-[18px] rounded-lg border px-[15px] py-3 text-body-sm leading-[1.5]',
            feedback.kind === 'success'
              ? 'border-primary/30 bg-status-success-light text-status-success-dark'
              : 'border-destructive/30 bg-destructive/10 text-destructive',
          )}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          <span>{feedback.message}</span>
          <button
            className="flex-none cursor-pointer border-0 bg-transparent text-title text-current"
            type="button"
            onClick={() => setFeedback(undefined)}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      ) : null}

      {registryError ? (
        <div
          className="flex min-h-[50px] flex-col items-stretch gap-[18px] rounded-lg border border-destructive/30 bg-destructive/10 px-[15px] py-3 text-body-sm leading-[1.5] text-destructive md:flex-row md:items-center md:justify-between"
          role="alert"
        >
          <div>
            <strong className="block">The Script Workbench is unavailable.</strong>
            <p className="mt-[3px]">
              Confirm the Core API is running, then reload scripts and active connections.
            </p>
          </div>
          <Button variant="outline" onClick={retryRegistry}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 items-start gap-[18px] min-[901px]:grid-cols-[210px_minmax(0,1fr)] min-[1081px]:grid-cols-[248px_minmax(0,1fr)]">
        <Card
          className="p-[17px] min-[901px]:sticky min-[901px]:top-[22px] min-[901px]:max-h-[calc(100vh-44px)] min-[901px]:overflow-auto"
          asChild
        >
          <aside aria-label="Active scripts">
            <div className="flex items-center justify-between gap-[14px] border-b border-border px-[2px] pt-[3px] pb-[15px]">
              <div>
                <h2 className={cn(workbenchHeadingClass, 'text-title')}>Scripts</h2>
                <p className="mt-1 text-caption text-muted-foreground">
                  Active workbench definitions
                </p>
              </div>
              {scripts ? <Badge variant="secondary">{scripts.length}</Badge> : null}
            </div>

            {registryLoading && !registryError ? (
              <div
                className="grid min-h-[245px] content-center gap-[9px] text-caption text-muted-foreground"
                role="status"
              >
                <Skeleton className="h-[38px] rounded-lg" />
                <Skeleton className="h-[38px] rounded-lg" />
                <Skeleton className="h-[38px] rounded-lg" />
                <p>Loading scripts…</p>
              </div>
            ) : null}

            {scripts?.length === 0 ? (
              <div className="px-2 py-[35px] text-center">
                <strong className="block text-body-sm">No scripts yet</strong>
                <p className="mt-[7px] text-caption leading-[1.5] text-muted-foreground">
                  Create a draft to publish the first immutable version.
                </p>
              </div>
            ) : null}

            {scripts && scripts.length > 0 ? (
              <div className="grid grid-cols-1 gap-[7px] pt-3 sm:grid-cols-2 min-[901px]:grid-cols-1">
                {scripts.map((script) => (
                  <button
                    className={cn(
                      'grid w-full cursor-pointer gap-[5px] rounded-md border border-transparent bg-transparent p-3 text-left disabled:cursor-wait disabled:opacity-[0.65] not-disabled:hover:border-border not-disabled:hover:bg-accent',
                      session?.script?.id === script.id && 'border-primary/30 bg-accent',
                    )}
                    type="button"
                    key={script.id}
                    disabled={isSaving}
                    onClick={() => selectScript(script.id)}
                  >
                    <span className="overflow-hidden text-body-sm font-[750] text-ellipsis whitespace-nowrap">
                      {script.name}
                    </span>
                    <span className="text-micro font-semibold text-primary">
                      {script.currentVersion
                        ? `Current v${script.currentVersion.versionNumber}`
                        : 'Publication pending'}
                    </span>
                    <span className="text-micro text-muted-foreground">
                      Updated {formatDate(script.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {connections?.length === 0 ? (
              <p className="mt-[15px] rounded-lg bg-status-warning-light p-3 text-caption leading-[1.5] text-status-warning-dark">
                Add an active connection in Connection Registry before creating a script.
              </p>
            ) : null}
          </aside>
        </Card>

        <Card className="gap-0 py-0 overflow-hidden" asChild>
          <main aria-label="Script workbench editor">
            {workspace.kind === 'idle' ? (
              <div className={workbenchStateClass}>
                <span
                  className={cn(
                    workbenchStateMarkClass,
                    'bg-accent font-mono text-caption font-[850] text-primary',
                  )}
                  aria-hidden="true"
                >
                  PY
                </span>
                <h2 className={cn(workbenchHeadingClass, 'text-heading-3')}>
                  Select a script or start a draft
                </h2>
                <p className={workbenchStateCopyClass}>
                  Published versions remain immutable. Editing any loaded source creates a new
                  version when you save.
                </p>
                <Button
                  disabled={registryLoading || registryError || connections.length === 0}
                  onClick={createDraft}
                >
                  Create script draft
                </Button>
              </div>
            ) : null}

            {workspace.kind === 'loading' ? (
              <div className={workbenchStateClass} role="status">
                <Spinner className="size-7 text-primary" />
                <h2 className={cn(workbenchHeadingClass, 'text-heading-3')}>Loading script…</h2>
                <p className={workbenchStateCopyClass}>
                  Fetching metadata, version history, and the exact current source.
                </p>
              </div>
            ) : null}

            {workspace.kind === 'error' ? (
              <div className={workbenchStateClass} role="alert">
                <span
                  className={cn(
                    workbenchStateMarkClass,
                    'bg-destructive/15 text-body-lg font-[850] text-destructive',
                  )}
                  aria-hidden="true"
                >
                  !
                </span>
                <h2 className={cn(workbenchHeadingClass, 'text-heading-3')}>
                  This script could not be loaded
                </h2>
                <p className={workbenchStateCopyClass}>
                  It may be unavailable, or its current artifact may have failed integrity checks.
                </p>
                <Button variant="outline" onClick={() => void loadScript(workspace.scriptId)}>
                  Retry
                </Button>
              </div>
            ) : null}

            {session ? (
              <>
                <div className="flex flex-col items-stretch justify-between gap-5 border-b border-border px-[18px] py-[21px] md:flex-row md:items-center md:px-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(pillClass, 'text-primary uppercase')}>
                        {sessionStateLabel(session)}
                      </span>
                      {isDirty ? (
                        <span className={cn(pillClass, amberPillClass)}>Unsaved changes</span>
                      ) : null}
                    </div>
                    <h2 className={cn(workbenchHeadingClass, 'mt-[7px] text-title')}>
                      {session.script ? session.script.name : 'New script draft'}
                    </h2>
                  </div>
                  <div className={scriptActionsClass}>
                    <Button
                      variant="outline"
                      disabled={!isDirty || isSaving || loadingVersion !== undefined}
                      onClick={() => void save(false)}
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      disabled={!isDirty || isSaving || loadingVersion !== undefined}
                      onClick={() => void save(true)}
                    >
                      {isSaving ? 'Saving…' : 'Save & Run'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-[14px] border-b border-border bg-card px-[18px] py-5 md:grid-cols-2 md:px-6">
                  <TextField
                    autoComplete="off"
                    dirty={session.draft.name !== session.baseline.name}
                    disabled={isSaving}
                    label="Script name"
                    maxLength={120}
                    onChange={(event) => updateDraft({ name: event.target.value })}
                    placeholder="Daily customer export"
                    value={session.draft.name}
                    {...(session.draft.name !== session.baseline.name ? { hint: 'Modified' } : {})}
                  />
                  <SelectField
                    data={[
                      { label: 'Select a connection', value: '' },
                      ...(!selectedConnection && session.draft.connectionId
                        ? [
                            {
                              label: 'Connection no longer active',
                              value: session.draft.connectionId,
                            },
                          ]
                        : []),
                      ...(connections ?? []).map((connection) => ({
                        label: `${connection.name} · ${connection.connectorLabel}`,
                        value: connection.id,
                      })),
                    ]}
                    dirty={session.draft.connectionId !== session.baseline.connectionId}
                    disabled={isSaving}
                    label="Active connection"
                    onChange={(connectionId) => updateDraft({ connectionId })}
                    value={session.draft.connectionId}
                    {...(session.draft.connectionId !== session.baseline.connectionId
                      ? { hint: 'Modified' }
                      : {})}
                  />
                  <TextareaField
                    className="col-auto md:col-span-full"
                    dirty={
                      (session.draft.description ?? '') !== (session.baseline.description ?? '')
                    }
                    disabled={isSaving}
                    hint="Optional"
                    label="Description"
                    maxLength={2000}
                    rows={2}
                    onChange={(event) => updateDraft({ description: event.target.value })}
                    placeholder="What this transformation publishes"
                    value={session.draft.description ?? ''}
                  />
                </div>

                <div className="border-b border-border">
                  <div className="flex min-h-[49px] items-center justify-between gap-4 bg-editor-chrome px-[18px] py-[9px] text-editor-ink md:px-6">
                    <div className="flex items-baseline gap-[10px]">
                      <span className="text-caption font-[750]">Python source</span>
                      <small className="text-micro text-muted-foreground">
                        {formatBytes(new TextEncoder().encode(session.draft.source).byteLength)}{' '}
                        UTF-8
                      </small>
                    </div>
                    {sourceDirty ? (
                      <span className={cn(pillClass, amberPillClass)}>Modified</span>
                    ) : null}
                  </div>
                  <PythonEditor
                    modelKey={`${session.script?.id ?? 'new'}-${session.key}`}
                    value={session.draft.source}
                    disabled={isSaving}
                    onChange={(source) => updateDraft({ source })}
                  />
                </div>

                <div className="grid grid-cols-1 items-start min-[1081px]:grid-cols-[minmax(0,1fr)_minmax(285px,0.78fr)]">
                  <section
                    className={cn(
                      detailPanelClass,
                      'border-b border-border min-[1081px]:border-b-0 min-[1081px]:border-r',
                    )}
                    aria-labelledby="artifact-heading"
                  >
                    <div className={panelHeadingRowClass}>
                      <div>
                        <span className={panelEyebrowClass}>Platform managed</span>
                        <h3
                          className={cn(workbenchHeadingClass, 'text-body-lg')}
                          id="artifact-heading"
                        >
                          Artifact location
                        </h3>
                      </div>
                      {session.viewedVersion ? (
                        <span className={cn(pillClass, 'bg-accent px-2 py-[5px] text-primary')}>
                          v{session.viewedVersion.versionNumber}
                        </span>
                      ) : null}
                    </div>
                    {session.viewedVersion ? (
                      <dl className="m-0 grid gap-[11px]">
                        {[
                          { label: 'Bucket', value: session.viewedVersion.artifactBucket },
                          { label: 'Object key', value: session.viewedVersion.objectKey },
                          { label: 'SHA-256 digest', value: session.viewedVersion.contentSha256 },
                          {
                            label: 'Published',
                            value: formatDateTime(session.viewedVersion.publishedAt),
                          },
                        ].map((entry) => (
                          <div
                            className="grid min-w-0 grid-cols-1 gap-[3px] sm:grid-cols-[92px_minmax(0,1fr)] sm:gap-3"
                            key={entry.label}
                          >
                            <dt className="text-micro font-[750] text-muted-foreground uppercase">
                              {entry.label}
                            </dt>
                            <dd className="m-0 min-w-0 font-mono text-micro leading-[1.45] wrap-anywhere text-foreground">
                              {entry.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className={panelEmptyCopyClass}>
                        The bucket and object key are assigned by the platform after the first save.
                      </p>
                    )}
                    {session.script?.currentVersion ? (
                      <p className="mt-[17px] border-t border-border pt-[14px] text-caption leading-[1.55] text-muted-foreground">
                        Current version: v{session.script.currentVersion.versionNumber} ·{' '}
                        {formatBytes(session.script.currentVersion.contentSize)} · published{' '}
                        {formatDateTime(session.script.currentVersion.publishedAt)}
                      </p>
                    ) : null}
                  </section>

                  <section className={detailPanelClass} aria-labelledby="versions-heading">
                    <div className={panelHeadingRowClass}>
                      <div>
                        <span className={panelEyebrowClass}>Immutable history</span>
                        <h3
                          className={cn(workbenchHeadingClass, 'text-body-lg')}
                          id="versions-heading"
                        >
                          Published versions
                        </h3>
                      </div>
                      <Badge variant="secondary">{session.versions.length}</Badge>
                    </div>
                    {session.versions.length === 0 ? (
                      <p className={panelEmptyCopyClass}>
                        No source version has been published yet.
                      </p>
                    ) : (
                      <div className="grid max-h-[315px] gap-2 overflow-auto">
                        {session.versions.map((version) => {
                          const loaded =
                            version.versionNumber === session.viewedVersion?.versionNumber;
                          return (
                            <button
                              type="button"
                              className={cn(
                                'grid min-w-0 cursor-pointer gap-[5px] rounded-md border border-border bg-card p-[11px] text-left disabled:cursor-wait disabled:opacity-70 not-disabled:hover:border-border',
                                loaded && 'border-primary/40 bg-accent',
                              )}
                              key={version.id}
                              disabled={isSaving || loadingVersion !== undefined}
                              onClick={() => requestVersion(version)}
                            >
                              <span className="flex items-center justify-between gap-3 text-caption">
                                <strong>Version {version.versionNumber}</strong>
                                <span className="text-micro font-[750] text-primary">
                                  {loadingVersion === version.versionNumber
                                    ? 'Loading…'
                                    : loaded
                                      ? 'Loaded'
                                      : 'Load source'}
                                </span>
                              </span>
                              <span className="text-micro text-muted-foreground">
                                {formatBytes(version.contentSize)} ·{' '}
                                {formatDateTime(version.publishedAt)}
                              </span>
                              <code className="overflow-hidden text-micro text-ellipsis whitespace-nowrap text-muted-foreground">
                                {version.contentSha256}
                              </code>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>

                <div className="flex flex-col items-stretch justify-between gap-5 border-t border-border bg-muted px-[18px] py-[17px] md:flex-row md:items-center md:px-6">
                  <div>
                    <strong className="text-caption">
                      {metadataDirty ? 'Metadata modified.' : 'Metadata matches the baseline.'}
                    </strong>
                    <span className="text-caption text-muted-foreground">
                      {sourceDirty
                        ? ' Saving publishes the editor contents as a new immutable version.'
                        : ' Edit the loaded source to publish another version.'}
                    </span>
                  </div>
                  <div className={scriptActionsClass}>
                    <Button
                      variant="outline"
                      disabled={!isDirty || isSaving}
                      onClick={() => void save(false)}
                    >
                      Save
                    </Button>
                    <Button disabled={!isDirty || isSaving} onClick={() => void save(true)}>
                      Save & Run
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </main>
        </Card>
      </div>

      {discardRequest ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setDiscardRequest(undefined);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{discardRequest.title}</DialogTitle>
            </DialogHeader>
            <p className="mb-6 text-body-sm leading-[1.6] text-muted-foreground">
              {discardRequest.message}
            </p>
            <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="outline" onClick={() => setDiscardRequest(undefined)}>
                Keep editing
              </Button>
              <Button variant="destructive" onClick={confirmDiscard}>
                Discard changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

function draftFromScript(
  script: ScriptViewModel,
  source: string,
  viewedVersionNumber?: number,
): EditableScriptDraft {
  return {
    scriptId: script.id,
    name: script.name,
    connectionId: script.connectionId,
    source,
    ...(script.description ? { description: script.description } : {}),
    ...(viewedVersionNumber !== undefined ? { viewedVersionNumber } : {}),
  };
}

function sessionIsDirty(session: EditorSession): boolean {
  return (
    session.needsPublish ||
    metadataIsDirty(session.draft, session.baseline) ||
    session.draft.source !== session.baseline.source
  );
}

function metadataIsDirty(draft: EditableScriptDraft, baseline: EditableScriptDraft): boolean {
  return (
    draft.name !== baseline.name ||
    (draft.description ?? '') !== (baseline.description ?? '') ||
    draft.connectionId !== baseline.connectionId
  );
}

function sessionStateLabel(session: EditorSession): string {
  if (!session.script) {
    return 'Unsaved draft';
  }
  if (!session.viewedVersion) {
    return 'Publication pending';
  }
  if (session.viewedVersion.versionNumber === session.script.currentVersion?.versionNumber) {
    return `Current version ${session.viewedVersion.versionNumber}`;
  }
  return `Viewing version ${session.viewedVersion.versionNumber} · current ${session.script.currentVersion?.versionNumber ?? 'none'}`;
}

function upsertScript(
  scripts: readonly ScriptViewModel[],
  saved: ScriptViewModel,
): readonly ScriptViewModel[] {
  const exists = scripts.some((script) => script.id === saved.id);
  const next = exists
    ? scripts.map((script) => (script.id === saved.id ? saved : script))
    : [saved, ...scripts];
  return [...next].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sortVersions(
  versions: readonly ScriptVersionViewModel[],
): readonly ScriptVersionViewModel[] {
  return [...versions].sort((left, right) => right.versionNumber - left.versionNumber);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}
