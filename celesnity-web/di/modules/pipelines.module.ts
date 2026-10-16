import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createGetNodeDefinitionUseCase } from '@/src/application/use-cases/node-catalog/get-node-definition.use-case';
import { createLoadNodePaletteUseCase } from '@/src/application/use-cases/node-catalog/load-node-palette.use-case';
import { createArchivePipelineUseCase } from '@/src/application/use-cases/pipelines/archive-pipeline.use-case';
import { createClonePipelineUseCase } from '@/src/application/use-cases/pipelines/clone-pipeline.use-case';
import { createCreatePipelineUseCase } from '@/src/application/use-cases/pipelines/create-pipeline.use-case';
import { createGetPipelineUseCase } from '@/src/application/use-cases/pipelines/get-pipeline.use-case';
import { createGetOrCompilePipelineScriptUseCase } from '@/src/application/use-cases/pipelines/get-or-compile-pipeline-script.use-case';
import { createListPipelinesUseCase } from '@/src/application/use-cases/pipelines/list-pipelines.use-case';
import { createPreviewPipelineNodeUseCase } from '@/src/application/use-cases/pipelines/preview-pipeline-node.use-case';
import { createRunPipelineUseCase } from '@/src/application/use-cases/pipelines/run-pipeline.use-case';
import { createSavePipelineUseCase } from '@/src/application/use-cases/pipelines/save-pipeline.use-case';
import { createValidatePipelineEdgeUseCase } from '@/src/application/use-cases/pipelines/validate-pipeline-edge.use-case';
import { createValidatePipelineGraphUseCase } from '@/src/application/use-cases/pipelines/validate-pipeline-graph.use-case';
import { CoreApiNodeCatalogRepository } from '@/src/infrastructure/repositories/core-api-node-catalog.repository';
import { CoreApiPipelineRepository } from '@/src/infrastructure/repositories/core-api-pipeline.repository';
import { createGetNodeDefinitionController } from '@/src/interface-adapters/controllers/node-catalog/get-node-definition.controller';
import { createLoadNodePaletteController } from '@/src/interface-adapters/controllers/node-catalog/load-node-palette.controller';
import { createArchivePipelineController } from '@/src/interface-adapters/controllers/pipelines/archive-pipeline.controller';
import { createClonePipelineController } from '@/src/interface-adapters/controllers/pipelines/clone-pipeline.controller';
import { createCreatePipelineController } from '@/src/interface-adapters/controllers/pipelines/create-pipeline.controller';
import { createGetPipelineController } from '@/src/interface-adapters/controllers/pipelines/get-pipeline.controller';
import { createGetPipelineScriptController } from '@/src/interface-adapters/controllers/pipelines/get-pipeline-script.controller';
import { createListPipelinesController } from '@/src/interface-adapters/controllers/pipelines/list-pipelines.controller';
import { createPreviewPipelineNodeController } from '@/src/interface-adapters/controllers/pipelines/preview-pipeline-node.controller';
import { createRunPipelineController } from '@/src/interface-adapters/controllers/pipelines/run-pipeline.controller';
import { createSavePipelineController } from '@/src/interface-adapters/controllers/pipelines/save-pipeline.controller';
import { createValidatePipelineEdgeController } from '@/src/interface-adapters/controllers/pipelines/validate-pipeline-edge.controller';
import { createValidatePipelineGraphController } from '@/src/interface-adapters/controllers/pipelines/validate-pipeline-graph.controller';

export function createPipelinesModule() {
  const pipelinesModule = createTypedModule();

  pipelinesModule
    .bind(DI_SYMBOLS.PipelineRepository)
    .toClass(CoreApiPipelineRepository, [DI_SYMBOLS.CoreApiClient]);
  pipelinesModule
    .bind(DI_SYMBOLS.NodeCatalogRepository)
    .toClass(CoreApiNodeCatalogRepository, [DI_SYMBOLS.CoreApiClient]);

  pipelinesModule
    .bind(DI_SYMBOLS.ListPipelinesUseCase)
    .toHigherOrderFunction(createListPipelinesUseCase, [DI_SYMBOLS.PipelineRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.GetPipelineUseCase)
    .toHigherOrderFunction(createGetPipelineUseCase, [DI_SYMBOLS.PipelineRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.GetOrCompilePipelineScriptUseCase)
    .toHigherOrderFunction(createGetOrCompilePipelineScriptUseCase, [
      DI_SYMBOLS.PipelineRepository,
    ]);
  pipelinesModule
    .bind(DI_SYMBOLS.CreatePipelineUseCase)
    .toHigherOrderFunction(createCreatePipelineUseCase, [DI_SYMBOLS.PipelineRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.SavePipelineUseCase)
    .toHigherOrderFunction(createSavePipelineUseCase, [DI_SYMBOLS.PipelineRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.ClonePipelineUseCase)
    .toHigherOrderFunction(createClonePipelineUseCase, [DI_SYMBOLS.PipelineRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.ArchivePipelineUseCase)
    .toHigherOrderFunction(createArchivePipelineUseCase, [DI_SYMBOLS.PipelineRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.ValidatePipelineGraphUseCase)
    .toHigherOrderFunction(createValidatePipelineGraphUseCase, [DI_SYMBOLS.PipelineRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.ValidatePipelineEdgeUseCase)
    .toHigherOrderFunction(createValidatePipelineEdgeUseCase, [DI_SYMBOLS.PipelineRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.PreviewPipelineNodeUseCase)
    .toHigherOrderFunction(createPreviewPipelineNodeUseCase, [DI_SYMBOLS.PipelineRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.RunPipelineUseCase)
    .toHigherOrderFunction(createRunPipelineUseCase, [DI_SYMBOLS.PipelineRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.LoadNodePaletteUseCase)
    .toHigherOrderFunction(createLoadNodePaletteUseCase, [DI_SYMBOLS.NodeCatalogRepository]);
  pipelinesModule
    .bind(DI_SYMBOLS.GetNodeDefinitionUseCase)
    .toHigherOrderFunction(createGetNodeDefinitionUseCase, [DI_SYMBOLS.NodeCatalogRepository]);

  pipelinesModule
    .bind(DI_SYMBOLS.ListPipelinesController)
    .toHigherOrderFunction(createListPipelinesController, [DI_SYMBOLS.ListPipelinesUseCase]);
  pipelinesModule
    .bind(DI_SYMBOLS.GetPipelineController)
    .toHigherOrderFunction(createGetPipelineController, [DI_SYMBOLS.GetPipelineUseCase]);
  pipelinesModule
    .bind(DI_SYMBOLS.GetPipelineScriptController)
    .toHigherOrderFunction(createGetPipelineScriptController, [
      DI_SYMBOLS.GetOrCompilePipelineScriptUseCase,
    ]);
  pipelinesModule
    .bind(DI_SYMBOLS.CreatePipelineController)
    .toHigherOrderFunction(createCreatePipelineController, [DI_SYMBOLS.CreatePipelineUseCase]);
  pipelinesModule
    .bind(DI_SYMBOLS.SavePipelineController)
    .toHigherOrderFunction(createSavePipelineController, [DI_SYMBOLS.SavePipelineUseCase]);
  pipelinesModule
    .bind(DI_SYMBOLS.ClonePipelineController)
    .toHigherOrderFunction(createClonePipelineController, [DI_SYMBOLS.ClonePipelineUseCase]);
  pipelinesModule
    .bind(DI_SYMBOLS.ArchivePipelineController)
    .toHigherOrderFunction(createArchivePipelineController, [DI_SYMBOLS.ArchivePipelineUseCase]);
  pipelinesModule
    .bind(DI_SYMBOLS.ValidatePipelineGraphController)
    .toHigherOrderFunction(createValidatePipelineGraphController, [
      DI_SYMBOLS.ValidatePipelineGraphUseCase,
    ]);
  pipelinesModule
    .bind(DI_SYMBOLS.ValidatePipelineEdgeController)
    .toHigherOrderFunction(createValidatePipelineEdgeController, [
      DI_SYMBOLS.ValidatePipelineEdgeUseCase,
    ]);
  pipelinesModule
    .bind(DI_SYMBOLS.PreviewPipelineNodeController)
    .toHigherOrderFunction(createPreviewPipelineNodeController, [
      DI_SYMBOLS.PreviewPipelineNodeUseCase,
    ]);
  pipelinesModule
    .bind(DI_SYMBOLS.RunPipelineController)
    .toHigherOrderFunction(createRunPipelineController, [DI_SYMBOLS.RunPipelineUseCase]);
  pipelinesModule
    .bind(DI_SYMBOLS.LoadNodePaletteController)
    .toHigherOrderFunction(createLoadNodePaletteController, [DI_SYMBOLS.LoadNodePaletteUseCase]);
  pipelinesModule
    .bind(DI_SYMBOLS.GetNodeDefinitionController)
    .toHigherOrderFunction(createGetNodeDefinitionController, [
      DI_SYMBOLS.GetNodeDefinitionUseCase,
    ]);

  return pipelinesModule;
}
