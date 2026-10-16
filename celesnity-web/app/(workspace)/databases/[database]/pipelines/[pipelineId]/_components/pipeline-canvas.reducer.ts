import type {
  PipelineEdge,
  PipelineGraph,
  PipelineNode,
  PipelinePosition,
  PipelineValidationIssue,
} from '@/src/entities/models/pipeline';
import {
  addEdge,
  addNode,
  graphsEqual,
  moveNode,
  removeEdge,
  removeNode,
  updateNodeConfig,
} from '@/src/entities/models/pipeline-graph';
import type { PipelineViewModel } from '@/src/interface-adapters/presenters/pipeline.presenter';

/**
 * The canvas state and its transitions, kept free of React and React Flow so
 * every editing rule can be exercised without rendering a graph.
 */
export interface CanvasBaseline {
  readonly name: string;
  readonly description: string;
  readonly graph: PipelineGraph;
}

export interface CanvasState extends CanvasBaseline {
  readonly pipelineId: string;
  readonly version: number;
  readonly baseline: CanvasBaseline;
  readonly selectedNodeId?: string;
  readonly issues: readonly PipelineValidationIssue[];
}

export type CanvasAction =
  | { readonly type: 'metadata-changed'; readonly name?: string; readonly description?: string }
  | { readonly type: 'node-added'; readonly node: PipelineNode }
  | {
      readonly type: 'node-moved';
      readonly nodeId: string;
      readonly position: PipelinePosition;
    }
  | { readonly type: 'node-removed'; readonly nodeId: string }
  | {
      readonly type: 'node-config-changed';
      readonly nodeId: string;
      readonly change: Readonly<Record<string, unknown>>;
    }
  | { readonly type: 'edge-added'; readonly edge: PipelineEdge }
  | { readonly type: 'edge-removed'; readonly edgeId: string }
  | { readonly type: 'node-selected'; readonly nodeId?: string }
  | { readonly type: 'validated'; readonly issues: readonly PipelineValidationIssue[] }
  | { readonly type: 'saved'; readonly pipeline: PipelineViewModel };

export function canvasStateFromPipeline(pipeline: PipelineViewModel): CanvasState {
  const graph = normalizeLegacySourceModes(pipeline.graph);
  const baseline: CanvasBaseline = {
    name: pipeline.name,
    description: pipeline.description ?? '',
    graph,
  };

  return {
    pipelineId: pipeline.id,
    version: pipeline.version,
    ...baseline,
    baseline,
    issues: [],
  };
}

function normalizeLegacySourceModes(graph: PipelineGraph): PipelineGraph {
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    if (node.definitionType !== 'POSTGRES_SOURCE' || node.config.sourceMode !== 'CATALOG') {
      return node;
    }
    changed = true;
    return { ...node, config: { ...node.config, sourceMode: 'DIRECT' } };
  });
  return changed ? { ...graph, nodes } : graph;
}

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case 'metadata-changed':
      return {
        ...state,
        ...(action.name === undefined ? {} : { name: action.name }),
        ...(action.description === undefined ? {} : { description: action.description }),
      };
    case 'node-added':
      return withGraph(state, addNode(state.graph, action.node), action.node.id);
    case 'node-moved':
      return withGraph(state, moveNode(state.graph, action.nodeId, action.position));
    case 'node-removed': {
      const next = withGraph(state, removeNode(state.graph, action.nodeId));
      return state.selectedNodeId === action.nodeId ? withoutSelection(next) : next;
    }
    case 'node-config-changed':
      return withGraph(state, updateNodeConfig(state.graph, action.nodeId, action.change));
    case 'edge-added':
      return withGraph(state, addEdge(state.graph, action.edge));
    case 'edge-removed':
      return withGraph(state, removeEdge(state.graph, action.edgeId));
    case 'node-selected':
      return action.nodeId === undefined
        ? withoutSelection(state)
        : { ...state, selectedNodeId: action.nodeId };
    case 'validated':
      return { ...state, issues: action.issues };
    case 'saved':
      return {
        ...canvasStateFromPipeline(action.pipeline),
        ...(state.selectedNodeId === undefined ? {} : { selectedNodeId: state.selectedNodeId }),
      };
  }
}

export function isCanvasDirty(state: CanvasState): boolean {
  return (
    state.name !== state.baseline.name ||
    state.description !== state.baseline.description ||
    !graphsEqual(state.graph, state.baseline.graph)
  );
}

export function selectedNode(state: CanvasState): PipelineNode | undefined {
  return state.graph.nodes.find((node) => node.id === state.selectedNodeId);
}

/**
 * Any structural edit invalidates the last validation run, so the issues are
 * dropped rather than left pointing at a graph that no longer exists.
 */
function withGraph(state: CanvasState, graph: PipelineGraph, selectedNodeId?: string): CanvasState {
  if (graph === state.graph) {
    return state;
  }
  return {
    ...state,
    graph,
    issues: [],
    ...(selectedNodeId === undefined ? {} : { selectedNodeId }),
  };
}

/** Rebuilt field by field because `selectedNodeId` must be absent, not undefined. */
function withoutSelection(state: CanvasState): CanvasState {
  if (state.selectedNodeId === undefined) {
    return state;
  }
  return {
    pipelineId: state.pipelineId,
    version: state.version,
    name: state.name,
    description: state.description,
    graph: state.graph,
    baseline: state.baseline,
    issues: state.issues,
  };
}
