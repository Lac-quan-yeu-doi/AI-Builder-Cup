import { ChartError } from '@domain/chart/errors/chart.errors';
import type {
  OutputColumn,
  VisualizationDefinition,
} from '@domain/chart/models/visualization-definition';
import type { QueryDefinition } from '@domain/chart/models/query-definition';
import type { Chart, ChartRevision } from '@domain/chart/models/chart';
import type { ChartActor, ChartDraft } from './chart-authoring.use-cases';
import type { ChartAuthoringUseCases } from './chart-authoring.use-cases';
import type { ChartRuntimeUseCases, TransientChartDraft } from './chart-runtime.use-cases';
import type { ChartCollectionUseCases } from '@application/chart-collection/chart-collection.use-cases';

export interface PreviewChatChartInput {
  readonly actor: ChartActor;
  readonly title: string;
  readonly description?: string | null;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly parameterValues?: Readonly<Record<string, unknown>>;
}

export interface CreateChatChartInput extends PreviewChatChartInput {
  readonly collectionId: string;
}

export interface ChatChartPreview {
  readonly runId: string;
  readonly columns: readonly OutputColumn[];
  readonly rows: readonly (readonly unknown[])[];
  readonly rowCount: number;
  readonly byteCount: number;
  readonly truncated: boolean;
}

export interface UpdateChatChartInput {
  readonly actor: ChartActor;
  readonly chartId: string;
  readonly expectedRevision: number;
  readonly title: string;
  readonly description?: string | null;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly parameterValues?: Readonly<Record<string, unknown>>;
}

/**
 * Automatic Chat-to-Chart orchestration. The only durable operation is the
 * canonical Chart/revision write after a successful, bounded query preview.
 * Result rows are deliberately consumed and discarded from this use case.
 */
export class ChatChartCreationUseCases {
  public constructor(
    private readonly runtime: ChartRuntimeUseCases,
    private readonly authoring: ChartAuthoringUseCases,
    private readonly collections: ChartCollectionUseCases,
  ) {}

  public preview(input: PreviewChatChartInput): Promise<ChatChartPreview> {
    return this.collectPreview(input.actor, {
      title: input.title,
      description: input.description,
      queryDefinition: input.queryDefinition,
      visualizationDefinition: input.visualizationDefinition,
      outputSchema: [],
      parameterValues: input.parameterValues,
    });
  }

  public async create(
    input: CreateChatChartInput,
  ): Promise<{ readonly chart: Chart; readonly revision: ChartRevision }> {
    await this.collections.requireCurate(input.collectionId, {
      organizationId: input.actor.organizationId,
      identityId: input.actor.identityId,
      isOrganizationAdmin: input.actor.isOrganizationAdmin === true,
    });
    const preview = await this.preview(input);
    if (preview.truncated || preview.columns.length === 0) throw ChartError.previewMismatch();
    return this.authoring.createChart({
      actor: input.actor,
      draft: {
        title: input.title,
        description: input.description,
        collectionId: input.collectionId,
        queryDefinition: input.queryDefinition,
        visualizationDefinition: input.visualizationDefinition,
        outputSchema: preview.columns,
        parameterValues: input.parameterValues,
        provenance: 'CHAT',
      },
    });
  }

  public async update(
    input: UpdateChatChartInput,
  ): Promise<{ readonly chart: Chart; readonly revision: ChartRevision }> {
    const existing = await this.authoring.getChart(
      input.actor.organizationId,
      input.chartId,
      input.actor,
    );
    if (!existing.chart.collectionId) throw ChartError.authorizationDenied();
    const draft: ChartDraft = {
      title: input.title,
      description: input.description,
      collectionId: existing.chart.collectionId,
      queryDefinition: input.queryDefinition,
      visualizationDefinition: input.visualizationDefinition,
      outputSchema: [],
      parameterValues: input.parameterValues,
      provenance: existing.chart.provenance === 'CHAT' ? 'CHAT' : 'MANUAL',
    };
    const preview = await this.collectPreview(input.actor, draft);
    if (preview.truncated || preview.columns.length === 0) throw ChartError.previewMismatch();
    return this.authoring.updateChartFromDraft({
      actor: input.actor,
      chartId: input.chartId,
      expectedRevision: input.expectedRevision,
      draft: { ...draft, outputSchema: preview.columns },
    });
  }

  private async collectPreview(
    actor: ChartActor,
    draft: TransientChartDraft,
  ): Promise<ChatChartPreview> {
    const preview = await this.runtime.previewChartDraft({
      actor,
      draft,
      parameterValues: draft.parameterValues,
    });
    let columns: readonly OutputColumn[] = draft.outputSchema;
    const rows: (readonly unknown[])[] = [];
    let rowCount = 0;
    let byteCount = 0;
    let truncated = false;
    for await (const event of preview.stream) {
      if (event.type === 'COLUMNS') columns = event.columns;
      if (event.type === 'ROWS') rows.push(...event.rows);
      if (event.type === 'SUCCEEDED') {
        rowCount = event.rowCount;
        byteCount = event.byteCount;
        truncated = event.truncated;
      }
      if (event.type === 'FAILED') throw ChartError.executionFailed(event.code, event.message);
      if (event.type === 'CANCELLED' || event.type === 'TIMED_OUT') {
        throw ChartError.executionFailed(event.type, `Chart query ${event.type.toLowerCase()}.`);
      }
    }
    return {
      runId: preview.runId,
      columns,
      rows,
      rowCount,
      byteCount,
      truncated,
    };
  }
}
