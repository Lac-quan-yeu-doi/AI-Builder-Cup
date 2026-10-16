'use client';

import { getInjection } from '@/di/container';

import { PipelineCanvasScreen } from './pipeline-canvas-screen';

const controllers = Object.freeze({
  get: getInjection('GetPipelineController'),
  getScript: getInjection('GetPipelineScriptController'),
  save: getInjection('SavePipelineController'),
  validateGraph: getInjection('ValidatePipelineGraphController'),
  validateEdge: getInjection('ValidatePipelineEdgeController'),
  preview: getInjection('PreviewPipelineNodeController'),
  run: getInjection('RunPipelineController'),
  loadPalette: getInjection('LoadNodePaletteController'),
  getDefinition: getInjection('GetNodeDefinitionController'),
  listNamespaces: getInjection('ListNamespacesController'),
  listTables: getInjection('ListTablesController'),
  metadataCrawler: getInjection('MetadataCrawlerController'),
  sourceMetadata: getInjection('SourceMetadataController'),
});

export function PipelineCanvasFeature({
  databaseName,
  pipelineId,
}: {
  readonly databaseName: string;
  readonly pipelineId: string;
}) {
  return (
    <PipelineCanvasScreen
      controllers={controllers}
      databaseName={databaseName}
      pipelineId={pipelineId}
    />
  );
}
