import type {
  SaveChatChartPreviewInput,
  SaveChatChartPreviewUseCase,
} from '@/src/application/use-cases/canonical-charts/save-chat-chart-preview.use-case';
import {
  presentCanonicalChart,
  type CanonicalChartViewModel,
} from '@/src/interface-adapters/presenters/canonical-chart.presenter';

export type SaveChatChartPreviewController = ReturnType<
  typeof createSaveChatChartPreviewController
>;

export const createSaveChatChartPreviewController =
  (useCase: SaveChatChartPreviewUseCase) =>
  async (input: SaveChatChartPreviewInput): Promise<CanonicalChartViewModel> =>
    presentCanonicalChart(await useCase(input));
