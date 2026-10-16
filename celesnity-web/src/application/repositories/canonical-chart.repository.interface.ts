import type {
  CanonicalChart,
  ChartCapability,
  ChartDraft,
  ChartPreview,
  ChartRevision,
  ChartSummary,
  CompiledChartQuery,
  CreateCanonicalChartInput,
} from '@/src/entities/models/canonical-chart';

/** Canonical chart operations never accept or return a persisted query result. */
export interface CanonicalChartRepository {
  readonly getCapabilities?: () => Promise<readonly ChartCapability[]>;
  previewQuery(input: {
    readonly queryDefinition: ChartDraft['queryDefinition'];
    readonly parameterValues: ChartDraft['parameterValues'];
  }): Promise<ChartPreview>;
  preview(input: ChartDraft): Promise<ChartPreview>;
  compileQuery(input: {
    readonly queryDefinition: ChartDraft['queryDefinition'];
    readonly parameterValues: ChartDraft['parameterValues'];
  }): Promise<CompiledChartQuery>;
  create(input: CreateCanonicalChartInput): Promise<CanonicalChart>;
  readonly saveChatPreview?: (input: CreateCanonicalChartInput) => Promise<CanonicalChart>;
  readonly update?: (
    input: CreateCanonicalChartInput & {
      readonly chartId: string;
      readonly expectedRevision: number;
    },
  ) => Promise<CanonicalChart>;
  readonly saveAsNew?: (input: CreateCanonicalChartInput) => Promise<CanonicalChart>;
  get(id: string): Promise<CanonicalChart>;
  readonly list?: (collectionId?: string) => Promise<readonly ChartSummary[]>;
  runSaved(id: string, parameterValues: ChartDraft['parameterValues']): Promise<ChartPreview>;
  /** Cancel an active run using the chart-scoped Core route. */
  readonly cancelRun?: (input: {
    readonly chartId: string;
    readonly runId: string;
  }) => Promise<void>;
  readonly listRevisions?: (id: string) => Promise<readonly ChartRevision[]>;
  readonly restoreRevision?: (input: {
    readonly chartId: string;
    readonly revisionNumber: number;
    readonly expectedRevision: number;
  }) => Promise<CanonicalChart>;
  readonly move?: (id: string, collectionId: string) => Promise<CanonicalChart>;
  archive(id: string): Promise<void>;
}
