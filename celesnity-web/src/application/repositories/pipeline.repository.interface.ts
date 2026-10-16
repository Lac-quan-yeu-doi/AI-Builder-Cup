import type {
  ListPipelinesQuery,
  NodePreview,
  Pipeline,
  PipelineDraft,
  PipelineEdge,
  PipelineGraph,
  PipelineCompilation,
  GeneratedPipelineScript,
  PipelineExecutionAccepted,
  PipelinePage,
  PipelineValidationResult,
  PreviewNodeInput,
  SavePipelineInput,
} from '@/src/entities/models/pipeline';

export interface PipelineRepository {
  list(query: ListPipelinesQuery): Promise<PipelinePage>;
  get(pipelineId: string): Promise<Pipeline>;
  create(draft: PipelineDraft): Promise<Pipeline>;
  save(pipelineId: string, input: SavePipelineInput): Promise<Pipeline>;
  clone(pipelineId: string, name: string): Promise<Pipeline>;
  archive(pipelineId: string): Promise<void>;
  validateGraph(graph: PipelineGraph): Promise<PipelineValidationResult>;
  validateEdge(graph: PipelineGraph, edge: PipelineEdge): Promise<PipelineValidationResult>;
  previewNode(pipelineId: string, nodeId: string, input: PreviewNodeInput): Promise<NodePreview>;
  compile(pipelineId: string, version: number): Promise<PipelineCompilation>;
  generatedScript(pipelineId: string, version: number): Promise<GeneratedPipelineScript>;
  run(pipelineId: string, version: number): Promise<PipelineExecutionAccepted>;
}
