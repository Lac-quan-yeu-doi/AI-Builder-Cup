'use client';

import {
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  type EdgeChange,
  type FitViewOptions,
  type NodeChange,
} from '@xyflow/react';
// React Flow ships its own stylesheet for the viewport, handles, and edge
// paths. It is imported here — inside the only client component that renders a
// flow — rather than in global CSS, so the rest of the workspace stays
// Tailwind-only.
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useState } from 'react';

import type { PipelineGraph, PipelinePosition } from '@/src/entities/models/pipeline';
import type { NodeDefinitionSummaryViewModel } from '@/src/interface-adapters/presenters/node-definition.presenter';

import {
  committedMoves,
  removedNodeIds,
  toFlowNodes,
  type NodeValidationCounts,
} from './flow-nodes';
import { PipelineNodeCard, type PipelineFlowNode } from './pipeline-node-card';

export const NODE_DRAG_MIME = 'application/x-celesnity-node';

const nodeTypes = { pipeline: PipelineNodeCard };

/**
 * `fitView` alone climbs to `maxZoom` (2) on a small graph, which renders every
 * card at twice its CSS size. Capping the fit at 1 keeps a two-node pipeline at
 * its true size; the user can still zoom in by hand.
 */
const fitViewOptions: FitViewOptions = { maxZoom: 1, padding: 0.25 };

/** Edges carry the direction of the flow, so every one gets an arrow head. */
const defaultEdgeOptions: DefaultEdgeOptions = {
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: 'var(--muted-foreground)',
  },
  style: { stroke: 'var(--muted-foreground)', strokeWidth: 1.5 },
};

interface FlowCanvasProps {
  readonly graph: PipelineGraph;
  /** Palette entries keyed by `resourceId`. */
  readonly definitions: ReadonlyMap<string, NodeDefinitionSummaryViewModel>;
  readonly issueCounts: ReadonlyMap<string, NodeValidationCounts>;
  readonly selectedNodeId?: string;
  readonly disabled: boolean;
  readonly onMoveNode: (nodeId: string, position: PipelinePosition) => void;
  readonly onRemoveNode: (nodeId: string) => void;
  readonly onRemoveEdge: (edgeId: string) => void;
  readonly onSelectNode: (nodeId?: string) => void;
  readonly onConnectPorts: (connection: Connection) => void;
  readonly onDropDefinition: (resourceId: string, position: PipelinePosition) => void;
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasSurface {...props} />
    </ReactFlowProvider>
  );
}

function FlowCanvasSurface({
  graph,
  definitions,
  issueCounts,
  selectedNodeId,
  disabled,
  onMoveNode,
  onRemoveNode,
  onRemoveEdge,
  onSelectNode,
  onConnectPorts,
  onDropDefinition,
}: FlowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  /**
   * React Flow owns the node array while the pointer is down: it applies its own
   * changes (position, measurements, selection) to objects it already knows, so
   * a drag never round-trips through the domain graph. The graph is projected in
   * again — reusing the objects React Flow measured — whenever it changes from
   * the outside.
   */
  const [nodes, setNodes] = useState<PipelineFlowNode[]>(() =>
    toFlowNodes(graph, definitions, issueCounts, selectedNodeId),
  );
  const [projected, setProjected] = useState({ graph, definitions, issueCounts, selectedNodeId });

  if (
    projected.graph !== graph ||
    projected.definitions !== definitions ||
    projected.issueCounts !== issueCounts ||
    projected.selectedNodeId !== selectedNodeId
  ) {
    setProjected({ graph, definitions, issueCounts, selectedNodeId });
    setNodes((current) => toFlowNodes(graph, definitions, issueCounts, selectedNodeId, current));
  }

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        sourceHandle: edge.sourcePortId,
        target: edge.targetNodeId,
        targetHandle: edge.targetPortId,
      })),
    [graph.edges],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<PipelineFlowNode>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));

      for (const move of committedMoves(changes)) {
        onMoveNode(move.id, move.position);
      }
      for (const nodeId of removedNodeIds(changes)) {
        onRemoveNode(nodeId);
      }
    },
    [onMoveNode, onRemoveNode],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove') {
          onRemoveEdge(change.id);
        }
      }
    },
    [onRemoveEdge],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const resourceId = event.dataTransfer.getData(NODE_DRAG_MIME);
      if (!resourceId || disabled) {
        return;
      }
      onDropDefinition(resourceId, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [disabled, onDropDefinition, screenToFlowPosition],
  );

  return (
    <div
      className="h-full min-h-[560px] min-w-0 bg-muted"
      role="application"
      aria-label="Pipeline flow canvas"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        elementsSelectable={!disabled}
        fitView
        fitViewOptions={fitViewOptions}
        defaultEdgeOptions={defaultEdgeOptions}
        proOptions={{ hideAttribution: false }}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnectPorts}
        onNodeClick={(_event, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(undefined)}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
