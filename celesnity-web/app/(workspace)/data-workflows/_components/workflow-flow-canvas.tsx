'use client';

import {
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GitBranchIcon, GitForkIcon, MergeIcon, PlayIcon, WorkflowIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { cn } from '@/app/_components/ui/utils';
import type {
  DataWorkflowCanvasGraph,
  DataWorkflowCanvasNode,
} from '@/src/entities/models/data-workflow-graph';
import { conditionRouteLabel } from './workflow-condition-label';

interface Props {
  readonly graph: DataWorkflowCanvasGraph;
  readonly selectedNodeId?: string;
  readonly selectedEdgeId?: string;
  readonly pipelineNames?: ReadonlyMap<string, string>;
  readonly disabled?: boolean;
  readonly onConnect: (connection: Connection) => void;
  readonly onMove: (nodeId: string, position: { readonly x: number; readonly y: number }) => void;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onSelectEdge: (edgeId: string) => void;
  readonly onClearSelection: () => void;
  readonly onDeleteNode: (nodeId: string) => void;
  readonly onDeleteEdge: (edgeId: string) => void;
}

interface WorkflowNodeData extends Record<string, unknown> {
  readonly workflowNode: DataWorkflowCanvasNode;
  readonly pipelineName?: string;
}

type WorkflowFlowNode = Node<WorkflowNodeData, 'workflow'>;

const nodeTypes = { workflow: WorkflowFlowNodeCard };
const emptyPipelineNames = new Map<string, string>();

export function WorkflowFlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowFlowSurface {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowFlowSurface({
  graph,
  selectedNodeId,
  selectedEdgeId,
  pipelineNames = emptyPipelineNames,
  disabled = false,
  onConnect,
  onMove,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  onDeleteNode,
  onDeleteEdge,
}: Props) {
  const [nodes, setNodes] = useState<WorkflowFlowNode[]>(() =>
    toWorkflowFlowNodes(graph.nodes, selectedNodeId, pipelineNames),
  );
  const [projected, setProjected] = useState({ graph, selectedNodeId, pipelineNames });

  if (
    projected.graph !== graph ||
    projected.selectedNodeId !== selectedNodeId ||
    projected.pipelineNames !== pipelineNames
  ) {
    setProjected({ graph, selectedNodeId, pipelineNames });
    setNodes((current) => toWorkflowFlowNodes(graph.nodes, selectedNodeId, pipelineNames, current));
  }

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));
      for (const change of changes) {
        if (change.type === 'remove') {
          onDeleteNode(change.id);
        }
        if (change.type === 'position' && change.position && !change.dragging) {
          onMove(change.id, change.position);
        }
      }
    },
    [onDeleteNode, onMove],
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove') onDeleteEdge(change.id);
      }
    },
    [onDeleteEdge],
  );
  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        sourceHandle: edge.sourcePortId,
        target: edge.targetNodeId,
        targetHandle: edge.targetPortId,
        selected: edge.id === selectedEdgeId,
        deletable: !disabled,
        markerEnd: { type: MarkerType.ArrowClosed },
        ...(graph.nodes.some(
          (node) => node.id === edge.sourceNodeId && node.type === 'PIPELINE_OUTCOME',
        )
          ? { label: edge.sourcePortId === 'success' ? 'Success' : 'Error' }
          : {}),
      })),
    [disabled, graph.edges, graph.nodes, selectedEdgeId],
  );
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const source = graph.nodes.find((node) => node.id === connection.source);
      const target = graph.nodes.find((node) => node.id === connection.target);
      if (source === undefined || target === undefined) return false;
      return source.type !== 'PIPELINE_OUTCOME' || target.type === 'PIPELINE';
    },
    [graph.nodes],
  );

  return (
    <div
      className="h-full min-h-[480px] min-w-0 rounded-lg border border-border bg-muted"
      role="application"
      aria-label="Data workflow canvas"
    >
      <ReactFlow<WorkflowFlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.24 }}
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        elementsSelectable={!disabled}
        deleteKeyCode={['Backspace', 'Delete']}
        isValidConnection={isValidConnection}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_event, node) => onSelectNode(node.id)}
        onEdgeClick={(_event, edge) => onSelectEdge(edge.id)}
        onPaneClick={onClearSelection}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function WorkflowFlowNodeCard({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const node = data.workflowNode;
  const metadata = nodeSummary(node);
  const Icon = {
    TRIGGER: PlayIcon,
    PIPELINE: WorkflowIcon,
    PIPELINE_OUTCOME: GitBranchIcon,
    PARALLEL_SPLIT: GitForkIcon,
    CONDITIONAL_SPLIT: GitBranchIcon,
    JOIN: MergeIcon,
  }[node.type];
  const outputHandles = node.type === 'PIPELINE_OUTCOME' ? ['success', 'error'] : ['out'];

  return (
    <div
      className={cn(
        'min-w-44 rounded-lg border bg-card px-3 py-2.5 shadow-sm transition-shadow',
        selected ? 'border-primary shadow-md ring-1 ring-primary/20' : 'border-border',
      )}
    >
      {node.type === 'TRIGGER' ? null : (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          aria-label={`${node.type === 'PIPELINE' ? 'Pipeline' : node.type.replaceAll('_', ' ').toLowerCase()} input`}
        />
      )}
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        <span
          className={cn(
            'text-xs font-semibold tracking-wide text-foreground',
            node.type !== 'PIPELINE' && 'uppercase',
          )}
        >
          {node.type === 'PIPELINE'
            ? (data.pipelineName ?? (node.pipelineId ? 'Unavailable pipeline' : 'Choose pipeline'))
            : node.type.replaceAll('_', ' ')}
        </span>
      </div>
      <p className="mt-1 max-w-48 text-xs text-muted-foreground">{metadata}</p>
      {node.type === 'PIPELINE' && !data.pipelineName && node.pipelineId ? (
        <p className="text-xs text-muted-foreground">{node.pipelineId.slice(0, 8)}</p>
      ) : null}
      {node.type === 'PIPELINE_OUTCOME' ? (
        <div className="mt-2 flex flex-col gap-1 pr-3 text-xs">
          <span>Success</span>
          <span>Error</span>
        </div>
      ) : null}
      {node.type === 'CONDITIONAL_SPLIT' ? (
        <div className="mt-2 grid gap-1.5">
          {node.branches.map((branch) => {
            const label = conditionRouteLabel(node, branch.id);
            return (
              <div
                key={branch.id}
                className="relative min-w-52 rounded-md border border-border bg-background py-1.5 pr-5 pl-2 text-micro text-foreground"
                title={label}
              >
                <span className="block max-w-64 break-words">{label}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={branch.id}
                  style={{ top: '50%', right: -7 }}
                  aria-label={`Connect ${label}`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        outputHandles.map((id, index) => (
          <Handle
            type="source"
            position={Position.Right}
            id={id}
            key={id}
            style={{ top: `${((index + 1) / (outputHandles.length + 1)) * 100}%` }}
            aria-label={
              node.type === 'PIPELINE_OUTCOME'
                ? `${id === 'success' ? 'Success' : 'Error'} output`
                : `Output ${id}`
            }
          />
        ))
      )}
    </div>
  );
}

function nodeSummary(node: DataWorkflowCanvasNode): string {
  switch (node.type) {
    case 'TRIGGER':
      return triggerSummary(node.trigger.type);
    case 'PIPELINE':
      return `Version ${node.versionNumber}`;
    case 'PIPELINE_OUTCOME':
      return 'Route selected pipeline results';
    case 'CONDITIONAL_SPLIT':
      return `${node.mode === 'FIRST_MATCH' ? 'First matching' : 'All matching'} branch${node.branches.length === 1 ? '' : 'es'}`;
    case 'PARALLEL_SPLIT':
      return 'Run every connected branch';
    case 'JOIN':
      return 'Wait for selected inputs';
  }
}

function triggerSummary(
  type: Extract<DataWorkflowCanvasNode, { type: 'TRIGGER' }>['trigger']['type'],
) {
  switch (type) {
    case 'MANUAL':
      return 'Starts when run manually';
    case 'CALENDAR':
      return 'Calendar schedule';
    case 'INTERVAL':
      return 'Repeating interval';
    case 'WATCH_SOURCE':
      return 'Watch source';
  }
}

function toWorkflowFlowNodes(
  workflowNodes: readonly DataWorkflowCanvasNode[],
  selectedNodeId: string | undefined,
  pipelineNames: ReadonlyMap<string, string>,
  previous: readonly WorkflowFlowNode[] = [],
): WorkflowFlowNode[] {
  const previousById = new Map(previous.map((node) => [node.id, node]));
  return workflowNodes.map((workflowNode) => {
    const existing = previousById.get(workflowNode.id);
    const selected = workflowNode.id === selectedNodeId;
    const pipelineName =
      workflowNode.type === 'PIPELINE' ? pipelineNames.get(workflowNode.pipelineId) : undefined;
    if (
      existing &&
      existing.position.x === workflowNode.position.x &&
      existing.position.y === workflowNode.position.y &&
      existing.selected === selected &&
      existing.data.workflowNode === workflowNode &&
      existing.data.pipelineName === pipelineName
    ) {
      return existing;
    }
    return {
      ...existing,
      id: workflowNode.id,
      type: 'workflow',
      position: workflowNode.position,
      selected,
      deletable: workflowNode.type !== 'TRIGGER',
      data: { workflowNode, ...(pipelineName ? { pipelineName } : {}) },
    };
  });
}
