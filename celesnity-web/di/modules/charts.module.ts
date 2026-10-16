import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createListChartsUseCase } from '@/src/application/use-cases/charts/list-charts.use-case';
import { createSubscribeChartsUseCase } from '@/src/application/use-cases/charts/subscribe-charts.use-case';
import { createCreateChartUseCase } from '@/src/application/use-cases/charts/create-chart.use-case';
import { createPatchChartUseCase } from '@/src/application/use-cases/charts/patch-chart.use-case';
import { createDeleteChartUseCase } from '@/src/application/use-cases/charts/delete-chart.use-case';
import { createSetChartDataFromCsvUseCase } from '@/src/application/use-cases/charts/set-chart-data-from-csv.use-case';
import { createSuggestChartEncodingsUseCase } from '@/src/application/use-cases/charts/suggest-chart-encodings.use-case';
import { CoreApiChartRepository } from '@/src/infrastructure/repositories/core-api-chart.repository';
import { CoreApiCanonicalChartRepository } from '@/src/infrastructure/repositories/core-api-canonical-chart.repository';
import { CoreApiChartCollectionRepository } from '@/src/infrastructure/repositories/core-api-chart-collection.repository';
import { RechartsChartRenderer } from '@/src/infrastructure/visualization/recharts-chart-renderer.service';
import { AgentApiChartEncodingSuggestionRepository } from '@/src/infrastructure/repositories/agent-api-chart-encoding-suggestion.repository';
import { EventSourceChartProgressService } from '@/src/infrastructure/services/event-source-chart-progress.service';
import { createListChartsController } from '@/src/interface-adapters/controllers/charts/list-charts.controller';
import { createSubscribeChartsController } from '@/src/interface-adapters/controllers/charts/subscribe-charts.controller';
import { createCreateChartController } from '@/src/interface-adapters/controllers/charts/create-chart.controller';
import { createPatchChartController } from '@/src/interface-adapters/controllers/charts/patch-chart.controller';
import { createDeleteChartController } from '@/src/interface-adapters/controllers/charts/delete-chart.controller';
import { createSetChartDataFromCsvController } from '@/src/interface-adapters/controllers/charts/set-chart-data-from-csv.controller';
import { createSuggestChartEncodingsController } from '@/src/interface-adapters/controllers/charts/suggest-chart-encodings.controller';
import { createPreviewCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/preview-canonical-chart.use-case';
import { createPreviewCanonicalChartQueryUseCase } from '@/src/application/use-cases/canonical-charts/preview-canonical-chart-query.use-case';
import { createCompileCanonicalChartQueryUseCase } from '@/src/application/use-cases/canonical-charts/compile-canonical-chart-query.use-case';
import { createCreateCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/create-canonical-chart.use-case';
import { createGetCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/get-canonical-chart.use-case';
import { createRunSavedCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/run-saved-canonical-chart.use-case';
import { createListCanonicalChartsUseCase } from '@/src/application/use-cases/canonical-charts/list-canonical-charts.use-case';
import { createUpdateCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/update-canonical-chart.use-case';
import { createListCanonicalChartRevisionsUseCase } from '@/src/application/use-cases/canonical-charts/list-canonical-chart-revisions.use-case';
import { createRestoreCanonicalChartRevisionUseCase } from '@/src/application/use-cases/canonical-charts/restore-canonical-chart-revision.use-case';
import { createCancelCanonicalChartRunUseCase } from '@/src/application/use-cases/canonical-charts/cancel-canonical-chart-run.use-case';
import { createSaveAsNewCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/save-as-new-canonical-chart.use-case';
import { createSaveChatChartPreviewUseCase } from '@/src/application/use-cases/canonical-charts/save-chat-chart-preview.use-case';
import { createPreviewCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/preview-canonical-chart.controller';
import { createPreviewCanonicalChartQueryController } from '@/src/interface-adapters/controllers/canonical-charts/preview-canonical-chart-query.controller';
import { createCompileCanonicalChartQueryController } from '@/src/interface-adapters/controllers/canonical-charts/compile-canonical-chart-query.controller';
import { createCreateCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/create-canonical-chart.controller';
import { createGetCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/get-canonical-chart.controller';
import { createRunSavedCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/run-saved-canonical-chart.controller';
import { createListCanonicalChartsController } from '@/src/interface-adapters/controllers/canonical-charts/list-canonical-charts.controller';
import { createUpdateCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/update-canonical-chart.controller';
import { createListCanonicalChartRevisionsController } from '@/src/interface-adapters/controllers/canonical-charts/list-canonical-chart-revisions.controller';
import { createRestoreCanonicalChartRevisionController } from '@/src/interface-adapters/controllers/canonical-charts/restore-canonical-chart-revision.controller';
import { createCancelCanonicalChartRunController } from '@/src/interface-adapters/controllers/canonical-charts/cancel-canonical-chart-run.controller';
import { createSaveAsNewCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/save-as-new-canonical-chart.controller';
import { createSaveChatChartPreviewController } from '@/src/interface-adapters/controllers/canonical-charts/save-chat-chart-preview.controller';
import { createListChartCollectionsUseCase } from '@/src/application/use-cases/chart-collections/list-chart-collections.use-case';
import { createChartCollectionUseCases } from '@/src/application/use-cases/chart-collections/manage-chart-collection.use-cases';
import { createListChartCollectionsController } from '@/src/interface-adapters/controllers/chart-collections/list-chart-collections.controller';
import { createCreateChartCollectionController } from '@/src/interface-adapters/controllers/chart-collections/create-chart-collection.controller';
import { createUpdateChartCollectionController } from '@/src/interface-adapters/controllers/chart-collections/update-chart-collection.controller';
import { createMoveChartCollectionController } from '@/src/interface-adapters/controllers/chart-collections/move-chart-collection.controller';
import { createArchiveChartCollectionController } from '@/src/interface-adapters/controllers/chart-collections/archive-chart-collection.controller';

export function createChartsModule() {
  const chartsModule = createTypedModule();

  chartsModule
    .bind(DI_SYMBOLS.ChartRepository)
    .toClass(CoreApiChartRepository, [DI_SYMBOLS.CoreApiClient]);
  chartsModule
    .bind(DI_SYMBOLS.CanonicalChartRepository)
    .toClass(CoreApiCanonicalChartRepository, [DI_SYMBOLS.CoreApiClient]);
  chartsModule
    .bind(DI_SYMBOLS.ChartCollectionRepository)
    .toClass(CoreApiChartCollectionRepository, [DI_SYMBOLS.CoreApiClient]);
  chartsModule
    .bind(DI_SYMBOLS.ChartEncodingSuggestionRepository)
    .toClass(AgentApiChartEncodingSuggestionRepository, [DI_SYMBOLS.AgentApiClient]);
  chartsModule.bind(DI_SYMBOLS.ChartProgressService).toClass(EventSourceChartProgressService);
  chartsModule.bind(DI_SYMBOLS.ChartRendererService).toClass(RechartsChartRenderer);

  chartsModule
    .bind(DI_SYMBOLS.ListChartsUseCase)
    .toHigherOrderFunction(createListChartsUseCase, [DI_SYMBOLS.ChartRepository]);
  chartsModule
    .bind(DI_SYMBOLS.SubscribeChartsUseCase)
    .toHigherOrderFunction(createSubscribeChartsUseCase, [DI_SYMBOLS.ChartProgressService]);
  chartsModule
    .bind(DI_SYMBOLS.CreateChartUseCase)
    .toHigherOrderFunction(createCreateChartUseCase, [DI_SYMBOLS.ChartRepository]);
  chartsModule
    .bind(DI_SYMBOLS.PatchChartUseCase)
    .toHigherOrderFunction(createPatchChartUseCase, [DI_SYMBOLS.ChartRepository]);
  chartsModule
    .bind(DI_SYMBOLS.DeleteChartUseCase)
    .toHigherOrderFunction(createDeleteChartUseCase, [DI_SYMBOLS.ChartRepository]);
  chartsModule
    .bind(DI_SYMBOLS.SetChartDataFromCsvUseCase)
    .toHigherOrderFunction(createSetChartDataFromCsvUseCase, [DI_SYMBOLS.ChartRepository]);
  chartsModule
    .bind(DI_SYMBOLS.SuggestChartEncodingsUseCase)
    .toHigherOrderFunction(createSuggestChartEncodingsUseCase, [
      DI_SYMBOLS.ChartEncodingSuggestionRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.PreviewCanonicalChartUseCase)
    .toHigherOrderFunction(createPreviewCanonicalChartUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.PreviewCanonicalChartQueryUseCase)
    .toHigherOrderFunction(createPreviewCanonicalChartQueryUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.CompileCanonicalChartQueryUseCase)
    .toHigherOrderFunction(createCompileCanonicalChartQueryUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.CreateCanonicalChartUseCase)
    .toHigherOrderFunction(createCreateCanonicalChartUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.GetCanonicalChartUseCase)
    .toHigherOrderFunction(createGetCanonicalChartUseCase, [DI_SYMBOLS.CanonicalChartRepository]);
  chartsModule
    .bind(DI_SYMBOLS.RunSavedCanonicalChartUseCase)
    .toHigherOrderFunction(createRunSavedCanonicalChartUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.ListCanonicalChartsUseCase)
    .toHigherOrderFunction(createListCanonicalChartsUseCase, [DI_SYMBOLS.CanonicalChartRepository]);
  chartsModule
    .bind(DI_SYMBOLS.UpdateCanonicalChartUseCase)
    .toHigherOrderFunction(createUpdateCanonicalChartUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.ListCanonicalChartRevisionsUseCase)
    .toHigherOrderFunction(createListCanonicalChartRevisionsUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.RestoreCanonicalChartRevisionUseCase)
    .toHigherOrderFunction(createRestoreCanonicalChartRevisionUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.CancelCanonicalChartRunUseCase)
    .toHigherOrderFunction(createCancelCanonicalChartRunUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.SaveAsNewCanonicalChartUseCase)
    .toHigherOrderFunction(createSaveAsNewCanonicalChartUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.SaveChatChartPreviewUseCase)
    .toHigherOrderFunction(createSaveChatChartPreviewUseCase, [
      DI_SYMBOLS.CanonicalChartRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.ListChartCollectionsUseCase)
    .toHigherOrderFunction(createListChartCollectionsUseCase, [
      DI_SYMBOLS.ChartCollectionRepository,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.ChartCollectionUseCases)
    .toHigherOrderFunction(createChartCollectionUseCases, [DI_SYMBOLS.ChartCollectionRepository]);
  chartsModule
    .bind(DI_SYMBOLS.ListChartCollectionsController)
    .toHigherOrderFunction(createListChartCollectionsController, [
      DI_SYMBOLS.ListChartCollectionsUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.CreateChartCollectionController)
    .toHigherOrderFunction(createCreateChartCollectionController, [
      DI_SYMBOLS.ChartCollectionUseCases,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.UpdateChartCollectionController)
    .toHigherOrderFunction(createUpdateChartCollectionController, [
      DI_SYMBOLS.ChartCollectionUseCases,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.MoveChartCollectionController)
    .toHigherOrderFunction(createMoveChartCollectionController, [
      DI_SYMBOLS.ChartCollectionUseCases,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.ArchiveChartCollectionController)
    .toHigherOrderFunction(createArchiveChartCollectionController, [
      DI_SYMBOLS.ChartCollectionUseCases,
    ]);

  chartsModule
    .bind(DI_SYMBOLS.ListChartsController)
    .toHigherOrderFunction(createListChartsController, [DI_SYMBOLS.ListChartsUseCase]);
  chartsModule
    .bind(DI_SYMBOLS.SubscribeChartsController)
    .toHigherOrderFunction(createSubscribeChartsController, [DI_SYMBOLS.SubscribeChartsUseCase]);
  chartsModule
    .bind(DI_SYMBOLS.CreateChartController)
    .toHigherOrderFunction(createCreateChartController, [DI_SYMBOLS.CreateChartUseCase]);
  chartsModule
    .bind(DI_SYMBOLS.PatchChartController)
    .toHigherOrderFunction(createPatchChartController, [DI_SYMBOLS.PatchChartUseCase]);
  chartsModule
    .bind(DI_SYMBOLS.DeleteChartController)
    .toHigherOrderFunction(createDeleteChartController, [DI_SYMBOLS.DeleteChartUseCase]);
  chartsModule
    .bind(DI_SYMBOLS.SetChartDataFromCsvController)
    .toHigherOrderFunction(createSetChartDataFromCsvController, [
      DI_SYMBOLS.SetChartDataFromCsvUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.SuggestChartEncodingsController)
    .toHigherOrderFunction(createSuggestChartEncodingsController, [
      DI_SYMBOLS.SuggestChartEncodingsUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.PreviewCanonicalChartController)
    .toHigherOrderFunction(createPreviewCanonicalChartController, [
      DI_SYMBOLS.PreviewCanonicalChartUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.PreviewCanonicalChartQueryController)
    .toHigherOrderFunction(createPreviewCanonicalChartQueryController, [
      DI_SYMBOLS.PreviewCanonicalChartQueryUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.CompileCanonicalChartQueryController)
    .toHigherOrderFunction(createCompileCanonicalChartQueryController, [
      DI_SYMBOLS.CompileCanonicalChartQueryUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.CreateCanonicalChartController)
    .toHigherOrderFunction(createCreateCanonicalChartController, [
      DI_SYMBOLS.CreateCanonicalChartUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.GetCanonicalChartController)
    .toHigherOrderFunction(createGetCanonicalChartController, [
      DI_SYMBOLS.GetCanonicalChartUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.RunSavedCanonicalChartController)
    .toHigherOrderFunction(createRunSavedCanonicalChartController, [
      DI_SYMBOLS.RunSavedCanonicalChartUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.ListCanonicalChartsController)
    .toHigherOrderFunction(createListCanonicalChartsController, [
      DI_SYMBOLS.ListCanonicalChartsUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.UpdateCanonicalChartController)
    .toHigherOrderFunction(createUpdateCanonicalChartController, [
      DI_SYMBOLS.UpdateCanonicalChartUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.ListCanonicalChartRevisionsController)
    .toHigherOrderFunction(createListCanonicalChartRevisionsController, [
      DI_SYMBOLS.ListCanonicalChartRevisionsUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.RestoreCanonicalChartRevisionController)
    .toHigherOrderFunction(createRestoreCanonicalChartRevisionController, [
      DI_SYMBOLS.RestoreCanonicalChartRevisionUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.CancelCanonicalChartRunController)
    .toHigherOrderFunction(createCancelCanonicalChartRunController, [
      DI_SYMBOLS.CancelCanonicalChartRunUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.SaveAsNewCanonicalChartController)
    .toHigherOrderFunction(createSaveAsNewCanonicalChartController, [
      DI_SYMBOLS.SaveAsNewCanonicalChartUseCase,
    ]);
  chartsModule
    .bind(DI_SYMBOLS.SaveChatChartPreviewController)
    .toHigherOrderFunction(createSaveChatChartPreviewController, [
      DI_SYMBOLS.SaveChatChartPreviewUseCase,
    ]);

  return chartsModule;
}
