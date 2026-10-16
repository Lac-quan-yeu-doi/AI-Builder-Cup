'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Connection } from '@xyflow/react';

import { contextualErrorMessage } from '@/app/_components/shared/error-message';
import { isCurrentRequestToken } from '@/app/_components/shared/request-token';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { cn } from '@/app/_components/ui/utils';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { Card } from '@/app/_components/ui/card';
import { TextField } from '@/app/_components/ui/fields';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { NodePropertyOption } from '@/src/entities/models/node-definition';
import type {
  GeneratedPipelineScript,
  PipelineNode,
  PipelineNodeSchema,
  PipelinePosition,
  PipelineValidationIssue,
} from '@/src/entities/models/pipeline';
import type { SourceNamespace, SourceRelation } from '@/src/entities/models/source-metadata';
import { defaultConfigFromPanel, nodeIssuesById } from '@/src/entities/models/pipeline-graph';
import type { GetNodeDefinitionController } from '@/src/interface-adapters/controllers/node-catalog/get-node-definition.controller';
import type { LoadNodePaletteController } from '@/src/interface-adapters/controllers/node-catalog/load-node-palette.controller';
import type { ListNamespacesController } from '@/src/interface-adapters/controllers/catalog/list-namespaces.controller';
import type { ListTablesController } from '@/src/interface-adapters/controllers/catalog/list-tables.controller';
import type { GetPipelineController } from '@/src/interface-adapters/controllers/pipelines/get-pipeline.controller';
import type { GetPipelineScriptController } from '@/src/interface-adapters/controllers/pipelines/get-pipeline-script.controller';
import type { PreviewPipelineNodeController } from '@/src/interface-adapters/controllers/pipelines/preview-pipeline-node.controller';
import type { RunPipelineController } from '@/src/interface-adapters/controllers/pipelines/run-pipeline.controller';
import type { SavePipelineController } from '@/src/interface-adapters/controllers/pipelines/save-pipeline.controller';
import type { ValidatePipelineEdgeController } from '@/src/interface-adapters/controllers/pipelines/validate-pipeline-edge.controller';
import type { ValidatePipelineGraphController } from '@/src/interface-adapters/controllers/pipelines/validate-pipeline-graph.controller';
import type { MetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';
import type { SourceMetadataController } from '@/src/interface-adapters/controllers/metadata-crawler/source-metadata.controller';
import type {
  NodeDefinitionSummaryViewModel,
  NodeDefinitionViewModel,
  NodePaletteGroupViewModel,
} from '@/src/interface-adapters/presenters/node-definition.presenter';
import type { NodePreviewViewModel } from '@/src/interface-adapters/presenters/pipeline.presenter';

import { NodePalette } from './node-palette';
import { databaseTabHref } from '../../../_components/database-screen';

import { groupValidationIssues } from './validation-issue-groups';
import { NodePreviewPanel } from './node-preview-panel';
import { NodePropertyPanel } from './node-property-panel';
import { PipelineScriptPanel } from './pipeline-script-panel';
import {
  canvasReducer,
  canvasStateFromPipeline,
  isCanvasDirty,
  selectedNode,
  type CanvasAction,
  type CanvasState,
} from './pipeline-canvas.reducer';

const PALETTE_DEBOUNCE_MS = 300;
const GRAPH_VALIDATION_DEBOUNCE_MS = 350;
const PREVIEW_ROW_LIMIT = 100;
const LOAD_FALLBACK = 'The pipeline could not be loaded.';
const paletteId = 'canvas-node-catalogue';

/** Chrome shared by every card that floats over the canvas. */
const floatingSurfaceClass =
  'overflow-hidden rounded-xl border border-border bg-card/95 shadow-300 backdrop-blur-[10px]';

const FlowCanvas = dynamic(() => import('./flow-canvas').then((module) => module.FlowCanvas), {
  ssr: false,
  loading: () => (
    <div
      className="grid h-full min-h-[560px] place-items-center content-center gap-0 bg-muted text-caption text-muted-foreground"
      role="status"
      aria-label="Loading flow canvas"
    >
      <Spinner className="size-7 text-primary" />
      <strong>Loading flow canvas…</strong>
    </div>
  ),
});

interface PipelineCanvasScreenProps {
  /** The database this canvas was opened from; where its back links return to. */
  readonly databaseName: string;
  readonly pipelineId: string;
  readonly controllers: Readonly<{
    get: GetPipelineController;
    getScript: GetPipelineScriptController;
    save: SavePipelineController;
    validateGraph: ValidatePipelineGraphController;
    validateEdge: ValidatePipelineEdgeController;
    preview: PreviewPipelineNodeController;
    run: RunPipelineController;
    loadPalette: LoadNodePaletteController;
    getDefinition: GetNodeDefinitionController;
    listNamespaces: ListNamespacesController;
    listTables: ListTablesController;
    metadataCrawler: MetadataCrawlerController;
    sourceMetadata: SourceMetadataController;
  }>;
}

interface Feedback {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

function validationIssues(result: {
  readonly errors: readonly PipelineValidationIssue[];
  readonly warnings: readonly PipelineValidationIssue[];
}): readonly PipelineValidationIssue[] {
  return [
    ...result.errors.map((issue) => ({ ...issue, severity: 'ERROR' as const })),
    ...result.warnings.map((issue) => ({ ...issue, severity: 'WARNING' as const })),
  ];
}

function runtimeCheckLabel(count: number): string {
  return `${count} runtime schema ${count === 1 ? 'check' : 'checks'}`;
}

/** The floating right-hand panels; only one is open at a time. */
type CanvasPanel = 'properties' | 'issues';

const panelLabels: Readonly<Record<CanvasPanel, string>> = {
  properties: 'Node properties',
  issues: 'Validation results',
};

const canvasPanels: readonly { readonly id: CanvasPanel; readonly icon: LucideIcon }[] = [
  { id: 'properties', icon: SlidersHorizontalIcon },
  { id: 'issues', icon: TriangleAlertIcon },
];

type ScreenAction = CanvasAction | { readonly type: 'loaded'; readonly state: CanvasState };

function screenReducer(state: CanvasState | undefined, action: ScreenAction) {
  if (action.type === 'loaded') {
    return action.state;
  }
  return state ? canvasReducer(state, action) : state;
}

export function PipelineCanvasScreen({
  controllers,
  databaseName: currentDatabase,
  pipelineId,
}: PipelineCanvasScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [state, dispatch] = useReducer(screenReducer, undefined);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [paletteGroups, setPaletteGroups] = useState<readonly NodePaletteGroupViewModel[]>();
  const [paletteKeyword, setPaletteKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [definitionsByResource, setDefinitionsByResource] = useState<
    ReadonlyMap<string, NodeDefinitionSummaryViewModel>
  >(new Map());
  const [definitionsByType, setDefinitionsByType] = useState<
    ReadonlyMap<string, NodeDefinitionViewModel>
  >(new Map());
  // Keyed by node type, because a graph holds several and they fail
  // independently. One shared string meant the node that loaded last cleared
  // the error of the node that had failed, leaving its panel on two skeletons
  // with nothing to say why.
  const [definitionErrors, setDefinitionErrors] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [feedback, setFeedback] = useState<Feedback>();
  const [conflict, setConflict] = useState<string>();
  const [preview, setPreview] = useState<NodePreviewViewModel>();
  const [previewError, setPreviewError] = useState<string>();
  const [savePhase, setSavePhase] = useState<'IDLE' | 'CHECKING' | 'SAVING'>('IDLE');
  const isSaving = savePhase !== 'IDLE';
  const [isValidating, setIsValidating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeView, setActiveView] = useState<'visual' | 'script'>('visual');
  const [generatedScript, setGeneratedScript] = useState<GeneratedPipelineScript>();
  const [scriptRequestedVersion, setScriptRequestedVersion] = useState<number>();
  const [scriptError, setScriptError] = useState<string>();
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<CanvasPanel>();
  const [targetDatabaseOptions, setTargetDatabaseOptions] = useState<readonly NodePropertyOption[]>(
    [],
  );
  const [targetTableOptions, setTargetTableOptions] = useState<readonly NodePropertyOption[]>([]);
  const [targetOptionsError, setTargetOptionsError] = useState<string>();
  const [isLoadingTargetDatabases, setIsLoadingTargetDatabases] = useState(false);
  const [isLoadingTargetTables, setIsLoadingTargetTables] = useState(false);
  const [sourceNamespaceOptions, setSourceNamespaceOptions] = useState<
    readonly NodePropertyOption[]
  >([]);
  const [sourceRelationOptions, setSourceRelationOptions] = useState<readonly NodePropertyOption[]>(
    [],
  );
  const [sourceNamespaces, setSourceNamespaces] = useState<ReadonlyMap<string, SourceNamespace>>(
    new Map(),
  );
  const [sourceRelations, setSourceRelations] = useState<ReadonlyMap<string, SourceRelation>>(
    new Map(),
  );
  const [sourceCrawlerId, setSourceCrawlerId] = useState<string>();
  const [sourceOptionsError, setSourceOptionsError] = useState<string>();
  const [isLoadingSourceDatabases, setIsLoadingSourceDatabases] = useState(false);
  const [isLoadingSourceTables, setIsLoadingSourceTables] = useState(false);
  const [nodeSchemas, setNodeSchemas] = useState<Readonly<Record<string, PipelineNodeSchema>>>({});
  const definitionRequests = useRef(new Set<string>());
  const targetDatabaseRequest = useRef(0);
  const targetTableRequest = useRef(0);
  const sourceNamespaceRequest = useRef(0);
  const sourceRelationRequest = useRef(0);
  const graphValidationRequest = useRef(0);

  const isDirty = state ? isCanvasDirty(state) : false;
  const isBusy = isSaving || isValidating || isRunning;
  const node = state ? selectedNode(state) : undefined;
  const fullNodeDefinition = node ? definitionsByType.get(node.definitionType) : undefined;
  const boundNodeSummary = node?.resourceId
    ? definitionsByResource.get(node.resourceId)
    : undefined;
  const nodeDefinition =
    fullNodeDefinition && boundNodeSummary
      ? {
          ...fullNodeDefinition,
          ...boundNodeSummary,
          propertyPanel: fullNodeDefinition.propertyPanel,
        }
      : fullNodeDefinition;
  const clearSourceOptions = useCallback(() => {
    sourceNamespaceRequest.current += 1;
    sourceRelationRequest.current += 1;
    setSourceNamespaceOptions([]);
    setSourceRelationOptions([]);
    setSourceNamespaces(new Map());
    setSourceRelations(new Map());
    setSourceCrawlerId(undefined);
    setSourceOptionsError(undefined);
    setIsLoadingSourceDatabases(false);
    setIsLoadingSourceTables(false);
  }, []);

  const loadSourceRelations = useCallback(
    async (crawlerId: string, namespaceId: string, selectedRelationId?: string) => {
      const token = ++sourceRelationRequest.current;
      setSourceRelationOptions([]);
      setSourceRelations(new Map());
      if (namespaceId.trim().length === 0) {
        setIsLoadingSourceTables(false);
        return;
      }
      setIsLoadingSourceTables(true);
      setSourceOptionsError(undefined);
      try {
        const page = await controllers.sourceMetadata.listRelations(crawlerId, namespaceId, {
          page: 1,
          pageSize: 200,
          sortBy: 'name',
          sortDirection: 'asc',
        });
        if (isCurrentRequestToken(sourceRelationRequest.current, token)) {
          setSourceRelations(new Map(page.items.map((relation) => [relation.id, relation])));
          setSourceRelationOptions(
            page.items
              .map((relation) => ({ label: relation.name, value: relation.id }))
              .sort(compareOptions),
          );
          setSourceOptionsError(
            page.items.length === 0
              ? 'The selected crawler schema contains no current relations.'
              : selectedRelationId && !page.items.some(({ id }) => id === selectedRelationId)
                ? 'The selected metadata relation is stale or has been deleted. Select it again.'
                : undefined,
          );
        }
      } catch (error) {
        if (isCurrentRequestToken(sourceRelationRequest.current, token)) {
          setSourceOptionsError(
            contextualErrorMessage(error, 'The crawler relations could not be loaded.'),
          );
        }
      } finally {
        if (isCurrentRequestToken(sourceRelationRequest.current, token)) {
          setIsLoadingSourceTables(false);
        }
      }
    },
    [controllers],
  );

  const loadSourceNamespaces = useCallback(
    async (
      databaseServiceId: string,
      selectedNamespaceId?: string,
      selectedRelationId?: string,
    ) => {
      const token = ++sourceNamespaceRequest.current;
      setSourceNamespaceOptions([]);
      setSourceRelationOptions([]);
      setSourceNamespaces(new Map());
      setSourceRelations(new Map());
      setSourceCrawlerId(undefined);
      setIsLoadingSourceDatabases(true);
      setSourceOptionsError(undefined);
      try {
        const crawlerPage = await controllers.metadataCrawler.list({ includeArchived: true });
        if (!isCurrentRequestToken(sourceNamespaceRequest.current, token)) return;
        const crawler = crawlerPage.items.find(
          (candidate) => candidate.databaseServiceId === databaseServiceId,
        );
        if (!crawler) {
          setSourceOptionsError('No metadata crawler is assigned to this data connection.');
          return;
        }
        if (crawler.state === 'ARCHIVED') {
          setSourceOptionsError('The assigned metadata crawler is archived. Restore it first.');
          return;
        }
        if (!crawler.snapshotSummary.hasSnapshot) {
          setSourceOptionsError(
            'The assigned metadata crawler has no successful snapshot. Run it first.',
          );
          return;
        }
        setSourceCrawlerId(crawler.id);
        const page = await controllers.sourceMetadata.listNamespaces(crawler.id, {
          page: 1,
          pageSize: 200,
          sortBy: 'name',
          sortDirection: 'asc',
        });
        if (!isCurrentRequestToken(sourceNamespaceRequest.current, token)) return;
        const namespaces = page.items.filter((namespace) => namespace.type === 'SCHEMA');
        setSourceNamespaces(new Map(namespaces.map((namespace) => [namespace.id, namespace])));
        setSourceNamespaceOptions(
          namespaces
            .map((namespace) => ({ label: namespace.name, value: namespace.id }))
            .sort(compareOptions),
        );
        if (namespaces.length === 0) {
          setSourceOptionsError('The crawler snapshot contains no current PostgreSQL schemas.');
        } else if (selectedNamespaceId) {
          if (!namespaces.some(({ id }) => id === selectedNamespaceId)) {
            setSourceOptionsError('The selected metadata schema is stale or has been deleted.');
          } else {
            await loadSourceRelations(crawler.id, selectedNamespaceId, selectedRelationId);
          }
        }
      } catch (error) {
        if (isCurrentRequestToken(sourceNamespaceRequest.current, token)) {
          setSourceOptionsError(
            contextualErrorMessage(error, 'Metadata crawler options could not be loaded.'),
          );
        }
      } finally {
        if (isCurrentRequestToken(sourceNamespaceRequest.current, token)) {
          setIsLoadingSourceDatabases(false);
        }
      }
    },
    [controllers, loadSourceRelations],
  );

  const clearTargetOptions = useCallback(() => {
    targetDatabaseRequest.current += 1;
    targetTableRequest.current += 1;
    setTargetDatabaseOptions([]);
    setTargetTableOptions([]);
    setTargetOptionsError(undefined);
    setIsLoadingTargetDatabases(false);
    setIsLoadingTargetTables(false);
  }, []);

  const loadTargetTables = useCallback(
    async (resourceId: string | undefined, databaseName: string) => {
      const catalog = targetCatalogName(resourceId);
      const token = ++targetTableRequest.current;
      setTargetTableOptions([]);
      if (!catalog || databaseName.trim().length === 0) {
        setIsLoadingTargetTables(false);
        return;
      }
      setIsLoadingTargetTables(true);
      setTargetOptionsError(undefined);
      try {
        const tables = await controllers.listTables(catalog, databaseName);
        if (isCurrentRequestToken(targetTableRequest.current, token)) {
          setTargetTableOptions(
            tables
              .filter((table) => table.tableType === 'BASE TABLE')
              .map((table) => ({ label: table.name, value: table.name }))
              .sort(compareOptions),
          );
        }
      } catch (error) {
        if (isCurrentRequestToken(targetTableRequest.current, token)) {
          setTargetOptionsError(contextualErrorMessage(error, t('pipeline.targetOptionsError')));
        }
      } finally {
        if (isCurrentRequestToken(targetTableRequest.current, token)) {
          setIsLoadingTargetTables(false);
        }
      }
    },
    [controllers, t],
  );

  const loadTargetDatabases = useCallback(
    async (
      resourceId: string | undefined,
      selectedDatabase?: string,
      loadExistingTables = true,
      /**
       * A target writes into the database the canvas was opened from, so its
       * picker offers that one only. A source node is left unrestricted: reading
       * across databases is legitimate, and narrowing it would hide tables that
       * exist.
       */
      restrictTo?: string,
    ) => {
      const catalog = targetCatalogName(resourceId);
      const token = ++targetDatabaseRequest.current;
      setTargetDatabaseOptions([]);
      setTargetTableOptions([]);
      if (!catalog) {
        setIsLoadingTargetDatabases(false);
        return;
      }
      setIsLoadingTargetDatabases(true);
      setTargetOptionsError(undefined);
      try {
        const namespaces = await controllers.listNamespaces(catalog);
        if (!isCurrentRequestToken(targetDatabaseRequest.current, token)) {
          return;
        }
        setTargetDatabaseOptions(
          namespaces
            .filter((namespace) => !RESERVED_TARGET_DATABASES.has(namespace.name.toLowerCase()))
            .filter(
              (namespace) =>
                restrictTo === undefined ||
                namespace.name === restrictTo ||
                // A pipeline edited before this rule may target elsewhere.
                // Dropping its value would blank the picker and hide the drift.
                namespace.name === selectedDatabase,
            )
            .map((namespace) => ({ label: namespace.name, value: namespace.name }))
            .sort(compareOptions),
        );
        if (selectedDatabase && loadExistingTables) {
          await loadTargetTables(resourceId, selectedDatabase);
        }
      } catch (error) {
        if (isCurrentRequestToken(targetDatabaseRequest.current, token)) {
          setTargetOptionsError(contextualErrorMessage(error, t('pipeline.targetOptionsError')));
        }
      } finally {
        if (isCurrentRequestToken(targetDatabaseRequest.current, token)) {
          setIsLoadingTargetDatabases(false);
        }
      }
    },
    [controllers, loadTargetTables, t],
  );

  /** Every path that selects a node also prepares its dependent target options. */
  const selectNode = (nodeId?: string) => {
    dispatch({ type: 'node-selected', ...(nodeId ? { nodeId } : {}) });
    if (nodeId) {
      setActivePanel('properties');
      const selected = state?.graph.nodes.find((candidate) => candidate.id === nodeId);
      if (selected?.definitionType === 'ICEBERG_TARGET') {
        const databaseName =
          typeof selected.config.databaseName === 'string'
            ? selected.config.databaseName
            : undefined;
        void loadTargetDatabases(
          selected.resourceId,
          databaseName,
          targetTableMode(selected.config) === 'EXISTING',
          currentDatabase,
        );
        clearSourceOptions();
      } else if (selected?.definitionType === 'ICEBERG_SOURCE') {
        clearSourceOptions();
        void loadTargetDatabases(
          selected.resourceId,
          typeof selected.config.catalogDatabaseName === 'string'
            ? selected.config.catalogDatabaseName
            : undefined,
        );
      } else if (selected?.definitionType === 'POSTGRES_SOURCE') {
        clearTargetOptions();
        const databaseServiceId = sourceDatabaseServiceId(selected);
        if (databaseServiceId) {
          void loadSourceNamespaces(
            databaseServiceId,
            typeof selected.config.catalogNamespaceId === 'string'
              ? selected.config.catalogNamespaceId
              : undefined,
            typeof selected.config.catalogRelationId === 'string'
              ? selected.config.catalogRelationId
              : undefined,
          );
        } else {
          setSourceOptionsError('This source node is not bound to a data connection.');
        }
      } else {
        clearTargetOptions();
        clearSourceOptions();
      }
    } else {
      clearTargetOptions();
    }
  };

  useEffect(() => {
    let cancelled = false;

    controllers
      .get(pipelineId)
      .then((pipeline) => {
        if (!cancelled) {
          dispatch({ type: 'loaded', state: canvasStateFromPipeline(pipeline) });
          setLoadError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [controllers, pipelineId, reloadToken]);

  const loadGeneratedScript = useCallback(
    async (version: number) => {
      if (isLoadingScript) {
        return;
      }
      if (!state || state.baseline.graph.nodes.length === 0) {
        setScriptRequestedVersion(version);
        setGeneratedScript(undefined);
        setScriptError('Add nodes and save the pipeline before generating PySpark source.');
        return;
      }
      setScriptRequestedVersion(version);
      setIsLoadingScript(true);
      setScriptError(undefined);
      try {
        setGeneratedScript(await controllers.getScript(pipelineId, version));
      } catch (error) {
        setScriptError(
          contextualErrorMessage(error, 'The generated PySpark source could not be loaded.'),
        );
      } finally {
        setIsLoadingScript(false);
      }
    },
    [controllers, isLoadingScript, pipelineId, state],
  );

  useEffect(() => {
    const timer = setTimeout(() => setAppliedKeyword(paletteKeyword.trim()), PALETTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [paletteKeyword]);

  useEffect(() => {
    let cancelled = false;

    controllers
      .loadPalette(appliedKeyword || undefined)
      .then((groups) => {
        if (cancelled) {
          return;
        }
        setPaletteGroups(groups);
        // Definitions accumulate: a keyword search narrows the palette, and the
        // nodes already on the canvas must keep their labels and ports.
        setDefinitionsByResource((current) => {
          const merged = new Map(current);
          for (const group of groups) {
            for (const definition of group.definitions) {
              merged.set(definition.resourceId, definition);
            }
          }
          return merged;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPaletteGroups([]);
          setFeedback({ kind: 'error', message: 'The node catalogue could not be loaded.' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [controllers, appliedKeyword]);

  const loadDefinition = useCallback(
    async (nodeType: string): Promise<NodeDefinitionViewModel | undefined> => {
      const cached = definitionsByType.get(nodeType);
      if (cached) {
        return cached;
      }
      try {
        const definition = await controllers.getDefinition(nodeType);
        setDefinitionsByType((current) => new Map(current).set(nodeType, definition));
        setDefinitionErrors((current) => {
          if (!current.has(nodeType)) return current;
          const next = new Map(current);
          next.delete(nodeType);
          return next;
        });
        return definition;
      } catch (error) {
        setDefinitionErrors((current) =>
          new Map(current).set(
            nodeType,
            contextualErrorMessage(error, `The definition for ${nodeType} could not be loaded.`),
          ),
        );
        // Selecting the node again retries. The guard exists to stop two
        // panels racing for the same definition, not to make one failure
        // permanent until the page reloads.
        definitionRequests.current.delete(nodeType);
        return undefined;
      }
    },
    [controllers, definitionsByType],
  );

  // The property panel needs the full definition of whichever node is selected.
  useEffect(() => {
    if (!node || definitionsByType.has(node.definitionType)) {
      return;
    }
    if (definitionRequests.current.has(node.definitionType)) {
      return;
    }
    definitionRequests.current.add(node.definitionType);
    void loadDefinition(node.definitionType);
  }, [node, definitionsByType, loadDefinition]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  /** Every graph edit invalidates the last validation banner. */
  const edit = useCallback((action: CanvasAction) => {
    setFeedback(undefined);
    dispatch(action);
  }, []);

  const issueCounts = useMemo(() => {
    const grouped = nodeIssuesById(state?.issues ?? []);
    return new Map(
      [...grouped].map(([nodeId, issues]) => [
        nodeId,
        {
          errors: issues.filter((issue) => issue.severity !== 'WARNING').length,
          warnings: issues.filter((issue) => issue.severity === 'WARNING').length,
        },
      ]),
    );
  }, [state?.issues]);

  const validationSummary = useMemo(
    () => ({
      errors: (state?.issues ?? []).filter((issue) => issue.severity !== 'WARNING').length,
      warnings: (state?.issues ?? []).filter((issue) => issue.severity === 'WARNING').length,
    }),
    [state?.issues],
  );

  const selectedIssues = useMemo<readonly PipelineValidationIssue[]>(
    () => (state?.issues ?? []).filter((issue) => issue.nodeId === state?.selectedNodeId),
    [state?.issues, state?.selectedNodeId],
  );

  const upstreamFieldOptions = useMemo<readonly NodePropertyOption[] | undefined>(() => {
    if (!state || !node || nodeDefinition?.category !== 'TRANSFORM') return undefined;
    const incoming = state.graph.edges.find((edge) => edge.targetNodeId === node.id);
    const schema = incoming ? nodeSchemas[incoming.sourceNodeId] : undefined;
    if (schema?.status !== 'KNOWN') return [];
    return schema.columns.map((column) => ({
      value: column.name,
      label: `${column.name} · ${column.dataType}${column.nullable ? '' : ' · required'}`,
      dataType: column.dataType,
      nullable: column.nullable,
    }));
  }, [node, nodeDefinition?.category, nodeSchemas, state]);

  const validationGraph = state?.graph;
  const semanticGraphKey = useMemo(
    () =>
      validationGraph
        ? JSON.stringify({
            nodes: validationGraph.nodes.map(({ id, definitionType, resourceId, config }) => ({
              id,
              definitionType,
              resourceId,
              config,
            })),
            edges: validationGraph.edges,
          })
        : '',
    [validationGraph],
  );

  useEffect(() => {
    if (!validationGraph || validationGraph.nodes.length === 0) return;
    const token = ++graphValidationRequest.current;
    const timer = window.setTimeout(() => {
      void controllers
        .validateGraph(validationGraph)
        .then((result) => {
          if (!isCurrentRequestToken(graphValidationRequest.current, token)) return;
          setNodeSchemas(result.nodeSchemas ?? {});
          dispatch({ type: 'validated', issues: validationIssues(result) });
        })
        .catch(() => {
          if (isCurrentRequestToken(graphValidationRequest.current, token)) setNodeSchemas({});
        });
    }, GRAPH_VALIDATION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [controllers, semanticGraphKey, validationGraph]);

  const addDefinition = async (resourceId: string, position: PipelinePosition) => {
    const summary = definitionsByResource.get(resourceId);
    if (!summary) {
      return;
    }
    const definition = await loadDefinition(summary.type);
    const addedNode = {
      id: crypto.randomUUID(),
      definitionType: summary.type,
      resourceId: summary.resourceId,
      position,
      config: {
        ...(definition ? defaultConfigFromPanel(definition.propertyPanel) : {}),
        ...(summary.source ? { connectionId: summary.source.connectionId } : {}),
        // A target added here writes into the database this canvas belongs to;
        // leaving it blank asks a question that has one answer.
        ...(summary.type === 'ICEBERG_TARGET' ? { databaseName: currentDatabase } : {}),
      },
    };
    edit({ type: 'node-added', node: addedNode });
    setActivePanel('properties');
    if (summary.type === 'ICEBERG_TARGET') {
      void loadTargetDatabases(summary.resourceId, currentDatabase, false, currentDatabase);
      clearSourceOptions();
    } else if (summary.type === 'POSTGRES_SOURCE') {
      clearTargetOptions();
      const databaseServiceId = sourceDatabaseServiceId(addedNode);
      if (databaseServiceId) {
        void loadSourceNamespaces(databaseServiceId);
      }
    } else if (summary.type === 'ICEBERG_SOURCE') {
      clearSourceOptions();
      void loadTargetDatabases(summary.resourceId);
    } else {
      clearTargetOptions();
      clearSourceOptions();
    }
  };

  const changeNodeConfig = (change: Readonly<Record<string, unknown>>) => {
    if (!node) {
      return;
    }
    if (node.definitionType === 'ICEBERG_TARGET' && typeof change.databaseName === 'string') {
      const databaseName = change.databaseName;
      edit({
        type: 'node-config-changed',
        nodeId: node.id,
        change: { databaseName, tableName: '', newTableName: '' },
      });
      if (targetTableMode(node.config) === 'EXISTING') {
        void loadTargetTables(node.resourceId, databaseName);
      } else {
        targetTableRequest.current += 1;
        setTargetTableOptions([]);
        setIsLoadingTargetTables(false);
      }
      return;
    }
    if (node.definitionType === 'ICEBERG_TARGET' && typeof change.tableMode === 'string') {
      edit({ type: 'node-config-changed', nodeId: node.id, change });
      if (change.tableMode === 'EXISTING' && typeof node.config.databaseName === 'string') {
        void loadTargetTables(node.resourceId, node.config.databaseName);
      } else {
        targetTableRequest.current += 1;
        setTargetTableOptions([]);
        setIsLoadingTargetTables(false);
      }
      return;
    }
    if (
      node.definitionType === 'ICEBERG_SOURCE' &&
      typeof change.catalogDatabaseName === 'string'
    ) {
      edit({
        type: 'node-config-changed',
        nodeId: node.id,
        change: { catalogDatabaseName: change.catalogDatabaseName, catalogTableName: '' },
      });
      void loadTargetTables(node.resourceId, change.catalogDatabaseName);
      return;
    }
    if (
      node.definitionType === 'POSTGRES_SOURCE' &&
      typeof change.catalogNamespaceId === 'string'
    ) {
      edit({
        type: 'node-config-changed',
        nodeId: node.id,
        change: {
          catalogNamespaceId: change.catalogNamespaceId,
          catalogRelationId: '',
        },
      });
      if (sourceCrawlerId) {
        void loadSourceRelations(sourceCrawlerId, change.catalogNamespaceId);
      }
      return;
    }
    if (node.definitionType === 'POSTGRES_SOURCE' && typeof change.catalogRelationId === 'string') {
      const relation = sourceRelations.get(change.catalogRelationId);
      const namespace = relation ? sourceNamespaces.get(relation.namespaceId) : undefined;
      if (!relation || !namespace) return;
      edit({
        type: 'node-config-changed',
        nodeId: node.id,
        change: {
          ...(sourceDatabaseServiceId(node)
            ? { connectionId: sourceDatabaseServiceId(node), sourceMode: 'DIRECT' }
            : {}),
          catalogRelationId: change.catalogRelationId,
          schemaName: namespace.name,
          tableName: relation.name,
        },
      });
      return;
    }
    edit({ type: 'node-config-changed', nodeId: node.id, change });
  };

  const connectPorts = async (connection: Connection) => {
    if (!state || !connection.source || !connection.target) {
      return;
    }
    const edge = {
      id: crypto.randomUUID(),
      sourceNodeId: connection.source,
      sourcePortId: connection.sourceHandle ?? 'output',
      targetNodeId: connection.target,
      targetPortId: connection.targetHandle ?? 'input',
    };

    try {
      const result = await controllers.validateEdge(state.graph, edge);
      if (result.valid) {
        edit({ type: 'edge-added', edge });
        return;
      }
      setFeedback({
        kind: 'error',
        message: result.errors[0]?.message ?? 'That connection is not allowed.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: contextualErrorMessage(error, 'The connection could not be checked.'),
      });
    }
  };

  const save = async () => {
    if (!state || isSaving) {
      return;
    }
    if (!state.name.trim()) {
      setFeedback({ kind: 'error', message: 'Give this pipeline a name.' });
      return;
    }

    setSavePhase('CHECKING');
    setFeedback(undefined);
    try {
      const validation = await controllers.validateGraph(state.graph);
      setNodeSchemas(validation.nodeSchemas ?? {});
      dispatch({ type: 'validated', issues: validationIssues(validation) });
      if (!validation.valid) {
        setActivePanel('issues');
        setFeedback({
          kind: 'error',
          message: `${validation.errors.length} ${validation.errors.length === 1 ? 'issue makes' : 'issues make'} the generated script ineligible. Correct ${validation.errors.length === 1 ? 'it' : 'them'} before saving.`,
        });
        return;
      }
      setSavePhase('SAVING');
      const saved = await controllers.save(state.pipelineId, {
        name: state.name.trim(),
        ...(state.description.trim() ? { description: state.description.trim() } : {}),
        graph: state.graph,
        version: state.version,
      });
      dispatch({ type: 'saved', pipeline: saved });
      setFeedback({
        kind: 'success',
        message:
          validation.warnings.length === 0
            ? `Saved as version ${saved.version}. Generated PySpark eligibility passed.`
            : `Saved as version ${saved.version}. Eligibility passed; ${runtimeCheckLabel(validation.warnings.length)} will be completed by Spark when the pipeline runs.`,
      });
    } catch (error) {
      const message = contextualErrorMessage(error, 'The pipeline could not be saved.');
      if (/version/iu.test(message)) {
        setConflict(message);
      } else {
        setFeedback({ kind: 'error', message });
      }
    } finally {
      setSavePhase('IDLE');
    }
  };

  const validate = async () => {
    if (!state || isValidating) {
      return;
    }
    setIsValidating(true);
    setFeedback(undefined);
    try {
      const result = await controllers.validateGraph(state.graph);
      setNodeSchemas(result.nodeSchemas ?? {});
      const issues = validationIssues(result);
      dispatch({ type: 'validated', issues });
      if (issues.length > 0) {
        setActivePanel('issues');
      }
      setFeedback(
        result.valid
          ? {
              kind: 'success',
              message:
                result.warnings.length === 0
                  ? 'The graph is valid and ready to save or run.'
                  : `The graph is valid. ${runtimeCheckLabel(result.warnings.length)} will be completed by Spark using live data; ${result.warnings.length === 1 ? 'it does' : 'they do'} not block Save or Run.`,
            }
          : {
              kind: 'error',
              message: `${result.errors.length} ${result.errors.length === 1 ? 'issue' : 'issues'} must be resolved before this pipeline can run.`,
            },
      );
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: contextualErrorMessage(error, 'The graph could not be validated.'),
      });
    } finally {
      setIsValidating(false);
    }
  };

  const run = async () => {
    if (!state || isRunning) {
      return;
    }
    if (isDirty) {
      setFeedback({
        kind: 'error',
        message: 'Save this pipeline before running so the executed version matches the canvas.',
      });
      return;
    }

    setIsRunning(true);
    setFeedback(undefined);
    try {
      const validation = await controllers.validateGraph(state.graph);
      const issues = validationIssues(validation);
      dispatch({ type: 'validated', issues });
      if (!validation.valid) {
        setActivePanel('issues');
        setFeedback({
          kind: 'error',
          message: `${validation.errors.length} ${validation.errors.length === 1 ? 'issue' : 'issues'} must be resolved before this pipeline can run.`,
        });
        return;
      }

      const accepted = await controllers.run(state.pipelineId, state.version);
      router.push(`/executions?executionId=${encodeURIComponent(accepted.executionId)}`);
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: contextualErrorMessage(error, 'The pipeline could not be compiled and queued.'),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const previewNode = async () => {
    if (!state || !node || isPreviewing) {
      return;
    }
    setIsPreviewing(true);
    setPreview(undefined);
    setPreviewError(undefined);
    try {
      setPreview(
        await controllers.preview(state.pipelineId, node.id, {
          pipelineVersion: state.version,
          limit: PREVIEW_ROW_LIMIT,
        }),
      );
    } catch (error) {
      setPreviewError(contextualErrorMessage(error, 'The node could not be previewed.'));
    } finally {
      setIsPreviewing(false);
    }
  };

  if (loadError) {
    return (
      <section className="grid h-full place-items-center content-center gap-5 p-6">
        <Breadcrumb databaseName={currentDatabase} name="Flow canvas" />
        <Card className="grid place-items-center gap-4 p-10 text-center">
          <h1 className="m-0 text-heading-3 font-medium tracking-[-0.02em]">
            This pipeline could not be loaded
          </h1>
          <p className="max-w-[440px] text-body-sm leading-[1.6] text-muted-foreground">
            {LOAD_FALLBACK} It may have been archived, or the Core API may be unavailable.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setReloadToken((token) => token + 1)}>
              Retry
            </Button>
            <Link
              className="inline-flex min-h-[42px] items-center rounded-md bg-primary px-[15px] text-body-sm font-semibold text-primary-foreground no-underline"
              href={databaseTabHref(currentDatabase, 'pipelines')}
            >
              Back to pipelines
            </Link>
          </div>
        </Card>
      </section>
    );
  }

  if (!state) {
    return (
      <section className="grid h-full place-items-center content-center gap-5 p-6">
        <Breadcrumb databaseName={currentDatabase} name="Flow canvas" />
        <Card
          className="gap-0 py-0 grid min-h-[420px] w-full max-w-[560px] place-items-center content-center"
          role="status"
        >
          <Spinner className="size-7 text-primary" />
          <strong className="text-body-sm">Loading pipeline…</strong>
        </Card>
      </section>
    );
  }

  return (
    <section className="relative h-full min-h-[560px] overflow-hidden bg-muted">
      <div className="absolute inset-0">
        {activeView === 'visual' ? (
          <FlowCanvas
            graph={state.graph}
            definitions={definitionsByResource}
            issueCounts={issueCounts}
            {...(state.selectedNodeId ? { selectedNodeId: state.selectedNodeId } : {})}
            disabled={isBusy}
            onMoveNode={(nodeId, position) => edit({ type: 'node-moved', nodeId, position })}
            onRemoveNode={(nodeId) => edit({ type: 'node-removed', nodeId })}
            onRemoveEdge={(edgeId) => edit({ type: 'edge-removed', edgeId })}
            onSelectNode={(nodeId) => selectNode(nodeId)}
            onConnectPorts={(connection) => void connectPorts(connection)}
            onDropDefinition={(resourceId, position) => void addDefinition(resourceId, position)}
          />
        ) : null}
      </div>

      {/* Overlays sit in a pointer-events-none column so the canvas keeps every
          pan, zoom and drop gesture in the gaps between them. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
        <div className={cn(floatingSurfaceClass, 'pointer-events-auto flex-none px-3 py-2')}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Breadcrumb databaseName={currentDatabase} name={state.name || 'Untitled pipeline'} />

            <div
              aria-label="Pipeline workspace views"
              className="flex items-center rounded-lg bg-card p-1"
              role="tablist"
            >
              {(['visual', 'script'] as const).map((view) => (
                <button
                  aria-controls={`pipeline-${view}-view`}
                  aria-selected={activeView === view}
                  className={cn(
                    'min-h-7 rounded-md px-3 text-caption font-semibold capitalize',
                    activeView === view
                      ? 'bg-card text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  id={`pipeline-${view}-tab`}
                  key={view}
                  onClick={() => {
                    setActiveView(view);
                    if (
                      view === 'script' &&
                      scriptRequestedVersion !== state.version &&
                      !isLoadingScript
                    ) {
                      void loadGeneratedScript(state.version);
                    }
                  }}
                  role="tab"
                  type="button"
                >
                  {view}
                </button>
              ))}
            </div>

            <TextField
              autoComplete="off"
              className="w-[180px] min-[1081px]:w-[220px]"
              disabled={isBusy}
              maxLength={160}
              onChange={(event) => edit({ type: 'metadata-changed', name: event.target.value })}
              inputClassName="h-8"
              value={state.name}
              aria-label="Pipeline name"
            />
            <TextField
              autoComplete="off"
              className="min-w-[160px] flex-1"
              disabled={isBusy}
              maxLength={4000}
              placeholder="Description (optional)"
              inputClassName="h-8"
              value={state.description}
              aria-label="Description"
              onChange={(event) =>
                edit({ type: 'metadata-changed', description: event.target.value })
              }
            />

            <div className="flex flex-none flex-wrap items-center gap-2">
              <Badge variant="info">v{state.version}</Badge>
              {isDirty ? <Badge variant="warning">Unsaved changes</Badge> : null}
              <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void validate()}>
                {isValidating ? 'Validating…' : 'Validate'}
              </Button>
              <Button size="sm" disabled={isBusy || !isDirty} onClick={() => void save()}>
                {savePhase === 'CHECKING'
                  ? 'Checking eligibility…'
                  : savePhase === 'SAVING'
                    ? 'Saving…'
                    : 'Save'}
              </Button>
              <Button size="sm" disabled={isBusy || isDirty} onClick={() => void run()}>
                {isRunning ? 'Starting…' : 'Run'}
              </Button>
            </div>
          </div>
        </div>

        {feedback ? (
          <div className="pointer-events-auto flex-none">
            {feedback.kind === 'error' ? (
              <PageAlert dismissLabel="Dismiss message" onDismiss={() => setFeedback(undefined)}>
                {feedback.message}
              </PageAlert>
            ) : (
              <div
                className="flex min-h-[48px] items-center justify-between gap-4 rounded-lg border border-primary/30 bg-status-success-light px-4 py-[11px] text-body-sm text-status-success-dark"
                role="status"
              >
                <span>{feedback.message}</span>
                <button
                  className="cursor-pointer border-0 bg-transparent text-title text-current"
                  type="button"
                  aria-label="Dismiss message"
                  onClick={() => setFeedback(undefined)}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        ) : null}

        {activeView === 'visual' ? (
          <div
            aria-labelledby="pipeline-visual-tab"
            // `relative` so the two panels can overlay the canvas below `md`
            // instead of standing beside it. They were both `w-full` flex
            // siblings there, so on a phone they shrink-fought each other and
            // covered the canvas completely — there was no mobile treatment.
            className="relative flex min-h-0 flex-1 items-stretch gap-3"
            id="pipeline-visual-view"
            role="tabpanel"
          >
            <aside
              aria-label="Node catalogue"
              className={cn(
                floatingSurfaceClass,
                'pointer-events-auto flex min-h-0 flex-col',
                paletteOpen
                  ? 'absolute inset-y-0 left-0 z-20 w-4/5 md:relative md:inset-auto md:z-auto md:w-[312px]'
                  : 'w-auto self-start',
              )}
            >
              <div className="flex flex-none items-center justify-between gap-2 border-b border-border px-2 py-1.5">
                {paletteOpen ? (
                  <strong className="pl-1 text-caption text-muted-foreground">Graph nodes</strong>
                ) : null}
                <button
                  aria-controls={paletteId}
                  aria-expanded={paletteOpen}
                  aria-label={paletteOpen ? 'Collapse node catalogue' : 'Expand node catalogue'}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setPaletteOpen((open) => !open)}
                  type="button"
                >
                  {paletteOpen ? <PanelLeftCloseIcon size={18} /> : <PanelLeftOpenIcon size={18} />}
                </button>
              </div>

              <div
                className={cn('min-h-0 flex-1 overflow-auto', paletteOpen ? 'block' : 'hidden')}
                id={paletteId}
              >
                <NodePalette
                  {...(paletteGroups ? { groups: paletteGroups } : {})}
                  databaseName={currentDatabase}
                  keyword={paletteKeyword}
                  disabled={isBusy}
                  onKeywordChange={setPaletteKeyword}
                  onAddDefinition={(resourceId) =>
                    void addDefinition(resourceId, nextNodePosition(state.graph.nodes.length))
                  }
                />
              </div>
            </aside>

            <div className="flex-1" />

            {activePanel ? (
              <aside
                aria-label={panelLabels[activePanel]}
                className={cn(
                  floatingSurfaceClass,
                  'pointer-events-auto flex min-h-0 flex-col',
                  'absolute inset-y-0 right-0 z-20 w-4/5 md:relative md:inset-auto md:z-auto md:w-[340px]',
                )}
              >
                <div className="flex flex-none items-center justify-between gap-2 border-b border-border px-3 py-1.5">
                  <strong className="text-caption text-muted-foreground">
                    {panelLabels[activePanel]}
                  </strong>
                  <button
                    aria-label="Close panel"
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => setActivePanel(undefined)}
                    type="button"
                  >
                    <XIcon size={18} />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  {activePanel === 'properties' ? (
                    <NodePropertyPanel
                      {...(node ? { node } : {})}
                      {...(nodeDefinition ? { definition: nodeDefinition } : {})}
                      {...(node && definitionErrors.has(node.definitionType)
                        ? { definitionError: definitionErrors.get(node.definitionType) as string }
                        : {})}
                      {...(targetOptionsError || sourceOptionsError
                        ? { propertyOptionsError: targetOptionsError ?? sourceOptionsError }
                        : {})}
                      fieldOptions={{
                        databaseName: targetDatabaseOptions,
                        tableName: targetTableOptions,
                        catalogNamespaceId: sourceNamespaceOptions,
                        catalogRelationId: sourceRelationOptions,
                        catalogDatabaseName: targetDatabaseOptions,
                        catalogTableName: targetTableOptions,
                        ...(upstreamFieldOptions === undefined
                          ? {}
                          : {
                              fields: upstreamFieldOptions,
                              sourceField: upstreamFieldOptions,
                              field: upstreamFieldOptions,
                              matchFields: upstreamFieldOptions,
                              orderBy: upstreamFieldOptions,
                              conditions: upstreamFieldOptions,
                              mappings: upstreamFieldOptions,
                              groupBy: upstreamFieldOptions,
                              aggregations: upstreamFieldOptions,
                            }),
                      }}
                      loadingFields={
                        new Set([
                          ...(isLoadingTargetDatabases ? ['databaseName'] : []),
                          ...(isLoadingTargetTables ? ['tableName'] : []),
                          ...(isLoadingSourceDatabases ? ['catalogNamespaceId'] : []),
                          ...(isLoadingSourceTables ? ['catalogRelationId'] : []),
                          ...(isLoadingTargetDatabases ? ['catalogDatabaseName'] : []),
                          ...(isLoadingTargetTables ? ['catalogTableName'] : []),
                        ])
                      }
                      issues={selectedIssues}
                      disabled={isBusy}
                      isPreviewing={isPreviewing}
                      canPreview={!isDirty}
                      onConfigChange={changeNodeConfig}
                      onRemove={() =>
                        node ? edit({ type: 'node-removed', nodeId: node.id }) : undefined
                      }
                      onPreview={() => void previewNode()}
                    />
                  ) : null}

                  {activePanel === 'issues' ? (
                    state.issues.length > 0 ? (
                      <div className="grid gap-3 p-3">
                        {validationSummary.errors === 0 && validationSummary.warnings > 0 ? (
                          <p className="m-0 rounded-lg border border-status-warning/40 bg-status-warning-light px-[11px] py-[9px] text-caption leading-[1.5] text-status-warning-dark">
                            Ready to save and run. Spark must inspect live rows to finish these
                            schema checks during execution.
                          </p>
                        ) : null}
                        {/* Grouped and ordered by what can be done first. Core
                         * returns the rule that fired, one row each; a source
                         * with no relation chosen fires three of them, and the
                         * scan that would make them fixable is reported last. */}
                        <ul className="grid list-none gap-[7px] p-0">
                          {groupValidationIssues(state.issues).map((group) => {
                            const warning = group.severity === 'WARNING';
                            return (
                              <li
                                className={cn(
                                  'grid gap-1.5 rounded-lg border px-[11px] py-[9px] text-caption leading-[1.5]',
                                  warning
                                    ? 'border-status-warning/40 bg-status-warning-light text-status-warning-dark'
                                    : 'border-destructive/30 bg-destructive/10 text-destructive',
                                )}
                                key={group.key}
                              >
                                <strong className="text-micro uppercase">
                                  {warning ? 'Runtime schema check' : 'Blocking issue'}
                                </strong>
                                {group.messages.length === 1 ? (
                                  <span>{group.messages[0]}</span>
                                ) : (
                                  <ul className="m-0 grid list-disc gap-1 py-0 pr-0 pl-4">
                                    {group.messages.map((message) => (
                                      <li key={message}>{message}</li>
                                    ))}
                                  </ul>
                                )}
                                <span className="flex flex-wrap items-baseline gap-3">
                                  {group.nodeId ? (
                                    <button
                                      className="cursor-pointer border-0 bg-transparent p-0 text-micro font-semibold text-primary underline"
                                      type="button"
                                      onClick={() => selectNode(group.nodeId as string)}
                                    >
                                      Show node
                                    </button>
                                  ) : null}
                                  {/* The one fix that is not on this screen. */}
                                  {group.needsMetadata ? (
                                    <Link
                                      className="text-micro font-semibold text-primary underline"
                                      href="/metadata-crawler"
                                    >
                                      Assign a scan
                                    </Link>
                                  ) : null}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : (
                      <p className="p-4 text-caption leading-[1.6] text-muted-foreground">
                        Press Validate to check this graph.
                      </p>
                    )
                  ) : null}
                </div>
              </aside>
            ) : null}

            <nav
              aria-label="Canvas panels"
              className={cn(
                floatingSurfaceClass,
                'pointer-events-auto flex h-auto flex-none flex-col gap-1 self-start p-1',
              )}
            >
              {canvasPanels.map((panel) => {
                const PanelIcon = panel.icon;
                const active = activePanel === panel.id;

                return (
                  <button
                    aria-label={panelLabels[panel.id]}
                    aria-pressed={active}
                    className={cn(
                      'relative grid size-9 place-items-center rounded-lg',
                      active
                        ? 'bg-accent text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                    key={panel.id}
                    onClick={() => setActivePanel(active ? undefined : panel.id)}
                    type="button"
                  >
                    <PanelIcon size={20} />
                    {panel.id === 'issues' && state.issues.length > 0 ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute top-1 right-1 size-2 rounded-full',
                          validationSummary.errors > 0 ? 'bg-destructive' : 'bg-status-warning',
                        )}
                      />
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>
        ) : (
          <div
            aria-labelledby="pipeline-script-tab"
            className="flex min-h-0 flex-1"
            id="pipeline-script-view"
            role="tabpanel"
          >
            <PipelineScriptPanel
              pipelineName={state.name}
              version={state.version}
              {...(generatedScript?.versionNumber === state.version
                ? { script: generatedScript }
                : {})}
              {...(scriptError ? { error: scriptError } : {})}
              loading={isLoadingScript}
              showingSavedVersion={isDirty}
              onReload={() => void loadGeneratedScript(state.version)}
            />
          </div>
        )}

        {activeView === 'visual' && (preview || previewError) ? (
          <div
            className={cn(
              floatingSurfaceClass,
              'pointer-events-auto max-h-[45%] flex-none overflow-auto',
            )}
          >
            <NodePreviewPanel
              {...(preview ? { preview } : {})}
              {...(previewError ? { error: previewError } : {})}
              onDismiss={() => {
                setPreview(undefined);
                setPreviewError(undefined);
              }}
            />
          </div>
        ) : null}
      </div>

      {conflict ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setConflict(undefined);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-title font-medium tracking-[-0.02em]">
                This pipeline changed elsewhere
              </DialogTitle>
            </DialogHeader>
            <p className="mb-6 text-body-sm leading-[1.6] text-muted-foreground">
              {conflict} Reloading replaces the canvas with the saved graph and discards the changes
              made here.
            </p>
            <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="outline" onClick={() => setConflict(undefined)}>
                Keep editing
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConflict(undefined);
                  setReloadToken((token) => token + 1);
                }}
              >
                Reload saved version
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

function Breadcrumb({
  databaseName,
  name,
}: {
  readonly databaseName: string;
  readonly name: string;
}) {
  return (
    <nav
      className="flex items-center gap-2 text-caption text-muted-foreground"
      aria-label="Breadcrumb"
    >
      {/* Back to the list this pipeline is in, not to the database's default
       * tab: the visitor came from Pipelines and expects to land there. */}
      <Link
        className="font-semibold text-primary no-underline hover:underline"
        href={databaseTabHref(databaseName, 'pipelines')}
      >
        {databaseName}
      </Link>
      <span aria-hidden="true">/</span>
      <span className="wrap-anywhere">{name}</span>
    </nav>
  );
}

/** Staggers nodes added from the palette so they never land on top of each other. */
function nextNodePosition(count: number): PipelinePosition {
  return { x: 80 + (count % 5) * 70, y: 80 + Math.floor(count / 5) * 90 };
}

const RESERVED_TARGET_DATABASES = new Set(['system', 'information_schema']);

function targetCatalogName(resourceId: string | undefined): string | undefined {
  const prefix = resourceId?.startsWith('iceberg-source:')
    ? 'iceberg-source:'
    : resourceId?.startsWith('iceberg:')
      ? 'iceberg:'
      : undefined;
  if (!prefix || !resourceId) {
    return undefined;
  }
  const catalog = resourceId.slice(prefix.length).split('.')[0]?.trim();
  return catalog ? catalog : undefined;
}

function sourceDatabaseServiceId(node: PipelineNode): string | undefined {
  if (node.resourceId?.startsWith('connection:')) {
    const value = node.resourceId.slice('connection:'.length).trim();
    return value || undefined;
  }
  return typeof node.config.connectionId === 'string' && node.config.connectionId.trim()
    ? node.config.connectionId
    : undefined;
}

function compareOptions(left: NodePropertyOption, right: NodePropertyOption): number {
  return left.label.localeCompare(right.label);
}

function targetTableMode(config: Readonly<Record<string, unknown>>): 'CREATE_NEW' | 'EXISTING' {
  return config.tableMode === 'CREATE_NEW' ? 'CREATE_NEW' : 'EXISTING';
}
