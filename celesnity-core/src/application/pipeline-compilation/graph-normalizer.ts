import { createHash } from 'node:crypto';

import type {
  PipelineEdge,
  PipelineGraph,
  PipelineNode,
} from '@domain/pipeline-authoring/models/pipeline';

export interface NormalizedPipelineGraph extends PipelineGraph {
  readonly nodes: readonly PipelineNode[];
  readonly edges: readonly PipelineEdge[];
}

export function normalizeGraph(graph: PipelineGraph): NormalizedPipelineGraph {
  return {
    nodes: graph.nodes
      .map((node) => ({
        ...node,
        definitionType: node.definitionType.trim().toUpperCase(),
        config: normalizeRecord(node.config),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...graph.edges].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right))),
  };
}

export function semanticGraphHash(graph: PipelineGraph): string {
  const normalized = normalizeGraph(graph);
  const semantic = {
    nodes: normalized.nodes.map((node) => ({
      id: node.id,
      definitionType: node.definitionType,
      ...(node.resourceId === undefined ? {} : { resourceId: node.resourceId }),
      config: node.config,
    })),
    edges: normalized.edges,
  };
  return createHash('sha256').update(JSON.stringify(semantic)).digest('hex');
}

function normalizeRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeValue(value[key])]),
  );
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object' && value !== null) {
    return normalizeRecord(value as Readonly<Record<string, unknown>>);
  }
  return value;
}

function edgeKey(edge: PipelineEdge): string {
  return [edge.sourceNodeId, edge.sourcePortId, edge.targetNodeId, edge.targetPortId].join(
    '\u0000',
  );
}
