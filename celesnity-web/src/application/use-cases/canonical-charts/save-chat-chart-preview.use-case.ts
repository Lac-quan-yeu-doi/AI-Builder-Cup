import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type {
  CanonicalChart,
  OutputColumn,
  ParameterValue,
  QueryDefinition,
  VisualizationDefinition,
} from '@/src/entities/models/canonical-chart';

export interface SaveChatChartPreviewInput {
  readonly title: string;
  readonly description: string | null;
  readonly collectionId: string;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly outputSchema: readonly OutputColumn[];
  readonly parameterValues: Readonly<Record<string, ParameterValue>>;
  readonly truncated: boolean;
}

export type SaveChatChartPreviewUseCase = (
  input: SaveChatChartPreviewInput,
) => Promise<CanonicalChart>;

export const createSaveChatChartPreviewUseCase =
  (repository: CanonicalChartRepository): SaveChatChartPreviewUseCase =>
  async (input) => {
    const title = input.title.trim();
    const collectionId = input.collectionId.trim();
    if (!title) throw new Error('Chart title is required.');
    if (!collectionId) throw new Error('Destination collection is required.');
    if (input.truncated) {
      throw new Error('This preview reached the analytical limit and cannot be saved.');
    }
    if (!repository.saveChatPreview) throw new Error('Chat chart saving is unavailable.');
    return repository.saveChatPreview({
      title,
      description: input.description,
      collectionId,
      queryDefinition: input.queryDefinition,
      visualizationDefinition: input.visualizationDefinition,
      outputSchema: input.outputSchema,
      parameterValues: input.parameterValues,
    });
  };
