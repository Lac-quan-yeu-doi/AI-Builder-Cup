'use client';

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Maximize2Icon,
  Minimize2Icon,
  NetworkIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/app/_components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/app/_components/ui/native-select';
import { SearchField } from '@/app/_components/ui/search-field';
import type { PlantModelDraft } from '@/src/entities/models/plant-model';
import { buildPlantTopologyNodeDisplays, type PlantNodeDisplayField } from './plant-node-display';

type FocusDirection = 'all' | 'upstream' | 'downstream';
type OverviewNodeData = {
  readonly label: string;
  readonly type: string;
  readonly fields: readonly PlantNodeDisplayField[];
  readonly highlighted: boolean;
};
type OverviewNode = Node<OverviewNodeData, 'overview'>;

const overviewNodeTypes = { overview: OverviewNodeCard };
const fitViewOptions = { maxZoom: 1, minZoom: 0.65, padding: 0.2 } as const;

export function PlantTopologyOverview({ draft }: { readonly draft: PlantModelDraft }) {
  if (draft.nodes.length === 0) {
    return (
      <p className="grid min-h-72 place-items-center text-sm text-muted-foreground">
        No nodes configured.
      </p>
    );
  }

  return (
    <ReactFlowProvider>
      <PlantTopologyCanvas draft={draft} />
    </ReactFlowProvider>
  );
}

function PlantTopologyCanvas({ draft }: { readonly draft: PlantModelDraft }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const initialViewApplied = useRef(false);
  const { fitView, setCenter } = useReactFlow<OverviewNode, Edge>();
  const nodesInitialized = useNodesInitialized();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [focus, setFocus] = useState<FocusDirection>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const nodeDetails = useMemo(
    () =>
      buildPlantTopologyNodeDisplays(draft, {
        trueValue: 'Yes',
        falseValue: 'No',
        liveValue: 'Live catalog value',
        notSet: 'Not set',
      }),
    [draft],
  );

  const statusOptions = useMemo(
    () =>
      [
        ...new Set(
          [...nodeDetails.values()]
            .map(({ statusField }) => statusField?.value)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    [nodeDetails],
  );

  const focusedIds = useMemo(
    () => collectFocusedNodes(draft, selectedId, focus),
    [draft, focus, selectedId],
  );
  const visibleIds = useMemo(
    () =>
      new Set(
        draft.nodes
          .filter((node) => {
            const details = nodeDetails.get(node.id);
            const matchesType = typeFilter === 'all' || node.nodeTypeId === typeFilter;
            const matchesStatus =
              statusFilter === 'all' || details?.statusField?.value === statusFilter;
            return focusedIds.has(node.id) && matchesType && matchesStatus;
          })
          .map(({ id }) => id),
      ),
    [draft.nodes, focusedIds, nodeDetails, statusFilter, typeFilter],
  );

  const nodes = useMemo<OverviewNode[]>(
    () =>
      draft.nodes
        .filter((node) => visibleIds.has(node.id))
        .map((node) => {
          const details = nodeDetails.get(node.id);
          return {
            id: node.id,
            type: 'overview',
            position: node.position,
            draggable: false,
            selectable: true,
            data: {
              label: node.name,
              type: details?.type?.name ?? 'Unknown type',
              fields: details?.cardFields ?? [],
              highlighted: selectedId === node.id,
            },
          };
        }),
    [draft.nodes, nodeDetails, selectedId, visibleIds],
  );

  const edges = useMemo<Edge[]>(
    () =>
      draft.relationships
        .filter(
          (relationship) =>
            relationship.kind === 'routes-to' &&
            visibleIds.has(relationship.sourceNodeId) &&
            visibleIds.has(relationship.targetNodeId),
        )
        .map((relationship) => ({
          id: relationship.id,
          source: relationship.sourceNodeId,
          target: relationship.targetNodeId,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeWidth: 1.5 },
        })),
    [draft.relationships, visibleIds],
  );

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return draft.nodes
      .filter((node) => {
        const type = nodeDetails.get(node.id)?.type?.name ?? '';
        return node.name.toLowerCase().includes(query) || type.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [draft.nodes, nodeDetails, search]);

  const readableStart = useMemo(() => {
    const ordered = [...draft.nodes].sort((left, right) => left.position.x - right.position.x);
    const width = (ordered.at(-1)?.position.x ?? 0) - (ordered[0]?.position.x ?? 0);
    return width > 1200
      ? (ordered.find(({ routingRole }) => routingRole === 'source') ?? ordered[0])
      : undefined;
  }, [draft.nodes]);

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(document.fullscreenElement === canvasRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!nodesInitialized || initialViewApplied.current) return;
    initialViewApplied.current = true;
    if (readableStart) {
      void setCenter(readableStart.position.x + 104, readableStart.position.y + 52, {
        zoom: 0.85,
      });
    }
  }, [nodesInitialized, readableStart, setCenter]);

  const revealNode = useCallback(
    (nodeId: string) => {
      const node = draft.nodes.find((candidate) => candidate.id === nodeId);
      setTypeFilter('all');
      setStatusFilter('all');
      setFocus('all');
      setSelectedId(nodeId);
      setSearch('');
      if (node) {
        requestAnimationFrame(
          () =>
            void setCenter(node.position.x + 104, node.position.y + 52, {
              duration: 350,
              zoom: 1,
            }),
        );
      }
    },
    [draft.nodes, setCenter],
  );

  const resetView = useCallback(() => {
    setTypeFilter('all');
    setStatusFilter('all');
    setFocus('all');
    setSelectedId(undefined);
    setSearch('');
    requestAnimationFrame(() => {
      if (readableStart) {
        void setCenter(readableStart.position.x + 104, readableStart.position.y + 52, {
          duration: 300,
          zoom: 0.85,
        });
      } else {
        void fitView({ ...fitViewOptions, duration: 300 });
      }
    });
  }, [fitView, readableStart, setCenter]);

  return (
    <div
      ref={canvasRef}
      className={`relative overflow-hidden rounded-lg border bg-background ${isFullscreen ? 'h-screen rounded-none' : 'h-[440px]'}`}
      aria-label="Plant production topology"
    >
      <div className="absolute top-3 right-3 left-3 z-10 flex flex-wrap items-start gap-2">
        <div className="relative w-56 max-w-full shrink-0">
          <SearchField
            aria-label="Search plant nodes"
            placeholder="Search nodes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch('')}
          />
          {matches.length > 0 ? (
            <div
              role="listbox"
              aria-label="Matching plant nodes"
              className="absolute mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
            >
              {matches.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  role="option"
                  aria-selected={node.id === selectedId}
                  className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => revealNode(node.id)}
                >
                  <span className="truncate font-medium">{node.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {nodeDetails.get(node.id)?.type?.name ?? 'Unknown type'}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="shrink-0">
          <NativeSelect
            size="sm"
            className="max-w-44 bg-background"
            aria-label="Filter by node type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <NativeSelectOption value="all">All node types</NativeSelectOption>
            {draft.nodeTypes.map((type) => (
              <NativeSelectOption key={type.id} value={type.id}>
                {type.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        {statusOptions.length > 0 ? (
          <div className="shrink-0">
            <NativeSelect
              size="sm"
              className="max-w-44 bg-background"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <NativeSelectOption value="all">All statuses</NativeSelectOption>
              {statusOptions.map((status) => (
                <NativeSelectOption key={status} value={status}>
                  {status}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : null}

        <div className="flex shrink-0 rounded-md border bg-background p-0.5 shadow-xs">
          <Button
            size="sm"
            variant={focus === 'upstream' ? 'secondary' : 'ghost'}
            disabled={!selectedId}
            aria-label="Focus upstream nodes"
            title="Show the selected node and everything routing into it"
            onClick={() => setFocus('upstream')}
          >
            <ChevronLeftIcon /> Upstream
          </Button>
          <Button
            size="sm"
            variant={focus === 'downstream' ? 'secondary' : 'ghost'}
            disabled={!selectedId}
            aria-label="Focus downstream nodes"
            title="Show the selected node and everything it routes to"
            onClick={() => setFocus('downstream')}
          >
            Downstream <ChevronRightIcon />
          </Button>
        </div>

        <div className="ml-auto flex shrink-0 gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Reset topology view"
            title="Clear filters and return to the start of the production flow"
            onClick={resetView}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={isFullscreen ? 'Exit topology fullscreen' : 'Enter topology fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Open topology in fullscreen'}
            onClick={() =>
              void (isFullscreen
                ? document.exitFullscreen?.()
                : canvasRef.current?.requestFullscreen?.())
            }
          >
            {isFullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
          </Button>
        </div>
      </div>

      <ReactFlow<OverviewNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={overviewNodeTypes}
        fitView={!readableStart}
        fitViewOptions={fitViewOptions}
        minZoom={0.15}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        onlyRenderVisibleElements
        onNodeClick={(_event, node) => {
          setSelectedId(node.id);
          setFocus('all');
        }}
        onPaneClick={() => {
          setSelectedId(undefined);
          setFocus('all');
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1} />
        <MiniMap
          pannable
          zoomable
          ariaLabel="Plant topology minimap"
          className="!h-24 !w-36 !border !bg-background/95 !shadow-sm"
          nodeColor={(node) =>
            node.data.highlighted ? 'var(--primary)' : 'var(--muted-foreground)'
          }
          nodeStrokeColor="var(--border)"
        />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm sm:flex">
        <NetworkIcon className="size-3.5" /> Drag background to move · scroll to zoom
      </div>
    </div>
  );
}

function OverviewNodeCard({ data, selected }: NodeProps<OverviewNode>) {
  return (
    <article
      className={`w-52 rounded-lg border bg-card p-3 shadow-sm ${selected || data.highlighted ? 'border-primary ring-2 ring-primary/20' : ''}`}
      aria-label={`${data.label}, ${data.type}`}
    >
      <Handle type="target" position={Position.Left} className="!size-2 !border-background" />
      <strong className="block truncate text-sm" title={data.label}>
        {data.label}
      </strong>
      <span className="block truncate text-xs text-muted-foreground">{data.type}</span>
      {data.fields.length > 0 ? (
        <dl className="mt-2 space-y-1 border-t pt-2 text-xs">
          {data.fields.map((field) => (
            <div key={field.id} className="flex justify-between gap-3">
              <dt className="truncate text-muted-foreground">{field.name}</dt>
              <dd className="max-w-28 truncate font-medium" title={field.value}>
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <Handle type="source" position={Position.Right} className="!size-2 !border-background" />
    </article>
  );
}

function collectFocusedNodes(
  draft: PlantModelDraft,
  selectedId: string | undefined,
  direction: FocusDirection,
): ReadonlySet<string> {
  if (!selectedId || direction === 'all') return new Set(draft.nodes.map(({ id }) => id));

  const found = new Set([selectedId]);
  const pending = [selectedId];
  while (pending.length > 0) {
    const current = pending.shift();
    for (const relationship of draft.relationships) {
      if (relationship.kind !== 'routes-to') continue;
      const next =
        direction === 'upstream' && relationship.targetNodeId === current
          ? relationship.sourceNodeId
          : direction === 'downstream' && relationship.sourceNodeId === current
            ? relationship.targetNodeId
            : undefined;
      if (next && !found.has(next)) {
        found.add(next);
        pending.push(next);
      }
    }
  }
  return found;
}
