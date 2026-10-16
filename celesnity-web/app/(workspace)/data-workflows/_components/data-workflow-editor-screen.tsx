'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Connection } from '@xyflow/react';
import {
  ChevronDownIcon,
  GitBranchIcon,
  GitForkIcon,
  MergeIcon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
  WorkflowIcon,
} from 'lucide-react';

import { InlineError, PageAlert } from '@/app/_components/ui/page-alert';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { Combobox } from '@/app/_components/ui/combobox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/app/_components/ui/collapsible';
import { SelectField, TextField } from '@/app/_components/ui/fields';
import { Spinner } from '@/app/_components/ui/spinner';
import { ConflictError } from '@/src/entities/errors/application-errors';
import type { DataWorkflowDetail, DataWorkflowVersion } from '@/src/entities/models/data-workflow';
import {
  createManualWorkflowDraft,
  removeWorkflowEdge,
  removeWorkflowNode,
  replaceWorkflowNode,
  type DataWorkflowCanvasGraph,
  type DataWorkflowCanvasNode,
  type DataWorkflowCondition,
  type DataWorkflowPipelineTarget,
  type DataWorkflowRunDataBranch,
  type DataWorkflowRunDataCondition,
  type DataWorkflowRunDataPredicate,
  type DataWorkflowDraft,
  type DataWorkflowTrigger,
  validateTrigger,
} from '@/src/entities/models/data-workflow-graph';
import type { DataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';
import type { ListPipelinesController } from '@/src/interface-adapters/controllers/pipelines/list-pipelines.controller';
import type { PipelineSummaryViewModel } from '@/src/interface-adapters/presenters/pipeline.presenter';

import { ScheduleTriggerPanel } from './schedule-trigger-panel';
import { conditionRouteLabel } from './workflow-condition-label';

const WorkflowFlowCanvas = dynamic(
  () => import('./workflow-flow-canvas').then((module) => module.WorkflowFlowCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[480px] place-items-center rounded-lg border bg-muted">
        <Spinner />
      </div>
    ),
  },
);

interface Props {
  readonly controller: DataWorkflowController;
  readonly listPipelines: ListPipelinesController;
  readonly workflowId?: string;
}

type BusyAction = 'SAVE' | 'PUBLISH' | 'PREVIEW' | undefined;

export function DataWorkflowEditorScreen({ controller, listPipelines, workflowId }: Props) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<DataWorkflowDetail>();
  const [draft, setDraft] = useState(() => createManualWorkflowDraft());
  const [selectedNodeId, setSelectedNodeId] = useState<string>('trigger');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [sourceNodeId, setSourceNodeId] = useState('trigger');
  const [sourcePortId, setSourcePortId] = useState('out');
  const [targetNodeId, setTargetNodeId] = useState('');
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [preview, setPreview] = useState<readonly string[]>();
  const [publishedVersion, setPublishedVersion] = useState<DataWorkflowVersion>();
  const [busy, setBusy] = useState<BusyAction>();
  const [requiresRefresh, setRequiresRefresh] = useState(false);
  const [pipelines, setPipelines] = useState<readonly PipelineSummaryViewModel[]>();
  const [pipelineListError, setPipelineListError] = useState<string>();
  const [connectionToolsOpen, setConnectionToolsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void loadAllPipelines(listPipelines)
      .then((items) => {
        if (!active) return;
        setPipelines(items);
        setPipelineListError(undefined);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setPipelines([]);
        setPipelineListError(messageFor(cause, 'Pipelines could not be loaded.'));
      });
    return () => {
      active = false;
    };
  }, [listPipelines]);

  useEffect(() => {
    if (workflowId === undefined) return;
    let active = true;
    void controller
      .get(workflowId)
      .then((loaded) => {
        if (!active) return;
        setWorkflow(loaded);
        setDraft(loaded.draft);
        setSelectedNodeId(loaded.draft.graph.nodes[0]?.id ?? 'trigger');
        setSourceNodeId(loaded.draft.graph.nodes[0]?.id ?? 'trigger');
        setSourcePortId('out');
        setRequiresRefresh(false);
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(messageFor(cause, 'The workflow could not be loaded.'));
      });
    return () => {
      active = false;
    };
  }, [controller, workflowId]);

  const selectedNode = useMemo(
    () => draft.graph.nodes.find((node) => node.id === selectedNodeId),
    [draft.graph.nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => draft.graph.edges.find((edge) => edge.id === selectedEdgeId),
    [draft.graph.edges, selectedEdgeId],
  );
  const pipelineNames = useMemo(
    () =>
      new Map([
        ...(pipelines?.map((pipeline) => [pipeline.id, pipeline.name] as const) ?? []),
        ...Object.entries(publishedVersion?.pipelineDisplayNames ?? {}),
      ]),
    [pipelines, publishedVersion],
  );
  const trigger = useMemo<DataWorkflowTrigger>(
    () => draft.graph.nodes.find((node) => node.type === 'TRIGGER')?.trigger ?? { type: 'MANUAL' },
    [draft.graph.nodes],
  );
  const scheduleError = validateTrigger(trigger);
  const draftValidationError = validateDraft(draft);
  const dirty = workflow === undefined || JSON.stringify(workflow.draft) !== JSON.stringify(draft);

  const replaceNode = useCallback((nextNode: DataWorkflowCanvasNode) => {
    setDraft((current) => ({
      ...current,
      graph: replaceWorkflowNode(current.graph, nextNode),
    }));
  }, []);

  const updateTrigger = useCallback(
    (nextTrigger: DataWorkflowTrigger) => {
      const triggerNode = draft.graph.nodes.find((node) => node.type === 'TRIGGER');
      if (triggerNode) replaceNode({ ...triggerNode, trigger: nextTrigger });
      setPreview(undefined);
    },
    [draft.graph.nodes, replaceNode],
  );

  const addNode = useCallback(
    (type: Exclude<DataWorkflowCanvasNode['type'], 'TRIGGER'>) => {
      const id = `${type.toLowerCase()}-${safeId()}`;
      const position = {
        x: 280 + (draft.graph.nodes.length % 3) * 230,
        y: 120 + Math.floor(draft.graph.nodes.length / 3) * 170,
      };
      const node: DataWorkflowCanvasNode =
        type === 'PIPELINE'
          ? { id, type, position, pipelineId: '', versionNumber: 1 }
          : type === 'CONDITIONAL_SPLIT'
            ? {
                id,
                type,
                position,
                mode: 'FIRST_MATCH',
                conditionKind: 'RUN_DATA',
                branches: [{ id: 'fallback', fallback: true }],
              }
            : { id, type, position };
      setDraft((current) => ({
        ...current,
        graph: { ...current.graph, nodes: [...current.graph.nodes, node] },
      }));
      setSelectedNodeId(id);
      setTargetNodeId(id);
    },
    [draft.graph.nodes.length],
  );

  const addEdge = useCallback(
    (source: string, sourcePort: string, target: string, targetPort: string) => {
      if (!source || !target || source === target) {
        setActionError('Choose two different nodes to connect.');
        return;
      }
      const sourceNode = draft.graph.nodes.find((node) => node.id === source);
      const targetNode = draft.graph.nodes.find((node) => node.id === target);
      if (sourceNode?.type === 'PIPELINE_OUTCOME' && targetNode?.type !== 'PIPELINE') {
        setActionError('Pipeline Outcome routes must connect to a pipeline job.');
        return;
      }
      setDraft((current) => {
        const duplicate = current.graph.edges.some(
          (edge) =>
            edge.sourceNodeId === source &&
            edge.sourcePortId === sourcePort &&
            edge.targetNodeId === target &&
            edge.targetPortId === targetPort,
        );
        if (duplicate) return current;
        return {
          ...current,
          graph: {
            ...current.graph,
            edges: [
              ...current.graph.edges,
              {
                id: `edge-${safeId()}`,
                sourceNodeId: source,
                sourcePortId: sourcePort,
                targetNodeId: target,
                targetPortId: targetPort,
              },
            ],
          },
        };
      });
      setActionError(undefined);
    },
    [draft.graph.nodes],
  );

  const deleteNode = useCallback((nodeId: string) => {
    setDraft((current) => ({
      ...current,
      graph: removeWorkflowNode(current.graph, nodeId),
    }));
    setSelectedNodeId('');
    setSelectedEdgeId(undefined);
    setSourceNodeId((current) => (current === nodeId ? 'trigger' : current));
    setTargetNodeId((current) => (current === nodeId ? '' : current));
  }, []);

  const deleteEdge = useCallback((edgeId: string) => {
    setDraft((current) => ({
      ...current,
      graph: removeWorkflowEdge(current.graph, edgeId),
    }));
    setSelectedEdgeId(undefined);
  }, []);

  const save = useCallback(async () => {
    if (!draft.name.trim()) {
      setActionError('Give the workflow a name before saving.');
      return;
    }
    if (requiresRefresh) {
      setActionError('Reload the latest workflow revision before saving this draft.');
      return;
    }
    if (draftValidationError) {
      setActionError(draftValidationError);
      return;
    }
    setBusy('SAVE');
    setActionError(undefined);
    try {
      const saved = workflow
        ? await controller.save({ id: workflow.id, expectedRevision: workflow.revision, draft })
        : await controller.create({ draft });
      setWorkflow(saved);
      setDraft(saved.draft);
      if (workflow === undefined) router.replace(`/data-workflows/${encodeURIComponent(saved.id)}`);
    } catch (cause) {
      setActionError(
        cause instanceof ConflictError
          ? 'This workflow changed elsewhere. Reload it before saving your draft.'
          : messageFor(cause, 'The workflow could not be saved.'),
      );
    } finally {
      setBusy(undefined);
    }
  }, [controller, draft, draftValidationError, requiresRefresh, router, workflow]);

  const publish = useCallback(async () => {
    if (!workflow) {
      await save();
      return;
    }
    if (dirty) {
      setActionError('Save this draft before publishing it.');
      return;
    }
    setBusy('PUBLISH');
    setActionError(undefined);
    setRequiresRefresh(true);
    try {
      const version = await controller.publish({
        id: workflow.id,
        expectedRevision: workflow.revision,
      });
      const refreshed = await controller.get(workflow.id);
      setWorkflow(refreshed);
      setDraft(refreshed.draft);
      setPublishedVersion(version);
      setRequiresRefresh(false);
    } catch (cause) {
      setActionError(
        cause instanceof ConflictError
          ? 'This workflow changed elsewhere. Reload it before publishing.'
          : messageFor(cause, 'The workflow could not be published.'),
      );
    } finally {
      setBusy(undefined);
    }
  }, [controller, dirty, save, workflow]);

  const previewSchedule = useCallback(async () => {
    if (!workflow || trigger.type !== 'CALENDAR' || scheduleError) return;
    setBusy('PREVIEW');
    setActionError(undefined);
    try {
      const result = await controller.previewSchedule(workflow.id, 'DRAFT', 5);
      setPreview(result.occurrences);
    } catch (cause) {
      setActionError(messageFor(cause, 'The schedule preview could not be loaded.'));
    } finally {
      setBusy(undefined);
    }
  }, [controller, scheduleError, trigger.type, workflow]);

  if (loadError)
    return (
      <main className="p-6">
        <InlineError>{loadError}</InlineError>
      </main>
    );
  if (workflowId !== undefined && workflow === undefined)
    return (
      <main className="grid h-full place-items-center">
        <Spinner />
      </main>
    );

  return (
    <main
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-background lg:overflow-hidden"
      aria-label="Data workflow editor"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Data workflow
          </p>
          <h1 className="truncate text-lg font-semibold">{draft.name || 'Untitled workflow'}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground" role="status">
            {dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          <Button
            variant="outline"
            onClick={() => void save()}
            disabled={busy !== undefined || requiresRefresh}
          >
            {busy === 'SAVE' ? <Spinner className="size-4" /> : <SaveIcon />}
            Save
          </Button>
          <Button onClick={() => void publish()} disabled={busy !== undefined || requiresRefresh}>
            {busy === 'PUBLISH' ? <Spinner className="size-4" /> : <SendIcon />}
            Publish
          </Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-none lg:flex-1 lg:grid-cols-[15.5rem_minmax(0,1fr)_23rem]">
        <aside
          className="border-b bg-background p-3 lg:overflow-y-auto lg:border-r lg:border-b-0"
          aria-label="Workflow tools"
        >
          <TextField
            label="Workflow name"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
          <div className="mt-4 grid gap-1.5">
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Add node
            </h2>
            {(
              [
                ['PIPELINE', 'Pipeline job', WorkflowIcon],
                ['PIPELINE_OUTCOME', 'Pipeline outcome', GitBranchIcon],
                ['PARALLEL_SPLIT', 'Parallel split', GitForkIcon],
                ['CONDITIONAL_SPLIT', 'Conditional split', GitBranchIcon],
                ['JOIN', 'Join', MergeIcon],
              ] as const
            ).map(([type, label, Icon]) => (
              <Button
                key={type}
                variant="outline"
                size="sm"
                className="justify-start border-transparent bg-muted/50 shadow-none hover:border-border hover:bg-accent"
                onClick={() => addNode(type)}
              >
                <Icon className="text-muted-foreground" /> {label}
              </Button>
            ))}
          </div>
          <Collapsible
            className="mt-4 border-t pt-3"
            open={connectionToolsOpen}
            onOpenChange={setConnectionToolsOpen}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between px-2"
                aria-label="Connection tools"
              >
                <span>Connection tools</span>
                <ChevronDownIcon
                  className={
                    connectionToolsOpen ? 'rotate-180 transition-transform' : 'transition-transform'
                  }
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Keyboard alternative for connecting node handles.
              </p>
              <SelectField
                label="From node"
                value={sourceNodeId}
                data={nodeOptions(draft.graph.nodes, pipelineNames)}
                onChange={(nextSourceNodeId) => {
                  setSourceNodeId(nextSourceNodeId);
                  setSourcePortId(defaultSourcePort(nextSourceNodeId, draft.graph.nodes));
                }}
              />
              <SelectField
                label="From branch"
                value={sourcePortId}
                data={sourcePortOptions(sourceNodeId, draft.graph.nodes)}
                onChange={setSourcePortId}
              />
              <SelectField
                label="To node"
                value={targetNodeId}
                data={[
                  { value: '', label: 'Choose target' },
                  ...connectionTargetOptions(sourceNodeId, draft.graph.nodes, pipelineNames),
                ]}
                onChange={setTargetNodeId}
              />
              <Button
                variant="outline"
                onClick={() => addEdge(sourceNodeId, sourcePortId, targetNodeId, 'in')}
              >
                Connect selected nodes
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </aside>
        <section className="min-h-0 overflow-hidden bg-muted/20 p-2" aria-label="Workflow graph">
          <WorkflowFlowCanvas
            graph={draft.graph}
            pipelineNames={pipelineNames}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            onSelectNode={(nodeId) => {
              setSelectedNodeId(nodeId);
              setSelectedEdgeId(undefined);
            }}
            onSelectEdge={(edgeId) => {
              setSelectedEdgeId(edgeId);
              setSelectedNodeId('');
            }}
            onClearSelection={() => {
              setSelectedNodeId('');
              setSelectedEdgeId(undefined);
            }}
            onDeleteNode={deleteNode}
            onDeleteEdge={deleteEdge}
            onMove={(id, position) => {
              const node = draft.graph.nodes.find((candidate) => candidate.id === id);
              if (node) replaceNode({ ...node, position });
            }}
            onConnect={(connection: Connection) =>
              addEdge(
                connection.source ?? '',
                connection.sourceHandle ?? 'out',
                connection.target ?? '',
                connection.targetHandle ?? 'in',
              )
            }
          />
        </section>
        <aside
          className="border-t bg-background p-4 lg:overflow-y-auto lg:border-t-0 lg:border-l"
          aria-label="Workflow properties"
        >
          {selectedEdge ? (
            <ConnectionPanel
              sourceNodeId={selectedEdge.sourceNodeId}
              sourcePortId={selectedEdge.sourcePortId}
              targetNodeId={selectedEdge.targetNodeId}
              nodes={draft.graph.nodes}
              pipelineNames={pipelineNames}
              onDelete={() => deleteEdge(selectedEdge.id)}
            />
          ) : null}
          {selectedNode?.type === 'TRIGGER' ? (
            <ScheduleTriggerPanel
              controller={controller}
              trigger={trigger}
              onChange={updateTrigger}
            />
          ) : null}
          {selectedNode?.type === 'PIPELINE' ? (
            <PipelineNodePanel
              node={selectedNode}
              pipelines={pipelines}
              loadError={pipelineListError}
              onChange={replaceNode}
            />
          ) : null}
          {selectedNode?.type === 'CONDITIONAL_SPLIT' ? (
            <ConditionalNodePanel
              controller={controller}
              node={selectedNode}
              graph={draft.graph}
              onChange={replaceNode}
            />
          ) : null}
          {selectedNode?.type === 'PIPELINE_OUTCOME' ? (
            <p className="text-sm text-muted-foreground">
              Waits for every selected incoming pipeline. Success runs when all succeed; Error runs
              if any selected incoming pipeline failed. Connect the labelled output to each
              downstream route.
            </p>
          ) : null}
          {selectedNode &&
          selectedNode.type !== 'TRIGGER' &&
          selectedNode.type !== 'PIPELINE' &&
          selectedNode.type !== 'CONDITIONAL_SPLIT' &&
          selectedNode.type !== 'PIPELINE_OUTCOME' ? (
            <p className="text-sm text-muted-foreground">
              {selectedNode.type.replace('_', ' ')} has no configuration.
            </p>
          ) : null}
          {selectedNode === undefined ? (
            selectedEdge === undefined ? (
              <p className="text-sm text-muted-foreground">
                Select a node or connection to configure it.
              </p>
            ) : null
          ) : null}
          {selectedNode && selectedNode.type !== 'TRIGGER' ? (
            <Button
              className="mt-6 w-full justify-start"
              variant="destructive-ghost"
              onClick={() => deleteNode(selectedNode.id)}
            >
              <Trash2Icon />
              Delete node
            </Button>
          ) : null}
          {trigger.type === 'CALENDAR' ? (
            <Card className="mt-6 grid gap-3 p-4">
              <div>
                <h2 className="text-sm font-semibold">Calendar preview</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preview reflects the saved draft. Published schedules stay immutable.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => void previewSchedule()}
                disabled={!workflow || Boolean(scheduleError) || busy !== undefined}
              >
                {busy === 'PREVIEW' ? <Spinner className="size-4" /> : null} Preview upcoming times
              </Button>
              {!workflow ? (
                <p className="text-xs text-muted-foreground">
                  Save this workflow before previewing its schedule.
                </p>
              ) : null}
              {preview?.length ? (
                <ol className="space-y-1 text-xs text-muted-foreground">
                  {preview.map((occurrence) => (
                    <li key={occurrence}>{new Date(occurrence).toLocaleString()}</li>
                  ))}
                </ol>
              ) : null}
            </Card>
          ) : null}
          {publishedVersion ? (
            <PageAlert className="mt-6" tone="success">
              Published immutable version {publishedVersion.versionNumber}. Your draft has not been
              changed.
            </PageAlert>
          ) : null}
        </aside>
      </div>
      {actionError ? (
        <div className="border-t p-4">
          <InlineError>{actionError}</InlineError>
        </div>
      ) : null}
    </main>
  );
}

function ConnectionPanel({
  sourceNodeId,
  sourcePortId,
  targetNodeId,
  nodes,
  pipelineNames,
  onDelete,
}: {
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly targetNodeId: string;
  readonly nodes: readonly DataWorkflowCanvasNode[];
  readonly pipelineNames: ReadonlyMap<string, string>;
  readonly onDelete: () => void;
}) {
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  const sourceRouteLabel =
    sourcePortId === 'success' || sourcePortId === 'error'
      ? sourcePortId === 'success'
        ? 'Success'
        : 'Error'
      : sourceNode?.type === 'CONDITIONAL_SPLIT'
        ? conditionRouteLabel(sourceNode, sourcePortId)
        : undefined;
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-sm font-semibold">Connection</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {nodeLabel(sourceNode, pipelineNames)}
          {sourceRouteLabel ? ` · ${sourceRouteLabel}` : ''}
          {' → '}
          {nodeLabel(
            nodes.find((node) => node.id === targetNodeId),
            pipelineNames,
          )}
        </p>
      </div>
      <Button variant="destructive-ghost" className="justify-start" onClick={onDelete}>
        <Trash2Icon />
        Delete connection
      </Button>
    </section>
  );
}

function PipelineNodePanel({
  node,
  pipelines,
  loadError,
  onChange,
}: {
  readonly node: Extract<DataWorkflowCanvasNode, { readonly type: 'PIPELINE' }>;
  readonly pipelines?: readonly PipelineSummaryViewModel[];
  readonly loadError?: string;
  readonly onChange: (node: DataWorkflowCanvasNode) => void;
}) {
  const selectedPipeline = pipelines?.find((pipeline) => pipeline.id === node.pipelineId);
  const options = [
    ...(selectedPipeline || !node.pipelineId
      ? []
      : [
          {
            value: node.pipelineId,
            label: `Unavailable pipeline · ${node.pipelineId.slice(0, 8)}`,
          },
        ]),
    ...(pipelines?.map((pipeline) => ({
      value: pipeline.id,
      label: [pipeline.name, `v${String(pipeline.version)}`, pipeline.databaseName]
        .filter(Boolean)
        .join(' · '),
    })) ?? []),
  ];
  return (
    <section className="grid gap-4">
      <h2 className="text-sm font-semibold">Pipeline job</h2>
      <Combobox
        label="Pipeline"
        value={node.pipelineId}
        data={options}
        disabled={pipelines === undefined}
        placeholder={pipelines === undefined ? 'Loading pipelines…' : 'Choose a pipeline'}
        searchPlaceholder="Search pipelines…"
        emptyMessage="No pipelines available"
        error={loadError}
        hint="The workflow stores the selected pipeline ID and pins its current version."
        onChange={(pipelineId) => {
          const pipeline = pipelines?.find((candidate) => candidate.id === pipelineId);
          if (pipeline) onChange({ ...node, pipelineId, versionNumber: pipeline.version });
        }}
      />
      <TextField
        label="Pinned version"
        type="number"
        min={1}
        step={1}
        value={String(node.versionNumber)}
        onChange={(event) =>
          onChange({ ...node, versionNumber: Number.parseInt(event.target.value, 10) || 0 })
        }
      />
    </section>
  );
}

function ConditionalNodePanel({
  controller,
  node,
  graph,
  onChange,
}: {
  readonly controller: DataWorkflowController;
  readonly node: Extract<DataWorkflowCanvasNode, { readonly type: 'CONDITIONAL_SPLIT' }>;
  readonly graph: DataWorkflowCanvasGraph;
  readonly onChange: (node: DataWorkflowCanvasNode) => void;
}) {
  const directPipeline = directIncomingPipeline(node.id, graph);
  const pipelineKey =
    directPipeline === undefined
      ? undefined
      : `${directPipeline.pipelineId}:${String(directPipeline.versionNumber)}`;
  const [targetLookup, setTargetLookup] =
    useState<
      Readonly<{ readonly key: string; readonly targets: readonly DataWorkflowPipelineTarget[] }>
    >();
  const [targetLookupError, setTargetLookupError] =
    useState<Readonly<{ readonly key: string; readonly message: string }>>();
  useEffect(() => {
    let active = true;
    if (node.conditionKind !== 'RUN_DATA' || directPipeline === undefined) {
      return () => {
        active = false;
      };
    }
    const key = `${directPipeline.pipelineId}:${String(directPipeline.versionNumber)}`;
    void controller
      .listPipelineTargets(directPipeline.pipelineId, directPipeline.versionNumber)
      .then((items) => {
        if (active) setTargetLookup({ key, targets: items });
      })
      .catch((cause: unknown) => {
        if (active) {
          setTargetLookupError({
            key,
            message: messageFor(cause, 'Target schemas could not be loaded.'),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [controller, directPipeline, node.conditionKind]);

  if (node.conditionKind === 'RUN_DATA') {
    return (
      <RunDataConditionalNodePanel
        node={node}
        directPipeline={directPipeline}
        targets={
          targetLookup !== undefined && targetLookup.key === pipelineKey
            ? targetLookup.targets
            : undefined
        }
        targetsError={
          targetLookupError !== undefined && targetLookupError.key === pipelineKey
            ? targetLookupError.message
            : undefined
        }
        onChange={onChange}
      />
    );
  }
  return (
    <section className="grid gap-4">
      <h2 className="text-sm font-semibold">Conditional split</h2>
      <InlineError>
        This node uses a workflow-context condition created by an older release. Workflow-context
        routing is no longer supported in the editor.
      </InlineError>
      <Button
        variant="outline"
        onClick={() =>
          onChange({
            id: node.id,
            type: 'CONDITIONAL_SPLIT',
            position: node.position,
            mode: node.mode,
            conditionKind: 'RUN_DATA',
            branches: [{ id: 'fallback', fallback: true }],
          })
        }
      >
        Convert to Pipeline run data
      </Button>
    </section>
  );
}

function RunDataConditionalNodePanel({
  node,
  directPipeline,
  targets,
  targetsError,
  onChange,
}: {
  readonly node: Extract<DataWorkflowCanvasNode, { readonly type: 'CONDITIONAL_SPLIT' }> & {
    readonly conditionKind: 'RUN_DATA';
  };
  readonly directPipeline:
    Extract<DataWorkflowCanvasNode, { readonly type: 'PIPELINE' }> | undefined;
  readonly targets: readonly DataWorkflowPipelineTarget[] | undefined;
  readonly targetsError: string | undefined;
  readonly onChange: (node: DataWorkflowCanvasNode) => void;
}) {
  const branches = node.branches.filter(
    (branch): branch is Exclude<DataWorkflowRunDataBranch, { readonly fallback: true }> =>
      !('fallback' in branch),
  );
  const updateBranch = (branchId: string, runDataCondition: DataWorkflowRunDataCondition) =>
    onChange({
      ...node,
      branches: node.branches.map((branch) =>
        branch.id === branchId && !('fallback' in branch)
          ? { ...branch, runDataCondition }
          : branch,
      ),
    });
  const defaultTarget = targets?.find((target) => target.schemaStatus === 'KNOWN');
  return (
    <section className="grid gap-4">
      <h2 className="text-sm font-semibold">Conditional split</h2>
      <p className="text-xs text-muted-foreground">
        Pipeline run data checks only rows written by the directly connected pipeline run.
      </p>
      <SelectField
        label="Branch selection"
        value={node.mode}
        data={[
          { value: 'FIRST_MATCH', label: 'Choose first matching branch' },
          { value: 'ALL_MATCH', label: 'Run all matching branches' },
        ]}
        onChange={(mode) => onChange({ ...node, mode: mode as 'FIRST_MATCH' | 'ALL_MATCH' })}
      />
      {directPipeline === undefined ? (
        <InlineError>
          Pipeline run data needs exactly one directly incoming pipeline connection.
        </InlineError>
      ) : null}
      {targetsError ? <InlineError>{targetsError}</InlineError> : null}
      {branches.map((branch, index) => (
        <RunDataConditionBranchEditor
          key={branch.id}
          branch={branch}
          index={index}
          targets={targets ?? []}
          onChange={(condition) => updateBranch(branch.id, condition)}
          onRemove={() =>
            onChange({ ...node, branches: node.branches.filter((item) => item.id !== branch.id) })
          }
        />
      ))}
      <Button
        variant="outline"
        disabled={directPipeline === undefined || defaultTarget === undefined}
        onClick={() => {
          if (defaultTarget === undefined) return;
          const column = defaultTarget.columns[0];
          if (column === undefined) return;
          const runDataCondition: DataWorkflowRunDataCondition = {
            targetNodeId: defaultTarget.targetNodeId,
            quantifier: 'ANY',
            predicate: defaultPredicate(column.id, column.type),
          };
          onChange({
            ...node,
            branches: [
              ...node.branches.filter((branch) => !('fallback' in branch)),
              { id: safeId(), runDataCondition },
              { id: 'fallback', fallback: true },
            ],
          });
        }}
      >
        Add run-data branch
      </Button>
      <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
        Facts are evaluated from the selected target table of the pinned incoming pipeline version.
        Fallback runs when no branch matches.
      </p>
    </section>
  );
}

function RunDataConditionBranchEditor({
  branch,
  index,
  targets,
  onChange,
  onRemove,
}: {
  readonly branch: Exclude<DataWorkflowRunDataBranch, { readonly fallback: true }>;
  readonly index: number;
  readonly targets: readonly DataWorkflowPipelineTarget[];
  readonly onChange: (condition: DataWorkflowRunDataCondition) => void;
  readonly onRemove: () => void;
}) {
  const condition = branch.runDataCondition;
  const target = targets.find((item) => item.targetNodeId === condition.targetNodeId);
  const column = target?.columns.find((item) => item.id === condition.predicate.column);
  const predicate = condition.predicate;
  const predicateHasValue = 'value' in predicate;
  return (
    <Card className="grid gap-3 p-3">
      <p className="text-xs font-semibold">Run-data branch {index + 1}</p>
      <SelectField
        label="Target table"
        value={condition.targetNodeId}
        data={targets.map((item) => ({
          value: item.targetNodeId,
          label: `${item.tableName} · ${item.schemaStatus === 'KNOWN' ? 'schema available' : 'schema unavailable'}`,
          disabled: item.schemaStatus !== 'KNOWN',
        }))}
        onChange={(targetNodeId) => {
          const nextTarget = targets.find((item) => item.targetNodeId === targetNodeId);
          const nextColumn = nextTarget?.columns[0];
          if (nextColumn === undefined) return;
          onChange({
            targetNodeId,
            quantifier: condition.quantifier,
            predicate: defaultPredicate(nextColumn.id, nextColumn.type),
            ...(condition.quantifier === 'COUNT' ? { count: condition.count } : {}),
          } as DataWorkflowRunDataCondition);
        }}
      />
      <SelectField
        label="Target column"
        value={predicate.column}
        data={(target?.columns ?? []).map((item) => ({
          value: item.id,
          label: `${item.name} · ${item.type}`,
        }))}
        onChange={(columnId) => {
          const nextColumn = target?.columns.find((item) => item.id === columnId);
          if (nextColumn === undefined) return;
          onChange({
            targetNodeId: condition.targetNodeId,
            quantifier: condition.quantifier,
            predicate: defaultPredicate(columnId, nextColumn.type),
            ...(condition.quantifier === 'COUNT' ? { count: condition.count } : {}),
          } as DataWorkflowRunDataCondition);
        }}
      />
      <SelectField
        label="Rows matching"
        value={condition.quantifier}
        data={[
          { value: 'ANY', label: 'Any row' },
          { value: 'ALL', label: 'All rows' },
          { value: 'COUNT', label: 'Count rows' },
        ]}
        onChange={(quantifier) => {
          const next = quantifier as DataWorkflowRunDataCondition['quantifier'];
          onChange({
            targetNodeId: condition.targetNodeId,
            quantifier: next,
            predicate,
            ...(next === 'COUNT' ? { count: { operator: 'GTE', threshold: 1 } } : {}),
          } as DataWorkflowRunDataCondition);
        }}
      />
      <SelectField
        label="Predicate"
        value={predicate.operator}
        data={predicateOperators(column?.type)}
        onChange={(operator) =>
          onChange({
            targetNodeId: condition.targetNodeId,
            quantifier: condition.quantifier,
            predicate: predicateForOperator(predicate.column, column?.type, operator),
            ...(condition.quantifier === 'COUNT' ? { count: condition.count } : {}),
          } as DataWorkflowRunDataCondition)
        }
      />
      {predicateHasValue ? (
        <TextField
          label="Value"
          value={String(predicate.value ?? '')}
          onChange={(event) =>
            onChange({
              targetNodeId: condition.targetNodeId,
              quantifier: condition.quantifier,
              predicate: {
                ...predicate,
                value: typedValue(event.target.value, column?.type),
              } as DataWorkflowRunDataPredicate,
              ...(condition.quantifier === 'COUNT' ? { count: condition.count } : {}),
            } as DataWorkflowRunDataCondition)
          }
        />
      ) : null}
      {condition.quantifier === 'COUNT' ? (
        <div className="grid gap-3 min-[761px]:grid-cols-2">
          <SelectField
            label="Count comparison"
            value={condition.count.operator}
            data={[
              { value: 'GTE', label: 'At least' },
              { value: 'GT', label: 'More than' },
              { value: 'EQ', label: 'Exactly' },
              { value: 'LT', label: 'Fewer than' },
            ]}
            onChange={(operator) =>
              onChange({
                ...condition,
                count: { ...condition.count, operator: operator as 'GTE' | 'GT' | 'EQ' | 'LT' },
              })
            }
          />
          <TextField
            label="Count threshold"
            type="number"
            min={0}
            step={1}
            value={String(condition.count.threshold)}
            onChange={(event) =>
              onChange({
                ...condition,
                count: { ...condition.count, threshold: Number(event.target.value) },
              })
            }
          />
        </div>
      ) : null}
      <Button variant="destructive-ghost" className="justify-start" onClick={onRemove}>
        <Trash2Icon />
        Remove condition {index + 1} and its connections
      </Button>
    </Card>
  );
}

function nodeLabel(
  node: DataWorkflowCanvasNode | undefined,
  pipelineNames: ReadonlyMap<string, string>,
): string {
  if (!node) return 'Unavailable node';
  if (node.type === 'PIPELINE')
    return (
      pipelineNames.get(node.id) ??
      pipelineNames.get(node.pipelineId) ??
      `Unavailable pipeline · ${node.pipelineId.slice(0, 8)}`
    );
  return `${node.type.replaceAll('_', ' ').toLowerCase()} · ${node.id}`;
}
function nodeOptions(
  nodes: readonly DataWorkflowCanvasNode[],
  pipelineNames: ReadonlyMap<string, string>,
) {
  return nodes.map((node) => ({
    value: node.id,
    label: nodeLabel(node, pipelineNames),
  }));
}
function connectionTargetOptions(
  sourceNodeId: string,
  nodes: readonly DataWorkflowCanvasNode[],
  pipelineNames: ReadonlyMap<string, string>,
) {
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  const targets =
    sourceNode?.type === 'PIPELINE_OUTCOME'
      ? nodes.filter((node) => node.type === 'PIPELINE')
      : nodes;
  return nodeOptions(targets, pipelineNames);
}
function sourcePortOptions(nodeId: string, nodes: readonly DataWorkflowCanvasNode[]) {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (node?.type === 'PIPELINE_OUTCOME')
    return [
      { value: 'success', label: 'Success' },
      { value: 'error', label: 'Error' },
    ];
  return node?.type === 'CONDITIONAL_SPLIT'
    ? node.branches.map((branch) => ({
        value: branch.id,
        label: conditionRouteLabel(node, branch.id),
      }))
    : [{ value: 'out', label: 'Output' }];
}
function defaultSourcePort(nodeId: string, nodes: readonly DataWorkflowCanvasNode[]): string {
  return sourcePortOptions(nodeId, nodes)[0]?.value ?? 'out';
}
function upstreamNodeOptions(nodeId: string, graph: DataWorkflowCanvasGraph) {
  const ancestorIds = new Set<string>();
  const pending = graph.edges
    .filter((edge) => edge.targetNodeId === nodeId)
    .map((edge) => edge.sourceNodeId);
  while (pending.length > 0) {
    const candidateId = pending.pop();
    if (candidateId === undefined || candidateId === nodeId || ancestorIds.has(candidateId))
      continue;
    ancestorIds.add(candidateId);
    pending.push(
      ...graph.edges
        .filter((edge) => edge.targetNodeId === candidateId)
        .map((edge) => edge.sourceNodeId),
    );
  }
  return graph.nodes
    .filter((candidate) => ancestorIds.has(candidate.id))
    .map((candidate) => ({
      value: candidate.id,
      label: `${candidate.type.replace('_', ' ')} · ${candidate.id}`,
    }));
}
function validateDraft(draft: DataWorkflowDraft): string | undefined {
  const trigger = draft.graph.nodes.find((node) => node.type === 'TRIGGER')?.trigger;
  if (trigger) {
    const scheduleError = validateTrigger(trigger);
    if (scheduleError) return scheduleError;
  }
  for (const node of draft.graph.nodes) {
    if (node.type === 'PIPELINE' && !node.pipelineId) {
      return 'Choose a pipeline for every pipeline job.';
    }
    if (node.type !== 'CONDITIONAL_SPLIT') continue;
    if (node.conditionKind === 'RUN_DATA') {
      if (directIncomingPipeline(node.id, draft.graph) === undefined) {
        return 'Pipeline run data needs exactly one directly incoming pipeline connection.';
      }
      for (const branch of node.branches) {
        if ('fallback' in branch) continue;
        const condition = branch.runDataCondition;
        if (!condition.targetNodeId || !condition.predicate.column) {
          return 'Choose a target table and column for every run-data branch.';
        }
        if ('value' in condition.predicate && condition.predicate.value === '') {
          return 'Provide a type-compatible value for every run-data predicate.';
        }
        if (
          condition.quantifier === 'COUNT' &&
          (!Number.isInteger(condition.count.threshold) || condition.count.threshold < 0)
        ) {
          return 'Count thresholds must be whole numbers of zero or greater.';
        }
      }
      continue;
    }
    const upstreamNodeIds = new Set(
      upstreamNodeOptions(node.id, draft.graph).map(({ value }) => value),
    );
    for (const branch of node.branches) {
      if ('fallback' in branch) continue;
      if (
        !conditionPaths(branch.condition).every(
          (path) => path.length > 1 && upstreamNodeIds.has(path[0] ?? ''),
        )
      ) {
        return 'Each condition must reference a connected upstream node and property path.';
      }
    }
  }
  return undefined;
}

function directIncomingPipeline(
  nodeId: string,
  graph: DataWorkflowCanvasGraph,
): Extract<DataWorkflowCanvasNode, { readonly type: 'PIPELINE' }> | undefined {
  const incoming = graph.edges.filter((edge) => edge.targetNodeId === nodeId);
  if (incoming.length !== 1) return undefined;
  const source = graph.nodes.find((node) => node.id === incoming[0]?.sourceNodeId);
  return source?.type === 'PIPELINE' ? source : undefined;
}

function normalizeColumnType(type: string | undefined): string {
  return (type ?? '')
    .trim()
    .toLowerCase()
    .replace(/\(.+\)$/u, '');
}

function isNumericColumn(type: string | undefined): boolean {
  return [
    'byte',
    'short',
    'int',
    'integer',
    'long',
    'bigint',
    'float',
    'double',
    'decimal',
    'numeric',
  ].includes(normalizeColumnType(type));
}

function isBooleanColumn(type: string | undefined): boolean {
  return ['boolean', 'bool'].includes(normalizeColumnType(type));
}

function isDateColumn(type: string | undefined): boolean {
  return ['date', 'timestamp', 'timestamp_ntz'].includes(normalizeColumnType(type));
}

function predicateOperators(type: string | undefined) {
  if (isNumericColumn(type) || isDateColumn(type)) {
    return [
      { value: 'EQ', label: 'Equals' },
      { value: 'NE', label: 'Does not equal' },
      { value: 'GT', label: 'Greater than' },
      { value: 'GTE', label: 'Greater than or equal' },
      { value: 'LT', label: 'Less than' },
      { value: 'LTE', label: 'Less than or equal' },
    ];
  }
  if (isBooleanColumn(type)) {
    return [
      { value: 'EQ', label: 'Equals' },
      { value: 'NE', label: 'Does not equal' },
    ];
  }
  return [
    { value: 'EQ', label: 'Equals' },
    { value: 'NE', label: 'Does not equal' },
    { value: 'IS_EMPTY', label: 'Is empty' },
    { value: 'IS_NOT_EMPTY', label: 'Is not empty' },
  ];
}

function defaultPredicate(column: string, type: string): DataWorkflowRunDataPredicate {
  return predicateForOperator(column, type, isNumericColumn(type) ? 'GT' : 'EQ');
}

function predicateForOperator(
  column: string,
  type: string | undefined,
  operator: string,
): DataWorkflowRunDataPredicate {
  if (operator === 'IS_EMPTY' || operator === 'IS_NOT_EMPTY') return { column, operator };
  const safeOperator = ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE'].includes(operator)
    ? (operator as 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE')
    : 'EQ';
  const value = isBooleanColumn(type) ? false : isNumericColumn(type) ? 0 : '';
  return safeOperator === 'GT' ||
    safeOperator === 'GTE' ||
    safeOperator === 'LT' ||
    safeOperator === 'LTE'
    ? { column, operator: safeOperator, value: isDateColumn(type) ? '2026-01-01' : Number(value) }
    : {
        column,
        operator: safeOperator === 'EQ' || safeOperator === 'NE' ? safeOperator : 'EQ',
        value,
      };
}

function typedValue(value: string, type: string | undefined): string | number | boolean | null {
  if (isBooleanColumn(type)) return value === 'true';
  if (isNumericColumn(type)) return Number(value);
  return value;
}

async function loadAllPipelines(
  listPipelines: ListPipelinesController,
): Promise<readonly PipelineSummaryViewModel[]> {
  const firstPage = await listPipelines({ page: 1, pageSize: 100 });
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.totalPages - 1) }, (_, index) =>
      listPipelines({ page: index + 2, pageSize: 100 }),
    ),
  );
  return [firstPage, ...remainingPages]
    .flatMap((page) => page.items)
    .sort((left, right) => left.name.localeCompare(right.name));
}
function conditionPaths(condition: DataWorkflowCondition): readonly (readonly string[])[] {
  return 'conditions' in condition
    ? condition.conditions.flatMap(conditionPaths)
    : [condition.path];
}
function safeId(): string {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function messageFor(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
