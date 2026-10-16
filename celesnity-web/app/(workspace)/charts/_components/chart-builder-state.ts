import {
  createDefaultVisualization,
  createEmptyVisualQuery,
  type ActiveChartResult,
  type ChartDraft,
  type NativeQueryDefinition,
  type QueryDefinition,
  type VisualizationDefinition,
  type VisualQueryPreviewStage,
} from '@/src/entities/models/canonical-chart';

export type ChartPreviewStatus = 'EMPTY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'STALE';

export type PreviewScope =
  { readonly kind: 'FULL' } | { readonly kind: 'STEP'; readonly stage: VisualQueryPreviewStage };

export interface QueryPreviewState {
  readonly status: ChartPreviewStatus;
  readonly result: ActiveChartResult | null;
  readonly scope: PreviewScope;
  readonly durationMs: number | null;
  readonly activeRequestId: number | null;
  readonly error: string | null;
}

export interface ChartBuilderState {
  readonly draft: ChartDraft;
  readonly preview: ActiveChartResult | null;
  /** The last complete result used by the visualization canvas. */
  readonly fullPreview: ActiveChartResult | null;
  readonly previewStatus: ChartPreviewStatus;
  readonly previewScope: PreviewScope;
  readonly previewDurationMs: number | null;
  readonly activePreviewRequestId: number | null;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly error: string | null;
}

export type ChartBuilderAction =
  | { readonly type: 'QUERY_CHANGED'; readonly query: QueryDefinition }
  | { readonly type: 'QUERY_CONVERTED_TO_NATIVE'; readonly query: NativeQueryDefinition }
  | { readonly type: 'PARAMETERS_CHANGED'; readonly values: ChartDraft['parameterValues'] }
  | { readonly type: 'VISUALIZATION_CHANGED'; readonly visualization: VisualizationDefinition }
  | { readonly type: 'TITLE_CHANGED'; readonly title: string }
  | { readonly type: 'DESCRIPTION_CHANGED'; readonly description: string | null }
  | { readonly type: 'COLLECTION_CHANGED'; readonly collectionId: string }
  | {
      readonly type: 'PREVIEW_STARTED';
      readonly requestId: number;
      readonly scope?: PreviewScope;
      readonly startedAt?: number;
    }
  | {
      readonly type: 'PREVIEW_SUCCEEDED';
      readonly requestId: number;
      readonly result: ActiveChartResult;
      readonly scope?: PreviewScope;
      readonly durationMs?: number | null;
    }
  | {
      readonly type: 'PREVIEW_FAILED';
      readonly requestId: number;
      readonly message: string;
      readonly scope?: PreviewScope;
      readonly durationMs?: number | null;
    }
  | { readonly type: 'PREVIEW_CLEARED' }
  | { readonly type: 'SAVE_STARTED' }
  | { readonly type: 'SAVE_FINISHED' }
  | { readonly type: 'SAVE_FAILED'; readonly message: string }
  | { readonly type: 'RESET'; readonly state: ChartBuilderState };

export function createInitialChartBuilderState(
  collectionId = '',
  catalog = 'iceberg',
  schema = 'analytics',
  initialDraft?: ChartDraft,
  initialQueryMode: QueryDefinition['mode'] = 'VISUAL',
): ChartBuilderState {
  const queryDefinition: QueryDefinition =
    initialQueryMode === 'NATIVE'
      ? {
          schemaVersion: 1,
          mode: 'NATIVE',
          context: { catalog, schema },
          parameters: [],
          sql: '',
        }
      : createEmptyVisualQuery({ catalog, schema });
  return {
    draft: initialDraft ?? {
      title: 'Untitled chart',
      description: null,
      collectionId,
      queryDefinition,
      visualizationDefinition: createDefaultVisualization('TABLE'),
      outputSchema: [],
      parameterValues: {},
    },
    preview: null,
    fullPreview: null,
    previewStatus: 'EMPTY',
    previewScope: fullScope(),
    previewDurationMs: null,
    activePreviewRequestId: null,
    dirty: false,
    saving: false,
    error: null,
  };
}

export function chartBuilderReducer(
  state: ChartBuilderState,
  action: ChartBuilderAction,
): ChartBuilderState {
  switch (action.type) {
    case 'QUERY_CHANGED':
      return stale({ ...state, draft: { ...state.draft, queryDefinition: action.query } });
    case 'QUERY_CONVERTED_TO_NATIVE':
      return stale({ ...state, draft: { ...state.draft, queryDefinition: action.query } });
    case 'PARAMETERS_CHANGED':
      return stale({ ...state, draft: { ...state.draft, parameterValues: action.values } });
    case 'VISUALIZATION_CHANGED':
      return staleVisualization({
        ...state,
        draft: { ...state.draft, visualizationDefinition: action.visualization },
      });
    case 'TITLE_CHANGED':
      return { ...state, draft: { ...state.draft, title: action.title }, dirty: true, error: null };
    case 'DESCRIPTION_CHANGED':
      return {
        ...state,
        draft: { ...state.draft, description: action.description },
        dirty: true,
        error: null,
      };
    case 'COLLECTION_CHANGED':
      return {
        ...state,
        draft: { ...state.draft, collectionId: action.collectionId },
        dirty: true,
        error: null,
      };
    case 'PREVIEW_STARTED': {
      const scope = action.scope ?? fullScope();
      return {
        ...state,
        previewStatus: 'RUNNING',
        previewScope: scope,
        previewDurationMs: null,
        activePreviewRequestId: action.requestId,
        error: null,
      };
    }
    case 'PREVIEW_SUCCEEDED':
      if (action.requestId !== state.activePreviewRequestId) return state;
      {
        const scope = action.scope ?? fullScope();
        const isFull = scope.kind === 'FULL';
        return {
          ...state,
          draft: isFull ? { ...state.draft, outputSchema: action.result.columns } : state.draft,
          preview: action.result,
          fullPreview: isFull ? action.result : state.fullPreview,
          previewStatus: 'SUCCEEDED',
          previewScope: scope,
          previewDurationMs: action.durationMs ?? null,
          activePreviewRequestId: null,
          error: null,
        };
      }
    case 'PREVIEW_FAILED':
      if (action.requestId !== state.activePreviewRequestId) return state;
      {
        const scope = action.scope ?? fullScope();
        return {
          ...state,
          preview: state.preview,
          fullPreview: state.fullPreview,
          previewStatus: state.preview ? 'STALE' : 'FAILED',
          previewScope: scope,
          previewDurationMs: action.durationMs ?? state.previewDurationMs,
          activePreviewRequestId: null,
          dirty: true,
          error: action.message,
        };
      }
    case 'PREVIEW_CLEARED':
      return {
        ...state,
        preview: null,
        fullPreview: null,
        previewStatus: 'EMPTY',
        previewScope: fullScope(),
        previewDurationMs: null,
        activePreviewRequestId: null,
        error: null,
      };
    case 'SAVE_STARTED':
      return { ...state, saving: true, error: null };
    case 'SAVE_FINISHED':
      return { ...state, saving: false, dirty: false, error: null };
    case 'SAVE_FAILED':
      return { ...state, saving: false, error: action.message };
    case 'RESET':
      return action.state;
  }
}

function stale(state: ChartBuilderState): ChartBuilderState {
  return {
    ...state,
    preview: state.preview,
    fullPreview: state.fullPreview,
    previewStatus: 'STALE',
    activePreviewRequestId: null,
    dirty: true,
    error: null,
  };
}

/** A visualization-only edit can redraw from the last in-memory rows while invalidating save readiness. */
function staleVisualization(state: ChartBuilderState): ChartBuilderState {
  return {
    ...state,
    previewStatus: 'STALE',
    activePreviewRequestId: null,
    dirty: true,
    error: null,
  };
}

function fullScope(): PreviewScope {
  return { kind: 'FULL' };
}
