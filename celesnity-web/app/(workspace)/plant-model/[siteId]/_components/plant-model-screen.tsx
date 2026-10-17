'use client';

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClockIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Button } from '@/app/_components/ui/button';
import { Checkbox } from '@/app/_components/ui/checkbox';
import { MultiCombobox } from '@/app/_components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/_components/ui/dialog';
import { Input } from '@/app/_components/ui/input';
import { Label } from '@/app/_components/ui/label';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/app/_components/ui/hover-card';
import { NativeSelect, NativeSelectOption } from '@/app/_components/ui/native-select';
import { SearchField } from '@/app/_components/ui/search-field';
import { Switch } from '@/app/_components/ui/switch';
import type {
  PlantCatalogLookupResult,
  PlantModelDraft,
  PlantModelTemplate,
  PlantModelVersion,
  PlantVersionDiff,
  PlantNode,
  PlantNodeType,
  PlantPropertyDefinition,
  PlantPropertyType,
  PlantPropertyValue,
  PlantSite,
} from '@/src/entities/models/plant-model';
import { plantDraftEqual, publishIssues } from '@/src/entities/models/plant-model';
import type { PlantModelController } from '@/src/interface-adapters/controllers/plant-model/plant-model.controller';
import { CatalogBindingEditor, type CatalogMetadataControllers } from './catalog-binding-editor';
import { buildPlantNodeDisplay, type PlantNodeDisplayField } from './plant-node-display';
import { usePlantWorkspace } from './plant-workspace-context';

const propertyTypes: readonly PlantPropertyType[] = [
  'text',
  'number',
  'boolean',
  'datetime',
  'single-select',
  'multi-select',
  'node-reference',
  'catalog-scalar',
  'catalog-choices',
  'catalog-multi-select',
];
const nodeTypes = { plant: PlantNodeCard };

export function PlantModelScreen({
  siteId,
  controller,
  catalogMetadata,
}: {
  readonly siteId: string;
  readonly controller: PlantModelController;
  readonly catalogMetadata: CatalogMetadataControllers;
}) {
  const { t } = useTranslation();
  const {
    setSite: setWorkspaceSite,
    setDirty: setWorkspaceDirty,
    selectNode: selectWorkspaceNode,
    selectRelationship: selectWorkspaceRelationship,
  } = usePlantWorkspace();
  const [site, setSite] = useState<PlantSite>();
  const [draft, setDraft] = useState<PlantModelDraft>();
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<readonly PlantModelTemplate[]>([]);
  const [versions, setVersions] = useState<readonly PlantModelVersion[]>([]);
  const [activePanel, setActivePanel] = useState<'inspector' | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    let active = true;
    void controller.get(siteId).then(
      (value) => {
        if (active) {
          setSite(value);
          setDraft(structuredClone(value.draft));
          setError('');
        }
      },
      () => {
        if (active) setError(t('plantModel.loadError'));
      },
    );
    return () => {
      active = false;
    };
  }, [controller, siteId, t]);

  useEffect(() => {
    if (site) setWorkspaceSite(site);
  }, [setWorkspaceSite, site]);

  const dirty = site !== undefined && draft !== undefined && !plantDraftEqual(site.draft, draft);
  useEffect(() => {
    setWorkspaceDirty(dirty);
    return () => setWorkspaceDirty(false);
  }, [dirty, setWorkspaceDirty]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  const updateDraft = useCallback((mutate: (current: PlantModelDraft) => PlantModelDraft) => {
    setDraft((current) => (current === undefined ? current : mutate(current)));
  }, []);
  const updateNode = useCallback(
    (nodeId: string, mutate: (node: PlantNode) => PlantNode) => {
      updateDraft((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === nodeId ? mutate(node) : node)),
      }));
    },
    [updateDraft],
  );
  const updateType = useCallback(
    (typeId: string, mutate: (type: PlantNodeType) => PlantNodeType) => {
      updateDraft((current) => ({
        ...current,
        nodeTypes: current.nodeTypes.map((type) => (type.id === typeId ? mutate(type) : type)),
      }));
    },
    [updateDraft],
  );

  async function save() {
    if (!site || !draft) return;
    setBusy(true);
    try {
      const saved = await controller.save(site.id, draft, site.revision);
      setSite(saved);
      setDraft(structuredClone(saved.draft));
      setError('');
    } catch {
      setError(t('plantModel.conflict'));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!site || !draft) return;
    const issues = publishIssues(draft);
    if (issues.length > 0) {
      setError(t('plantModel.publishBlocked', { count: issues.length }));
      setSelectedId(issues.find((value) => value.nodeId)?.nodeId);
      setActivePanel('inspector');
      return;
    }
    setBusy(true);
    try {
      let saved = site;
      if (dirty) saved = await controller.save(site.id, draft, site.revision);
      const published = await controller.publish(site.id, saved.revision);
      setSite(published);
      setDraft(structuredClone(published.draft));
      setError('');
    } catch {
      setError(t('plantModel.publishError'));
    } finally {
      setBusy(false);
    }
  }

  /*
   * Which nodes the type filter leaves on the canvas, and which ones the search
   * box offers to jump to.
   *
   * The overview drops filtered-out nodes from the array it hands React Flow.
   * This screen cannot: the canvas is an editor whose node list carries drag
   * positions and selection, and rebuilding it around a filter loses them. The
   * hidden ids travel to PlantCanvas instead, which sets React Flow's own
   * `hidden` flag and leaves every node object where it was.
   */
  const hiddenNodeIds = useMemo(() => {
    if (typeFilter === 'all') return new Set<string>();
    return new Set(
      (draft?.nodes ?? []).filter((node) => node.nodeTypeId !== typeFilter).map((node) => node.id),
    );
  }, [draft?.nodes, typeFilter]);
  const searchMatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term === '') return [];
    return (draft?.nodes ?? [])
      .filter((node) => !hiddenNodeIds.has(node.id) && node.name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [draft?.nodes, hiddenNodeIds, search]);

  if (!site || !draft)
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        {error || t('plantModel.loading')}
      </div>
    );
  const selected = draft.nodes.find((node) => node.id === selectedId);
  const selectedType = draft.nodeTypes.find((type) => type.id === selected?.nodeTypeId);

  return (
    <main className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b px-4">
        <div className="mr-auto">
          <h1 className="text-base font-semibold">{site.name}</h1>
          <p className="text-xs text-muted-foreground">
            {t('plantModel.revision', { revision: site.revision })}
            {dirty ? ` · ${t('plantModel.unsaved')}` : ''}
          </p>
        </div>
        <TemplateDialog
          templates={templates}
          load={async () => {
            const values = await controller.listTemplates();
            setTemplates(values);
          }}
          apply={async (id) => {
            const value = await controller.applyTemplate(site.id, id, site.revision);
            setSite(value);
            setDraft(structuredClone(value.draft));
          }}
        />
        <NodeTypesDialog
          draft={draft}
          updateDraft={updateDraft}
          updateType={updateType}
          catalogMetadata={catalogMetadata}
        />
        <HistoryDialog
          versions={versions}
          load={async () => setVersions(await controller.listVersions(site.id))}
          diff={(from, to) => controller.diffVersions(site.id, from, to)}
        />
        <Button variant="outline" disabled={!dirty || busy} onClick={() => void save()}>
          <SaveIcon />
          {t('plantModel.save')}
        </Button>
        <Button disabled={busy} onClick={() => void publish()}>
          <UploadIcon />
          {t('plantModel.publish')}
        </Button>
      </header>
      {error ? (
        <button
          type="button"
          className="border-b bg-destructive/10 px-4 py-2 text-left text-sm text-destructive"
          onClick={() => setError('')}
        >
          {error}
        </button>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative min-h-[420px] min-w-0 flex-1">
          <div className="absolute top-3 right-3 left-3 z-10 flex flex-wrap items-start gap-2">
            <Button
              size="sm"
              disabled={draft.nodeTypes.length === 0}
              onClick={() => {
                const type = draft.nodeTypes[0];
                if (!type) return;
                const id = crypto.randomUUID();
                updateDraft((current) => ({
                  ...current,
                  nodes: [
                    ...current.nodes,
                    {
                      id,
                      name: t('plantModel.newNode'),
                      nodeTypeId: type.id,
                      routingRole: 'none',
                      position: {
                        x: 120 + current.nodes.length * 24,
                        y: 100 + current.nodes.length * 20,
                      },
                      values: {},
                      localProperties: [],
                    },
                  ],
                }));
                setSelectedId(id);
                selectWorkspaceNode(id);
                setActivePanel('inspector');
              }}
            >
              <PlusIcon />
              {t('plantModel.addNode')}
            </Button>

            <div className="relative w-56 max-w-full shrink-0">
              <SearchField
                aria-label={t('plantModel.searchNodesLabel')}
                placeholder={t('plantModel.searchNodes')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onClear={() => setSearch('')}
              />
              {search.trim() === '' ? null : (
                <div
                  role="listbox"
                  aria-label={t('plantModel.searchNodesLabel')}
                  className="absolute mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
                >
                  {searchMatches.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-muted-foreground">
                      {t('plantModel.noMatchingNodes')}
                    </p>
                  ) : (
                    searchMatches.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        role="option"
                        aria-selected={node.id === selectedId}
                        className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                        onClick={() => {
                          setSelectedId(node.id);
                          setSelectedRelationshipId(undefined);
                          selectWorkspaceNode(node.id);
                          setActivePanel('inspector');
                          setSearch('');
                        }}
                      >
                        <span className="truncate font-medium">{node.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {draft.nodeTypes.find((type) => type.id === node.nodeTypeId)?.name ?? ''}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0">
              <NativeSelect
                size="sm"
                className="max-w-44 bg-background"
                aria-label={t('plantModel.filterByNodeType')}
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <NativeSelectOption value="all">{t('plantModel.allNodeTypes')}</NativeSelectOption>
                {draft.nodeTypes.map((type) => (
                  <NativeSelectOption key={type.id} value={type.id}>
                    {type.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <PlantCanvas
            draft={draft}
            selectedId={selectedId}
            selectedRelationshipId={selectedRelationshipId}
            select={(id) => {
              setSelectedId(id);
              setSelectedRelationshipId(undefined);
              selectWorkspaceNode(id);
              setActivePanel(id === undefined ? null : 'inspector');
            }}
            selectRelationship={(id) => {
              setSelectedRelationshipId(id);
              setSelectedId(undefined);
              selectWorkspaceRelationship(id);
              setActivePanel(null);
            }}
            updateDraft={updateDraft}
            hiddenNodeIds={hiddenNodeIds}
          />
        </section>
        {activePanel === 'inspector' && selected && selectedType ? (
          <Inspector
            node={selected}
            type={selectedType}
            draft={draft}
            updateNode={updateNode}
            updateDraft={updateDraft}
            resolve={(binding, values) => controller.resolveCatalog(binding, values)}
            catalogMetadata={catalogMetadata}
            close={() => setActivePanel(null)}
          />
        ) : null}
      </div>
    </main>
  );
}

function PlantCanvas({
  draft,
  selectedId,
  selectedRelationshipId,
  select,
  selectRelationship,
  updateDraft,
  hiddenNodeIds,
}: {
  readonly draft: PlantModelDraft;
  readonly selectedId?: string;
  readonly selectedRelationshipId?: string;
  readonly select: (id?: string) => void;
  readonly selectRelationship: (id?: string) => void;
  readonly updateDraft: (fn: (draft: PlantModelDraft) => PlantModelDraft) => void;
  /** Filtered out by node type: hidden on the canvas, but still part of the draft. */
  readonly hiddenNodeIds: ReadonlySet<string>;
}) {
  const { t } = useTranslation();
  const types = useMemo(
    () => new Map(draft.nodeTypes.map((type) => [type.id, type])),
    [draft.nodeTypes],
  );
  const projectedNodes = useMemo<Node[]>(
    () =>
      draft.nodes.map((node) => ({
        id: node.id,
        type: 'plant',
        position: node.position,
        initialWidth: 208,
        initialHeight: 64,
        selected: node.id === selectedId,
        hidden: hiddenNodeIds.has(node.id),
        data: (() => {
          const type = types.get(node.nodeTypeId);
          const display =
            type === undefined
              ? { cardFields: [], details: [] }
              : buildPlantNodeDisplay(node, type, draft, {
                  trueValue: t('plantModel.booleanTrue'),
                  falseValue: t('plantModel.booleanFalse'),
                  liveValue: t('plantModel.livePropertyValue'),
                  notSet: t('plantModel.notSet'),
                });
          return {
            label: node.name,
            type: type?.name ?? '',
            cardFields: display.cardFields,
            details: display.details,
            accessibilityLabel: t('plantModel.nodeCardLabel', {
              name: node.name,
              type: type?.name ?? '',
            }),
          };
        })(),
      })),
    [draft, hiddenNodeIds, selectedId, t, types],
  );
  const [nodes, setNodes] = useState<Node[]>(projectedNodes);
  const [projection, setProjection] = useState({
    source: draft.nodes,
    selectedId,
    types,
    hiddenNodeIds,
  });
  if (
    projection.source !== draft.nodes ||
    projection.selectedId !== selectedId ||
    projection.types !== types ||
    projection.hiddenNodeIds !== hiddenNodeIds
  ) {
    setProjection({ source: draft.nodes, selectedId, types, hiddenNodeIds });
    setNodes((current) =>
      projectedNodes.map((projected) => {
        const existing = current.find((node) => node.id === projected.id);
        return existing === undefined
          ? projected
          : { ...existing, ...projected, measured: existing.measured };
      }),
    );
  }
  const edges = useMemo<Edge[]>(
    () =>
      draft.relationships
        .filter((edge) => edge.kind === 'routes-to')
        .map((edge) => ({
          id: edge.id,
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          markerEnd: { type: MarkerType.ArrowClosed },
          selected: edge.id === selectedRelationshipId,
          /* React Flow keeps drawing an edge whose endpoints are hidden, which
             leaves a route line ending in empty space. */
          hidden: hiddenNodeIds.has(edge.sourceNodeId) || hiddenNodeIds.has(edge.targetNodeId),
        })),
    [draft.relationships, hiddenNodeIds, selectedRelationshipId],
  );
  const onNodesChange = (changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    const committed = changes.filter(
      (change): change is Extract<NodeChange, { type: 'position' }> =>
        change.type === 'position' && change.dragging === false && change.position !== undefined,
    );
    if (committed.length > 0) {
      updateDraft((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          const move = committed.find((change) => change.id === node.id);
          return move?.position === undefined ? node : { ...node, position: move.position };
        }),
      }));
    }
  };
  const connect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    updateDraft((current) =>
      current.relationships.some(
        (edge) =>
          edge.kind === 'routes-to' &&
          edge.sourceNodeId === connection.source &&
          edge.targetNodeId === connection.target,
      )
        ? current
        : {
            ...current,
            relationships: [
              ...current.relationships,
              {
                id: crypto.randomUUID(),
                kind: 'routes-to',
                sourceNodeId: connection.source!,
                targetNodeId: connection.target!,
              },
            ],
          },
    );
  };
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ minZoom: 0.65, maxZoom: 1, padding: 0.2 }}
      minZoom={0.15}
      maxZoom={1.5}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      onlyRenderVisibleElements
      onNodesChange={onNodesChange}
      onConnect={connect}
      onNodeClick={(_event, node) => select(node.id)}
      onEdgeClick={(_event, edge) => selectRelationship(edge.id)}
      onPaneClick={() => {
        select(undefined);
        selectRelationship(undefined);
      }}
      onEdgesDelete={(removed) =>
        updateDraft((current) => ({
          ...current,
          relationships: current.relationships.filter(
            (edge) => !removed.some((item) => item.id === edge.id),
          ),
        }))
      }
    >
      <Background />
      <MiniMap
        pannable
        zoomable
        ariaLabel="Plant model minimap"
        className="!h-24 !w-36 !border !bg-background/95 !shadow-sm"
        nodeColor="var(--muted-foreground)"
        nodeStrokeColor="var(--border)"
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function PlantNodeCard({
  data,
  selected,
}: {
  readonly data: {
    readonly label: string;
    readonly type: string;
    readonly cardFields: readonly PlantNodeDisplayField[];
    readonly details: readonly PlantNodeDisplayField[];
    readonly accessibilityLabel: string;
  };
  readonly selected: boolean;
}) {
  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          tabIndex={0}
          aria-label={data.accessibilityLabel}
          className={`min-w-52 rounded-xl border bg-card px-4 py-3 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected ? 'border-primary ring-2 ring-primary/20' : ''}`}
        >
          <Handle type="target" position={Position.Left} />
          <strong className="block text-sm">{data.label}</strong>
          <span className="text-xs text-muted-foreground">{data.type}</span>
          {data.cardFields.length > 0 ? (
            <dl className="mt-2 space-y-1 border-t pt-2 text-xs">
              {data.cardFields.map((field) => (
                <div key={field.id} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{field.name}</dt>
                  <dd className="max-w-32 truncate font-medium">{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <Handle type="source" position={Position.Right} />
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72">
        <div className="space-y-3">
          <div>
            <strong className="block text-sm">{data.label}</strong>
            <span className="text-xs text-muted-foreground">{data.type}</span>
          </div>
          {data.details.length > 0 ? (
            <dl className="space-y-2 text-sm">
              {data.details.map((field) => (
                <div
                  key={field.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3"
                >
                  <dt className="text-muted-foreground">{field.name}</dt>
                  <dd className="break-words text-right font-medium">{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Inspector({
  node,
  type,
  draft,
  updateNode,
  updateDraft,
  resolve,
  catalogMetadata,
  close,
}: {
  readonly node: PlantNode;
  readonly type: PlantNodeType;
  readonly draft: PlantModelDraft;
  readonly updateNode: (id: string, fn: (node: PlantNode) => PlantNode) => void;
  readonly updateDraft: (fn: (draft: PlantModelDraft) => PlantModelDraft) => void;
  readonly resolve: PlantModelController['resolveCatalog'];
  readonly catalogMetadata: CatalogMetadataControllers;
  readonly close: () => void;
}) {
  const { t } = useTranslation();
  const definitions = [...type.properties, ...node.localProperties].sort(
    (a, b) => a.order - b.order,
  );
  const displayValues = new Map(
    buildPlantNodeDisplay(node, type, draft, {
      trueValue: t('plantModel.booleanTrue'),
      falseValue: t('plantModel.booleanFalse'),
      liveValue: t('plantModel.livePropertyValue'),
      notSet: t('plantModel.notSet'),
    }).details.map((field) => [field.id, field.value]),
  );
  const setShownOnCard = (property: PlantPropertyDefinition, shown: boolean) => {
    if (node.localProperties.some(({ id }) => id === property.id)) {
      updateNode(node.id, (current) => ({
        ...current,
        localProperties: current.localProperties.map((candidate) =>
          candidate.id === property.id ? { ...candidate, showOnCard: shown } : candidate,
        ),
      }));
      return;
    }
    updateDraft((current) => ({
      ...current,
      nodeTypes: current.nodeTypes.map((candidate) =>
        candidate.id === type.id
          ? {
              ...candidate,
              properties: candidate.properties.map((definition) =>
                definition.id === property.id ? { ...definition, showOnCard: shown } : definition,
              ),
            }
          : candidate,
      ),
    }));
  };
  const parent =
    draft.relationships.find((edge) => edge.kind === 'contains' && edge.targetNodeId === node.id)
      ?.sourceNodeId ?? '';
  return (
    <aside className="w-full shrink-0 overflow-y-auto border-t bg-card p-5 lg:w-[390px] lg:border-t-0 lg:border-l">
      <div className="mb-6 flex items-center">
        <h2 className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('plantModel.inspector')}
        </h2>
        <Button variant="ghost" size="icon" onClick={close}>
          <XIcon />
        </Button>
      </div>
      <div className="space-y-5">
        <Field label={t('plantModel.name')}>
          <Input
            value={node.name}
            onChange={(event) =>
              updateNode(node.id, (value) => ({ ...value, name: event.target.value }))
            }
          />
        </Field>
        <Field label={t('plantModel.nodeType')}>
          <NativeSelect
            className="w-full"
            value={node.nodeTypeId}
            onChange={(event) =>
              updateNode(node.id, (value) => ({
                ...value,
                nodeTypeId: event.target.value,
                values: {},
              }))
            }
          >
            {draft.nodeTypes.map((value) => (
              <NativeSelectOption key={value.id} value={value.id}>
                {value.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t('plantModel.routingRole')}>
          <NativeSelect
            className="w-full"
            value={node.routingRole}
            onChange={(event) =>
              updateNode(node.id, (value) => ({
                ...value,
                routingRole: event.target.value as PlantNode['routingRole'],
              }))
            }
          >
            {['none', 'source', 'intermediate', 'sink'].map((role) => (
              <NativeSelectOption key={role} value={role}>
                {t(`plantModel.routing.${role}` as never)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t('plantModel.parent')}>
          <NativeSelect
            className="w-full"
            value={parent}
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                relationships: [
                  ...current.relationships.filter(
                    (edge) => !(edge.kind === 'contains' && edge.targetNodeId === node.id),
                  ),
                  ...(event.target.value
                    ? [
                        {
                          id: crypto.randomUUID(),
                          kind: 'contains' as const,
                          sourceNodeId: event.target.value,
                          targetNodeId: node.id,
                        },
                      ]
                    : []),
                ],
              }))
            }
          >
            <NativeSelectOption value="">{t('plantModel.noParent')}</NativeSelectOption>
            {draft.nodes
              .filter((value) => value.id !== node.id)
              .map((value) => (
                <NativeSelectOption key={value.id} value={value.id}>
                  {value.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
        <section className="space-y-3 rounded-lg border p-3" aria-labelledby="card-overview-title">
          <div className="space-y-1">
            <h3 id="card-overview-title" className="text-sm font-medium">
              {t('plantModel.cardOverviewFields')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('plantModel.cardOverviewHelp', { type: type.name })}
            </p>
          </div>
          {definitions.length > 0 ? (
            <div className="space-y-2">
              {definitions.map((definition) => {
                const checkboxId = `card-field-${node.id}-${definition.id}`;
                return (
                  <div key={definition.id} className="flex items-start gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={definition.showOnCard === true}
                      onCheckedChange={(checked) => setShownOnCard(definition, checked === true)}
                    />
                    <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer text-sm">
                      <span className="block font-medium">{definition.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {displayValues.get(definition.id)}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('plantModel.noOverviewFields')}</p>
          )}
        </section>
        {node.localProperties.length > 0 ? (
          <div className="space-y-2">
            <Label>{t('plantModel.localProperties')}</Label>
            {node.localProperties.map((property) => (
              <PropertyDefinitionRow
                key={property.id}
                property={property}
                availableProperties={definitions}
                catalogMetadata={catalogMetadata}
                move={(direction) =>
                  updateNode(node.id, (current) => ({
                    ...current,
                    localProperties: moveProperty(current.localProperties, property.id, direction),
                  }))
                }
                update={(next) =>
                  updateNode(node.id, (current) => ({
                    ...current,
                    localProperties: current.localProperties.map((item) =>
                      item.id === property.id ? next : item,
                    ),
                  }))
                }
                remove={() =>
                  updateNode(node.id, (current) => ({
                    ...current,
                    localProperties: current.localProperties.filter(
                      (item) => item.id !== property.id,
                    ),
                    values: Object.fromEntries(
                      Object.entries(current.values).filter(([id]) => id !== property.id),
                    ),
                  }))
                }
              />
            ))}
          </div>
        ) : null}
        {definitions.map((definition) => (
          <PropertyEditor
            key={definition.id}
            definition={definition}
            value={node.values[definition.id]}
            nodes={draft.nodes}
            nodeValues={node.values}
            resolve={resolve}
            setValue={(value) =>
              updateNode(node.id, (current) => ({
                ...current,
                values: { ...current.values, [definition.id]: value },
              }))
            }
          />
        ))}
        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            updateNode(node.id, (current) => ({
              ...current,
              localProperties: [
                ...current.localProperties,
                newProperty(current.localProperties.length),
              ],
            }))
          }
        >
          <PlusIcon />
          {t('plantModel.addLocalProperty')}
        </Button>
        <Button
          variant="destructive"
          className="w-full"
          onClick={() =>
            updateDraft((current) => ({
              ...current,
              nodes: current.nodes.filter((value) => value.id !== node.id),
              relationships: current.relationships.filter(
                (edge) => edge.sourceNodeId !== node.id && edge.targetNodeId !== node.id,
              ),
            }))
          }
        >
          <Trash2Icon />
          {t('plantModel.removeNode')}
        </Button>
      </div>
    </aside>
  );
}

function PropertyEditor({
  definition,
  value,
  nodes,
  nodeValues,
  setValue,
  resolve,
}: {
  readonly definition: PlantPropertyDefinition;
  readonly value?: PlantPropertyValue;
  readonly nodes: readonly PlantNode[];
  readonly nodeValues: Readonly<Record<string, PlantPropertyValue>>;
  readonly setValue: (value: PlantPropertyValue) => void;
  readonly resolve: PlantModelController['resolveCatalog'];
}) {
  const { t } = useTranslation();
  const [lookup, setLookup] = useState<PlantCatalogLookupResult>();
  const [lookupError, setLookupError] = useState(false);
  const refresh = useCallback(async () => {
    if (!definition.catalogBinding) return;
    try {
      setLookup(await resolve(definition.catalogBinding, nodeValues));
      setLookupError(false);
    } catch {
      setLookupError(true);
    }
  }, [definition.catalogBinding, nodeValues, resolve]);
  useEffect(() => {
    if (!definition.type.startsWith('catalog-') || !definition.catalogBinding) return;
    let active = true;
    void resolve(definition.catalogBinding, nodeValues).then(
      (result) => {
        if (active) {
          setLookup(result);
          setLookupError(false);
        }
      },
      () => {
        if (active) setLookupError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [definition.catalogBinding, definition.type, nodeValues, resolve]);
  const label = `${definition.name}${definition.required ? ' *' : ''}`;
  if (definition.type === 'boolean')
    return (
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Switch checked={value === true} onCheckedChange={(checked) => setValue(checked)} />
      </div>
    );
  if (definition.type === 'single-select' || definition.type === 'catalog-choices') {
    const options =
      definition.type === 'single-select'
        ? (definition.options ?? []).map((item) => ({
            value: item.id,
            label: item.label,
            deprecated: item.deprecated,
          }))
        : lookup?.kind === 'choices'
          ? lookup.options.map((item) => ({
              value: String(item.value ?? ''),
              label: item.label,
              deprecated: false,
            }))
          : [];
    return (
      <Field label={label}>
        <div className="flex gap-2">
          <NativeSelect
            className="w-full"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => setValue(event.target.value)}
          >
            <NativeSelectOption value="">{t('plantModel.select')}</NativeSelectOption>
            {options.map((item) => (
              <NativeSelectOption key={item.value} value={item.value} disabled={item.deprecated}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {definition.type === 'catalog-choices' ? (
            <Button
              variant="outline"
              size="icon"
              onClick={() => void refresh()}
              aria-label={t('plantModel.refreshCatalog')}
            >
              <RefreshCwIcon />
            </Button>
          ) : null}
        </div>
        {lookupError ? (
          <p className="text-xs text-destructive">{t('plantModel.catalogUnavailable')}</p>
        ) : null}
        {definition.type === 'catalog-choices' && lookup?.kind === 'choices' ? (
          <p className="text-xs text-muted-foreground">
            {t('plantModel.optionsResolved', {
              count: lookup.options.length,
              time: new Date(lookup.resolvedAt).toLocaleTimeString(),
            })}
          </p>
        ) : null}
      </Field>
    );
  }
  if (definition.type === 'catalog-multi-select') {
    const options =
      lookup?.kind === 'choices'
        ? lookup.options.map((item) => ({ value: String(item.value ?? ''), label: item.label }))
        : [];
    return (
      <div className="space-y-2">
        <div className="flex items-end gap-2">
          <MultiCombobox
            className="flex-1"
            label={label}
            data={options}
            value={Array.isArray(value) ? value : []}
            onChange={setValue}
            placeholder={t('plantModel.selectMultiple')}
            searchPlaceholder={t('plantModel.searchCatalogOptions')}
            emptyMessage={
              lookupError ? t('plantModel.catalogUnavailable') : t('plantModel.noCatalogOptions')
            }
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => void refresh()}
            aria-label={t('plantModel.refreshCatalog')}
          >
            <RefreshCwIcon />
          </Button>
        </div>
        {lookupError ? (
          <p className="text-xs text-destructive">{t('plantModel.catalogUnavailable')}</p>
        ) : null}
        {lookup?.kind === 'choices' ? (
          <p className="text-xs text-muted-foreground">
            {t('plantModel.optionsResolved', {
              count: lookup.options.length,
              time: new Date(lookup.resolvedAt).toLocaleTimeString(),
            })}
          </p>
        ) : null}
      </div>
    );
  }
  if (definition.type === 'multi-select')
    return (
      <Field label={label}>
        <div className="space-y-2 rounded-md border p-3">
          {(definition.options ?? []).map((option) => {
            const selected = Array.isArray(value) && value.includes(option.id);
            return (
              <label key={option.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected}
                  disabled={option.deprecated}
                  onCheckedChange={(checked) =>
                    setValue(
                      checked
                        ? [...(Array.isArray(value) ? value : []), option.id]
                        : Array.isArray(value)
                          ? value.filter((id) => id !== option.id)
                          : [],
                    )
                  }
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </Field>
    );
  if (definition.type === 'node-reference')
    return (
      <Field label={label}>
        <NativeSelect
          className="w-full"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => setValue(event.target.value)}
        >
          <NativeSelectOption value="">{t('plantModel.select')}</NativeSelectOption>
          {nodes.map((item) => (
            <NativeSelectOption key={item.id} value={item.id}>
              {item.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    );
  if (definition.type === 'catalog-scalar')
    return (
      <Field label={label}>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="flex-1">
            {lookupError || (lookup?.kind === 'scalar' && !lookup.available)
              ? t('plantModel.unavailable')
              : lookup?.kind === 'scalar' && lookup.available
                ? lookup.label
                : t('plantModel.loading')}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refresh()}
            aria-label={t('plantModel.refreshCatalog')}
          >
            <RefreshCwIcon />
          </Button>
        </div>
        {lookup ? (
          <p className="text-xs text-muted-foreground">
            {t('plantModel.resolvedAt', { time: new Date(lookup.resolvedAt).toLocaleTimeString() })}
          </p>
        ) : null}
      </Field>
    );
  return (
    <Field label={label}>
      <Input
        type={
          definition.type === 'number'
            ? 'number'
            : definition.type === 'datetime'
              ? 'datetime-local'
              : 'text'
        }
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        onChange={(event) =>
          setValue(definition.type === 'number' ? Number(event.target.value) : event.target.value)
        }
      />
    </Field>
  );
}

function NodeTypesDialog({
  draft,
  updateDraft,
  updateType,
  catalogMetadata,
}: {
  readonly draft: PlantModelDraft;
  readonly updateDraft: (fn: (draft: PlantModelDraft) => PlantModelDraft) => void;
  readonly updateType: (id: string, fn: (type: PlantNodeType) => PlantNodeType) => void;
  readonly catalogMetadata: CatalogMetadataControllers;
}) {
  const { t } = useTranslation();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SettingsIcon />
          {t('plantModel.nodeTypes')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('plantModel.nodeTypes')}</DialogTitle>
          <DialogDescription>{t('plantModel.nodeTypesDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {draft.nodeTypes.map((type) => (
            <div key={type.id} className="space-y-3 rounded-lg border p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input
                  value={type.name}
                  onChange={(event) =>
                    updateType(type.id, (value) => ({ ...value, name: event.target.value }))
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    updateDraft((current) => ({
                      ...current,
                      nodeTypes: current.nodeTypes.filter((value) => value.id !== type.id),
                    }))
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
              {type.properties.map((property) => (
                <PropertyDefinitionRow
                  key={property.id}
                  property={property}
                  availableProperties={type.properties}
                  catalogMetadata={catalogMetadata}
                  move={(direction) =>
                    updateType(type.id, (value) => ({
                      ...value,
                      properties: moveProperty(value.properties, property.id, direction),
                    }))
                  }
                  update={(next) =>
                    updateType(type.id, (value) => ({
                      ...value,
                      properties: value.properties.map((item) =>
                        item.id === property.id ? next : item,
                      ),
                    }))
                  }
                  remove={() =>
                    updateType(type.id, (value) => ({
                      ...value,
                      properties: value.properties.filter((item) => item.id !== property.id),
                    }))
                  }
                />
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  updateType(type.id, (value) => ({
                    ...value,
                    properties: [...value.properties, newProperty(value.properties.length)],
                  }))
                }
              >
                <PlusIcon />
                {t('plantModel.addProperty')}
              </Button>
            </div>
          ))}
          <Button
            onClick={() =>
              updateDraft((current) => ({
                ...current,
                nodeTypes: [
                  ...current.nodeTypes,
                  {
                    id: crypto.randomUUID(),
                    name: t('plantModel.newType'),
                    properties: [],
                  },
                ],
              }))
            }
          >
            <PlusIcon />
            {t('plantModel.addNodeType')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PropertyDefinitionRow({
  property,
  availableProperties,
  catalogMetadata,
  move,
  update,
  remove,
}: {
  readonly property: PlantPropertyDefinition;
  readonly availableProperties: readonly PlantPropertyDefinition[];
  readonly catalogMetadata: CatalogMetadataControllers;
  readonly move: (direction: -1 | 1) => void;
  readonly update: (property: PlantPropertyDefinition) => void;
  readonly remove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-md bg-muted/50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label={t('plantModel.propertyName')}
          value={property.name}
          onChange={(event) => update({ ...property, name: event.target.value })}
        />
        <NativeSelect
          aria-label={t('plantModel.propertyType')}
          className="w-64"
          value={property.type}
          onChange={(event) =>
            update({
              ...property,
              type: event.target.value as PlantPropertyType,
              options: ['single-select', 'multi-select'].includes(event.target.value)
                ? (property.options ?? [])
                : undefined,
              catalogBinding: event.target.value.startsWith('catalog-')
                ? (property.catalogBinding ??
                  emptyBinding(event.target.value === 'catalog-scalar' ? 'scalar' : 'choices'))
                : undefined,
            })
          }
        >
          {propertyTypes.map((type) => (
            <NativeSelectOption key={type} value={type}>
              {t(`plantModel.propertyType.${type}` as never)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={property.required}
                onCheckedChange={(checked) => update({ ...property, required: checked === true })}
              />
              {t('plantModel.required')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={property.showOnCard === true}
                onCheckedChange={(checked) => update({ ...property, showOnCard: checked === true })}
              />
              {t('plantModel.showOnCard')}
            </label>
          </div>
          <div className="flex">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => move(-1)}
              aria-label={t('plantModel.moveUp')}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => move(1)}
              aria-label={t('plantModel.moveDown')}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={remove}
              aria-label={t('plantModel.removeProperty')}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      </div>
      {property.type.startsWith('catalog-') ? (
        <p className="text-sm text-muted-foreground">
          {t(`plantModel.propertyTypeHelp.${property.type}` as never)}
        </p>
      ) : null}
      {property.type === 'single-select' || property.type === 'multi-select' ? (
        <ValueSetEditor property={property} update={update} />
      ) : null}
      {property.catalogBinding ? (
        <CatalogBindingEditor
          property={property}
          availableProperties={availableProperties}
          metadata={catalogMetadata}
          update={update}
        />
      ) : null}
    </div>
  );
}

function ValueSetEditor({
  property,
  update,
}: {
  readonly property: PlantPropertyDefinition;
  readonly update: (property: PlantPropertyDefinition) => void;
}) {
  const { t } = useTranslation();
  const options = property.options ?? [];
  return (
    <div className="space-y-2">
      <Label>{t('plantModel.options')}</Label>
      {options.map((option) => (
        <div className="flex gap-2" key={option.id}>
          <Input
            value={option.label}
            onChange={(event) =>
              update({
                ...property,
                options: options.map((item) =>
                  item.id === option.id ? { ...item, label: event.target.value } : item,
                ),
              })
            }
          />
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={option.deprecated === true}
              onCheckedChange={(checked) =>
                update({
                  ...property,
                  options: options.map((item) =>
                    item.id === option.id ? { ...item, deprecated: checked === true } : item,
                  ),
                })
              }
            />
            {t('plantModel.deprecated')}
          </label>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          update({
            ...property,
            options: [...options, { id: crypto.randomUUID(), label: t('plantModel.newOption') }],
          })
        }
      >
        {t('plantModel.addOption')}
      </Button>
    </div>
  );
}

function TemplateDialog({
  templates,
  load,
  apply,
}: {
  readonly templates: readonly PlantModelTemplate[];
  readonly load: () => Promise<void>;
  readonly apply: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">{t('plantModel.templates')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('plantModel.templates')}</DialogTitle>
          <DialogDescription>{t('plantModel.templatesDescription')}</DialogDescription>
        </DialogHeader>
        {templates.map((template) => (
          <button
            type="button"
            key={template.id}
            className="rounded-lg border p-4 text-left hover:bg-accent"
            onClick={() => void apply(template.id)}
          >
            <strong>{template.name}</strong>
            <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
          </button>
        ))}
      </DialogContent>
    </Dialog>
  );
}
function HistoryDialog({
  versions,
  load,
  diff,
}: {
  readonly versions: readonly PlantModelVersion[];
  readonly load: () => Promise<void>;
  readonly diff: (from: number, to: number) => Promise<PlantVersionDiff>;
}) {
  const { t } = useTranslation();
  const [changes, setChanges] = useState<PlantVersionDiff>();
  const ordered = [...versions].sort((a, b) => b.number - a.number);
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          setChanges(undefined);
          void load();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <ClockIcon />
          {t('plantModel.history')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('plantModel.history')}</DialogTitle>
          <DialogDescription>{t('plantModel.historyDescription')}</DialogDescription>
        </DialogHeader>
        {ordered.length > 1 ? (
          <Button
            variant="outline"
            onClick={() => void diff(ordered[1]!.number, ordered[0]!.number).then(setChanges)}
          >
            {t('plantModel.compareLatest')}
          </Button>
        ) : null}
        {changes ? (
          <div className="space-y-2 rounded-lg bg-muted p-3">
            <strong>{t('plantModel.diffTitle', { from: changes.from, to: changes.to })}</strong>
            {changes.changes.map((change) => (
              <p key={`${change.kind}-${change.id}`} className="text-sm">
                {change.action} · {change.kind} · {change.name}
              </p>
            ))}
            {changes.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('plantModel.noChanges')}</p>
            ) : null}
          </div>
        ) : null}
        {ordered.map((version) => (
          <div key={version.number} className="rounded-lg border p-3">
            <strong>{t('plantModel.version', { version: version.number })}</strong>
            <p className="text-sm text-muted-foreground">
              {new Date(version.publishedAt).toLocaleString()}
            </p>
          </div>
        ))}
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('plantModel.noVersions')}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function newProperty(order: number): PlantPropertyDefinition {
  const id = crypto.randomUUID();
  return {
    id,
    key: `property_${id.replaceAll('-', '').slice(0, 8)}`,
    name: 'Property',
    type: 'text',
    required: false,
    order,
  };
}
function emptyBinding(mode: 'scalar' | 'choices') {
  return {
    mode,
    catalog: '',
    schema: '',
    table: '',
    valueColumn: '',
    filters: [],
    limit: 100,
  } as const;
}
function moveProperty(
  properties: readonly PlantPropertyDefinition[],
  id: string,
  direction: -1 | 1,
): readonly PlantPropertyDefinition[] {
  const ordered = [...properties].sort((left, right) => left.order - right.order);
  const index = ordered.findIndex((property) => property.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return properties;
  [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
  return ordered.map((property, order) => ({ ...property, order }));
}
