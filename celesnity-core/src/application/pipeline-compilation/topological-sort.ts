import type { PipelineGraph, PipelineNode } from '@domain/pipeline-authoring/models/pipeline';
import { PipelineCompilationError } from '@domain/pipeline-compilation/errors/pipeline-compilation.error';

export function topologicalSort(graph: PipelineGraph): readonly PipelineNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const downstream = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of graph.edges) {
    if (!byId.has(edge.sourceNodeId) || !byId.has(edge.targetNodeId)) {
      throw PipelineCompilationError.issue(
        'PIPELINE_NOT_COMPILABLE',
        'The graph contains an edge referencing a missing node.',
      );
    }
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
    downstream.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  const ready = graph.nodes.filter((node) => indegree.get(node.id) === 0).sort(compareNodeId);
  const ordered: PipelineNode[] = [];

  while (ready.length > 0) {
    const node = ready.shift();
    if (node === undefined) break;
    ordered.push(node);
    for (const targetId of downstream.get(node.id) ?? []) {
      const remaining = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, remaining);
      if (remaining === 0) {
        const target = byId.get(targetId);
        if (target !== undefined) {
          ready.push(target);
          ready.sort(compareNodeId);
        }
      }
    }
  }

  if (ordered.length !== graph.nodes.length) {
    throw PipelineCompilationError.issue(
      'PIPELINE_NOT_COMPILABLE',
      'The pipeline graph contains a cycle.',
    );
  }
  return ordered;
}

function compareNodeId(left: PipelineNode, right: PipelineNode): number {
  return left.id.localeCompare(right.id);
}
