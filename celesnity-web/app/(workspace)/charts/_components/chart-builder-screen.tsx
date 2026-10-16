'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PlayIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import {
  chartBuilderReducer,
  createInitialChartBuilderState,
  type PreviewScope,
  type QueryPreviewState,
} from './chart-builder-state';
import { ChartBuilderEntry } from './chart-builder-entry';
import { ChartBuilderHeader } from './chart-builder-header';
import { ChartSaveDialog, type ChartSaveValues } from './chart-save-dialog';
import {
  createEmptyVisualQuery,
  type ChartDraft,
  type NativeQueryDefinition,
  type QueryDefinition,
  type VisualizationDefinition,
  type VisualQueryPreviewStage,
} from '@/src/entities/models/canonical-chart';
import type { CreateCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/create-canonical-chart.controller';
import type { PreviewCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/preview-canonical-chart.controller';
import type { PreviewCanonicalChartQueryController } from '@/src/interface-adapters/controllers/canonical-charts/preview-canonical-chart-query.controller';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import type { ListQueryCatalogsController } from '@/src/interface-adapters/controllers/queries/list-query-catalogs.controller';
import type { ListQueryNamespacesController } from '@/src/interface-adapters/controllers/queries/list-query-namespaces.controller';
import type { ListTablesController } from '@/src/interface-adapters/controllers/catalog/list-tables.controller';
import type { LoadTableMetadataController } from '@/src/interface-adapters/controllers/catalog/load-table-metadata.controller';
import type { CompileCanonicalChartQueryController } from '@/src/interface-adapters/controllers/canonical-charts/compile-canonical-chart-query.controller';
import type { ListChartCollectionsController } from '@/src/interface-adapters/controllers/chart-collections/list-chart-collections.controller';
import type { ChartCollection } from '@/src/entities/models/chart-collection';
import { projectQueryForPreview } from '@/src/interface-adapters/controllers/canonical-charts/project-visual-query-preview.controller';
import { CompiledSqlDrawer } from './native-query/compiled-sql-drawer';
import { NativeQueryEditor } from './native-query/native-query-editor';
import { QuestionBuilderSurface, questionSourcePath } from './question-builder-surface';
import type { DataSourceBrowserControllers } from './data-source-picker/data-source-picker.types';
import { QueryPreviewPane } from './preview/query-preview-pane';
import { VisualizationResultsSurface } from './visualization/visualization-results-surface';
import { bindVisualizationToFields } from './visualization/visualization-type-transition';
import type { RelationMetadataMap } from '@/src/interface-adapters/presenters/chart-builder-field.presenter';

export interface ChartBuilderScreenProps {
  readonly controllers: Readonly<{
    readonly queryPreview: PreviewCanonicalChartQueryController;
    readonly preview: PreviewCanonicalChartController;
    readonly create: CreateCanonicalChartController;
    readonly listCollections: ListChartCollectionsController;
    readonly renderer: ChartRenderer;
    readonly update?: (
      input: ChartDraft & {
        readonly chartId: string;
        readonly expectedRevision: number;
      },
    ) => Promise<unknown>;
    readonly saveAsNew?: (input: ChartDraft) => Promise<unknown>;
    readonly listCatalogs?: ListQueryCatalogsController;
    readonly listNamespaces?: ListQueryNamespacesController;
    readonly listTables?: ListTablesController;
    readonly loadTableMetadata?: LoadTableMetadataController;
    readonly compileQuery?: CompileCanonicalChartQueryController;
  }>;
  readonly initialCollectionId?: string;
  readonly initialEntryMode?: 'QUESTION' | 'NATIVE';
  readonly initialDraft?: ChartDraft;
  readonly chartId?: string;
  readonly expectedRevision?: number;
  readonly onSaved?: (chartId: string) => void;
}

type BuilderSurface = 'QUESTION' | 'RESULTS';
type SaveDialogMode = 'CREATE' | 'SAVE_AS_NEW';

/** Orchestrates query authoring, transient previews, visualization editing, and metadata-only saves. */
export function ChartBuilderScreen({
  controllers,
  initialCollectionId = '',
  initialEntryMode,
  initialDraft,
  chartId,
  expectedRevision = 1,
  onSaved,
}: ChartBuilderScreenProps) {
  const [state, dispatch] = useReducer(chartBuilderReducer, undefined, () =>
    createInitialChartBuilderState(
      initialCollectionId,
      'iceberg',
      'analytics',
      initialDraft,
      initialEntryMode === 'NATIVE' ? 'NATIVE' : 'VISUAL',
    ),
  );
  const [entryMode, setEntryMode] = useState<'CHOOSING' | 'BUILDING'>(
    initialDraft || initialEntryMode ? 'BUILDING' : 'CHOOSING',
  );
  const [surface, setSurface] = useState<BuilderSurface>(initialDraft ? 'RESULTS' : 'QUESTION');
  const [nativeFocusRequest, setNativeFocusRequest] = useState(0);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [queryPreviewOpen, setQueryPreviewOpen] = useState(false);
  const [saveDialogMode, setSaveDialogMode] = useState<SaveDialogMode>('CREATE');
  const [saveValues, setSaveValues] = useState<ChartSaveValues>(() =>
    saveValuesFor(initialDraft, initialCollectionId),
  );
  const [saveCollections, setSaveCollections] = useState<readonly ChartCollection[]>([]);
  const [saveCollectionsLoading, setSaveCollectionsLoading] = useState(false);
  const [saveDialogError, setSaveDialogError] = useState<string | null>(null);
  const [saveDraft, setSaveDraft] = useState<ChartDraft | null>(null);
  const [relations, setRelations] = useState<RelationMetadataMap>({});
  const autoPreviewed = useRef(false);
  const previewRequestSequence = useRef(0);
  const query = state.draft.queryDefinition;
  const browserControllers = useMemo<DataSourceBrowserControllers | undefined>(() => {
    const { listCatalogs, listNamespaces, listTables, loadTableMetadata } = controllers;
    return listCatalogs && listNamespaces && listTables && loadTableMetadata
      ? { listCatalogs, listNamespaces, listTables, loadTableMetadata }
      : undefined;
  }, [controllers]);
  const relationLoadKey = useMemo(
    () =>
      query.mode === 'VISUAL'
        ? JSON.stringify([
            [query.source.alias, query.source.table],
            ...query.joins.map((join) => [join.alias, join.table]),
          ])
        : '',
    [query],
  );
  const queryPreviewController = controllers.queryPreview;
  const chartPreviewController = controllers.preview;
  const draftCanPreview = isDraftPreviewable(query);
  const canSave = draftCanPreview;

  useEffect(() => {
    if (!browserControllers || !relationLoadKey) return;
    const sources = JSON.parse(relationLoadKey) as readonly (readonly [
      string,
      { readonly catalog: string; readonly schema: string; readonly table: string },
    ])[];
    if (!sources[0]?.[1].table) return;
    let active = true;
    void Promise.all(
      sources.map(async ([alias, table]) => {
        const metadata = await browserControllers.loadTableMetadata(table);
        return [alias, metadata.columns] as const;
      }),
    )
      .then((entries) => {
        if (active) setRelations(Object.fromEntries(entries));
      })
      .catch(() => {
        // Keep metadata selected in the current session if catalog hydration is temporarily unavailable.
      });
    return () => {
      active = false;
    };
  }, [browserControllers, relationLoadKey]);

  const previewQueryResult = useCallback(
    async (scope: PreviewScope = fullScope()) => {
      const requestId = ++previewRequestSequence.current;
      const startedAt = currentTimeMs();
      dispatch({ type: 'PREVIEW_STARTED', requestId, scope, startedAt });
      const queryDefinition =
        scope.kind === 'STEP' && state.draft.queryDefinition.mode === 'VISUAL'
          ? projectQueryForPreview(state.draft.queryDefinition, scope.stage)
          : state.draft.queryDefinition;
      try {
        const result = await queryPreviewController({
          queryDefinition,
          parameterValues: state.draft.parameterValues,
        });
        const durationMs = elapsedMs(startedAt);
        dispatch({
          type: 'PREVIEW_SUCCEEDED',
          requestId,
          scope,
          result,
          durationMs,
        });
        return requestId === previewRequestSequence.current ? result : null;
      } catch (error) {
        dispatch({
          type: 'PREVIEW_FAILED',
          requestId,
          scope,
          durationMs: elapsedMs(startedAt),
          message: messageOf(error),
        });
        return null;
      }
    },
    [queryPreviewController, state.draft],
  );

  const previewChart = useCallback(
    async (draft: ChartDraft = state.draft): Promise<boolean> => {
      const requestId = ++previewRequestSequence.current;
      const scope = fullScope();
      const startedAt = currentTimeMs();
      dispatch({ type: 'PREVIEW_STARTED', requestId, scope, startedAt });
      try {
        const result = await chartPreviewController(draft);
        const durationMs = elapsedMs(startedAt);
        if (result.truncated) {
          dispatch({
            type: 'PREVIEW_FAILED',
            requestId,
            scope,
            durationMs,
            message: 'The preview was truncated. Narrow the query before saving.',
          });
          return false;
        }
        dispatch({
          type: 'PREVIEW_SUCCEEDED',
          requestId,
          scope,
          result,
          durationMs,
        });
        return requestId === previewRequestSequence.current;
      } catch (error) {
        dispatch({
          type: 'PREVIEW_FAILED',
          requestId,
          scope,
          durationMs: elapsedMs(startedAt),
          message: messageOf(error),
        });
        return false;
      }
    },
    [chartPreviewController, state.draft],
  );

  const queryPreviewState = useMemo<QueryPreviewState>(
    () => ({
      status: state.previewStatus,
      result: state.preview,
      scope: state.previewScope,
      durationMs: state.previewDurationMs,
      activeRequestId: state.activePreviewRequestId,
      error: state.error,
    }),
    [
      state.activePreviewRequestId,
      state.error,
      state.preview,
      state.previewDurationMs,
      state.previewScope,
      state.previewStatus,
    ],
  );

  useEffect(() => {
    if (!initialDraft || autoPreviewed.current) return;
    autoPreviewed.current = true;
    void previewChart();
  }, [initialDraft, previewChart]);

  function chooseQuestion(): void {
    setEntryMode('BUILDING');
    setSurface('QUESTION');
    if (query.mode !== 'VISUAL') {
      updateQuery(createEmptyVisualQuery(query.context));
    }
  }

  function chooseNative(): void {
    setEntryMode('BUILDING');
    setSurface('QUESTION');
    if (query.mode !== 'NATIVE') {
      updateQuery({
        schemaVersion: 1,
        mode: 'NATIVE',
        context: query.context,
        parameters: [],
        sql: '',
      });
    }
  }

  function updateQuery(next: QueryDefinition): void {
    previewRequestSequence.current += 1;
    dispatch({ type: 'QUERY_CHANGED', query: next });
  }

  function updateVisualization(next: VisualizationDefinition): void {
    previewRequestSequence.current += 1;
    dispatch({ type: 'VISUALIZATION_CHANGED', visualization: next });
  }

  async function visualize(): Promise<void> {
    const queryResult = await previewQueryResult(fullScope());
    if (!queryResult) {
      setQueryPreviewOpen(true);
      return;
    }
    const visualization = bindVisualizationToFields(
      state.draft.visualizationDefinition,
      queryResult.columns.map((column) => column.name),
      visualizationRoleHints(state.draft.queryDefinition),
    );
    const previewDraft: ChartDraft = {
      ...state.draft,
      visualizationDefinition: visualization,
      outputSchema: queryResult.columns,
    };
    if (visualization !== state.draft.visualizationDefinition) {
      dispatch({ type: 'VISUALIZATION_CHANGED', visualization });
    }
    const validated = await previewChart(previewDraft);
    if (validated) {
      setQueryPreviewOpen(false);
      setSurface('RESULTS');
    } else {
      setQueryPreviewOpen(true);
    }
  }

  function previewQuery(stage: VisualQueryPreviewStage): void {
    setQueryPreviewOpen(true);
    void previewQueryResult({ kind: 'STEP', stage });
  }

  function editQuestion(): void {
    setSurface('QUESTION');
  }

  async function requestSave(mode: SaveDialogMode = 'CREATE'): Promise<void> {
    if (!draftCanPreview || state.saving) return;
    if (mode === 'CREATE' && chartId && controllers.update) {
      await updateExistingChart(state.draft);
      return;
    }
    openSaveDialog(mode, state.draft);
  }

  function openSaveDialog(mode: SaveDialogMode, draft: ChartDraft): void {
    setSaveDialogMode(mode);
    setSaveDraft(draft);
    setSaveDialogError(null);
    setSaveValues(saveValuesFor(draft, draft.collectionId));
    setSaveDialogOpen(true);
    void loadSaveCollections(draft.collectionId);
  }

  async function loadSaveCollections(preferredCollectionId: string): Promise<void> {
    setSaveCollectionsLoading(true);
    setSaveDialogError(null);
    try {
      const collections = await controllers.listCollections();
      setSaveCollections(collections);
      const destinations = flattenCuratableCollections(collections);
      setSaveValues((current) => ({
        ...current,
        collectionId: destinations.some(({ id }) => id === preferredCollectionId)
          ? preferredCollectionId
          : (destinations.find(({ kind }) => kind === 'PERSONAL')?.id ?? destinations[0]?.id ?? ''),
      }));
    } catch (error) {
      setSaveCollections([]);
      setSaveDialogError(messageOf(error));
    } finally {
      setSaveCollectionsLoading(false);
    }
  }

  async function updateExistingChart(draft: ChartDraft): Promise<void> {
    if (!chartId || !controllers.update) return;
    dispatch({ type: 'SAVE_STARTED' });
    try {
      const saved = await controllers.update({
        ...draft,
        chartId,
        expectedRevision,
      });
      dispatch({ type: 'SAVE_FINISHED' });
      notifySaved(saved);
    } catch (error) {
      dispatch({ type: 'SAVE_FAILED', message: messageOf(error) });
    }
  }

  async function submitSave(values: ChartSaveValues): Promise<void> {
    if (!saveDraft) return;
    setSaveDialogError(null);
    dispatch({ type: 'SAVE_STARTED' });
    const draft: ChartDraft = {
      ...saveDraft,
      title: values.title.trim(),
      collectionId: values.collectionId.trim(),
      description: values.description,
    };
    try {
      const saved =
        saveDialogMode === 'SAVE_AS_NEW'
          ? controllers.saveAsNew
            ? await controllers.saveAsNew(draft)
            : null
          : await controllers.create(draft);
      if (saveDialogMode === 'SAVE_AS_NEW' && !controllers.saveAsNew) {
        throw new Error('Save as new is unavailable.');
      }
      dispatch({ type: 'SAVE_FINISHED' });
      setSaveDialogOpen(false);
      notifySaved(saved);
    } catch (error) {
      setSaveDialogError(messageOf(error));
      dispatch({ type: 'SAVE_FAILED', message: messageOf(error) });
    }
  }

  function notifySaved(saved: unknown): void {
    if (saved && typeof saved === 'object' && 'id' in saved && typeof saved.id === 'string') {
      onSaved?.(saved.id);
    }
  }

  function renderQuestion(): ReactNode {
    if (!browserControllers) {
      return (
        <p className="rounded-md bg-destructive/10 p-3 text-body-sm text-destructive" role="alert">
          Data Catalog controllers are unavailable. Reconnect to Core and try again.
        </p>
      );
    }
    if (query.mode === 'VISUAL') {
      return (
        <QuestionBuilderSurface
          query={query}
          relations={relations}
          controllers={browserControllers}
          onChange={updateQuery}
          onRelationsChange={setRelations}
          onVisualize={visualize}
          onPreviewStep={previewQuery}
          queryPreview={queryPreviewOpen ? queryPreviewState : undefined}
          onRetryPreview={() => void previewQueryResult(queryPreviewState.scope)}
          previewDisabled={state.previewStatus === 'RUNNING'}
        />
      );
    }
    return (
      <section
        className="mx-auto w-full max-w-310 space-y-5 px-5 py-6 lg:px-8"
        aria-label="Native question builder"
      >
        {queryPreviewOpen ? (
          <QueryPreviewPane
            status={queryPreviewState.status}
            preview={queryPreviewState.result}
            durationMs={queryPreviewState.durationMs}
            error={queryPreviewState.error}
            onRetry={() => void previewQueryResult(fullScope())}
          />
        ) : null}
        <NativeQueryEditor
          query={query as NativeQueryDefinition}
          values={state.draft.parameterValues}
          controllers={browserControllers}
          onChange={(sql) => updateQuery({ ...(query as NativeQueryDefinition), sql })}
          onQueryContextChange={(context) =>
            updateQuery({ ...(query as NativeQueryDefinition), context })
          }
          onParameters={(parameters) =>
            updateQuery({ ...(query as NativeQueryDefinition), parameters })
          }
          onValues={(values) => {
            previewRequestSequence.current += 1;
            dispatch({ type: 'PARAMETERS_CHANGED', values });
          }}
          autoFocus={nativeFocusRequest > 0}
        />
        <Button
          type="button"
          size="lg"
          disabled={state.previewStatus === 'RUNNING'}
          onClick={visualize}
        >
          <PlayIcon aria-hidden="true" /> Visualize
        </Button>
      </section>
    );
  }

  if (entryMode === 'CHOOSING') {
    return (
      <ChartBuilderEntry
        onQuestion={chooseQuestion}
        onNative={chooseNative}
        exitHref={
          initialCollectionId
            ? `/analytics/collections/${encodeURIComponent(initialCollectionId)}`
            : '/analytics'
        }
      />
    );
  }

  if (surface === 'RESULTS') {
    return (
      <>
        {!saveDialogOpen ? (
          <VisualizationResultsSurface
            draft={state.draft}
            fields={state.draft.outputSchema}
            rows={state.fullPreview?.rows ?? []}
            status={state.previewStatus}
            renderer={controllers.renderer}
            error={state.error}
            canSave={canSave}
            saving={state.saving}
            onDefinitionChange={updateVisualization}
            onEdit={editQuestion}
            onRefresh={() => void previewChart()}
            onSave={() => void requestSave()}
            onFilter={query.mode === 'VISUAL' ? editQuestion : undefined}
            onSummarize={query.mode === 'VISUAL' ? editQuestion : undefined}
          />
        ) : null}
        <ChartSaveDialog
          open={saveDialogOpen}
          mode={saveDialogMode}
          values={saveValues}
          collections={saveCollections}
          collectionsLoading={saveCollectionsLoading}
          error={saveDialogError ?? state.error}
          submitting={state.saving}
          onChange={setSaveValues}
          onSubmit={(values) => void submitSave(values)}
          onClose={() => setSaveDialogOpen(false)}
        />
      </>
    );
  }

  if (saveDialogOpen) {
    return (
      <ChartSaveDialog
        open
        mode={saveDialogMode}
        values={saveValues}
        collections={saveCollections}
        collectionsLoading={saveCollectionsLoading}
        error={saveDialogError ?? state.error}
        submitting={state.saving}
        onChange={setSaveValues}
        onSubmit={(values) => void submitSave(values)}
        onClose={() => setSaveDialogOpen(false)}
      />
    );
  }

  return (
    <main
      className="flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground"
      aria-label="Chart question"
    >
      <ChartBuilderHeader
        title={state.draft.title}
        isNew={!chartId}
        subtitle={
          query.mode === 'VISUAL'
            ? questionSourcePath(query)
            : query.context.catalog
              ? `${query.context.catalog} / ${query.context.schema}`
              : null
        }
        exitHref={
          initialCollectionId
            ? `/analytics/collections/${encodeURIComponent(initialCollectionId)}`
            : '/analytics'
        }
        extraActions={
          query.mode === 'VISUAL' && controllers.compileQuery ? (
            <CompiledSqlDrawer
              visualQuery={query}
              parameterValues={state.draft.parameterValues}
              compileQuery={controllers.compileQuery}
              onConvert={(nativeQuery) => {
                previewRequestSequence.current += 1;
                dispatch({ type: 'QUERY_CONVERTED_TO_NATIVE', query: nativeQuery });
                setNativeFocusRequest((current) => current + 1);
              }}
            />
          ) : null
        }
        previewStatus={state.previewStatus}
        saving={state.saving}
        canSave={canSave}
        previewDisabled={
          state.previewStatus === 'RUNNING' ||
          (query.mode === 'NATIVE' && (!query.context.catalog || !query.context.schema)) ||
          (query.mode === 'VISUAL' && !query.source.table.table)
        }
        showPreviewAction
        onTitleChange={(title) => dispatch({ type: 'TITLE_CHANGED', title })}
        onPreview={() => {
          setQueryPreviewOpen(true);
          void previewQueryResult(fullScope());
        }}
        onSave={() => void requestSave()}
        onSaveAsNew={
          chartId && controllers.saveAsNew ? () => void requestSave('SAVE_AS_NEW') : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {renderQuestion()}
        {state.error && !queryPreviewOpen ? (
          <p
            className="mx-auto mt-4 max-w-310 rounded-md bg-destructive/10 px-5 py-3 text-body-sm text-destructive lg:px-8"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}
        {queryPreviewOpen && state.previewStatus === 'SUCCEEDED' ? (
          <p
            className="mx-auto mt-4 max-w-310 px-5 pb-5 text-body-sm text-muted-foreground lg:px-8"
            role="status"
          >
            Preview succeeded.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function saveValuesFor(draft: ChartDraft | undefined, fallbackCollection: string): ChartSaveValues {
  return {
    title: draft?.title ?? 'Untitled chart',
    collectionId: draft?.collectionId ?? fallbackCollection,
    description: draft?.description ?? null,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The chart operation failed.';
}

function fullScope(): PreviewScope {
  return { kind: 'FULL' };
}

function currentTimeMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(currentTimeMs() - startedAt));
}

function isDraftPreviewable(query: QueryDefinition): boolean {
  if (query.mode === 'NATIVE') {
    return Boolean(query.context.catalog && query.context.schema && query.sql.trim());
  }
  return Boolean(
    query.source.table.catalog && query.source.table.schema && query.source.table.table,
  );
}

function visualizationRoleHints(query: QueryDefinition): {
  readonly categories: readonly string[];
  readonly measures: readonly string[];
} {
  if (query.mode !== 'VISUAL') return { categories: [], measures: [] };
  return {
    categories: query.breakouts.flatMap((breakout) =>
      breakout.kind === 'FIELD' ? [breakout.field] : [],
    ),
    measures: query.aggregations.map((aggregation) => aggregation.alias),
  };
}

function flattenCuratableCollections(
  collections: readonly ChartCollection[],
): readonly ChartCollection[] {
  return collections.flatMap((collection) => [
    ...(collection.archivedAt === null && collection.access === 'CURATE' ? [collection] : []),
    ...flattenCuratableCollections(collection.children),
  ]);
}
