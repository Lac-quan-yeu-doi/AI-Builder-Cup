import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';
import type { PipelineNode } from '@domain/pipeline-authoring/models/pipeline';

export interface NodeCompileContext {
  readonly node: PipelineNode;
  readonly definition: NodeDefinition;
  readonly inputs: ReadonlyMap<string, string>;
  variableForOutput(portId: string): string;
  requireInput(portId: string): string;
}

export interface CompiledNodeFragment {
  readonly lines: readonly string[];
  readonly outputs: ReadonlyMap<string, string>;
}

export interface PipelineNodeEmitter<TConfig = unknown> {
  readonly definitionType: string;
  parseConfig(value: Readonly<Record<string, unknown>>, nodeId: string): TConfig;
  emit(context: NodeCompileContext, config: TConfig): CompiledNodeFragment;
}
