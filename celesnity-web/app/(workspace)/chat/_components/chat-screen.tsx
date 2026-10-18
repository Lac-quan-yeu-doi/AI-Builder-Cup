'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { IconButton } from '@/app/_components/ui/icon-button';
import {
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  Table2Icon,
  FolderTreeIcon,
  InfoIcon,
  SquarePenIcon,
  UploadIcon,
  VideoIcon,
} from 'lucide-react';

import { ChartIcon, PanelLeftOpenIcon, WorkflowIcon } from '@/app/_components/ui/icons';
import { ThinkingOrb } from '@/app/_components/ui/thinking-orb';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { ManageChatController } from '@/src/interface-adapters/controllers/chat/manage-chat.controller';
import type { ListMessageBlockHistoryController } from '@/src/interface-adapters/controllers/message-blocks/list-message-block-history.controller';
import type { SubscribeMessageBlocksController } from '@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller';

import type { ListChartsController } from '@/src/interface-adapters/controllers/charts/list-charts.controller';
import type { SubscribeChartsController } from '@/src/interface-adapters/controllers/charts/subscribe-charts.controller';
import type { CreateChartController } from '@/src/interface-adapters/controllers/charts/create-chart.controller';
import type { PatchChartController } from '@/src/interface-adapters/controllers/charts/patch-chart.controller';
import type { DeleteChartController } from '@/src/interface-adapters/controllers/charts/delete-chart.controller';
import type { SetChartDataFromCsvController } from '@/src/interface-adapters/controllers/charts/set-chart-data-from-csv.controller';
import type { SuggestChartEncodingsController } from '@/src/interface-adapters/controllers/charts/suggest-chart-encodings.controller';
import type { ListQueryCatalogsController } from '@/src/interface-adapters/controllers/queries/list-query-catalogs.controller';
import type { MonitorQueryController } from '@/src/interface-adapters/controllers/queries/monitor-query.controller';
import type { SubmitQueryController } from '@/src/interface-adapters/controllers/queries/submit-query.controller';
import type { ListPendingActionsController } from '@/src/interface-adapters/controllers/pending-actions/list-pending-actions.controller';
import type { ApprovePendingActionController } from '@/src/interface-adapters/controllers/pending-actions/approve-pending-action.controller';
import type { RejectPendingActionController } from '@/src/interface-adapters/controllers/pending-actions/reject-pending-action.controller';
import type { ResolveCitationsController } from '@/src/interface-adapters/controllers/citations/resolve-citations.controller';
import type { ListWorkspaceTreeController } from '@/src/interface-adapters/controllers/workspace-tree/list-workspace-tree.controller';
import type { GetWorkspaceFileContentController } from '@/src/interface-adapters/controllers/workspace-tree/get-workspace-file-content.controller';
import type { ListAgentManifestsController } from '@/src/interface-adapters/controllers/agent-manifests/list-agent-manifests.controller';
import type { AgentManifestSummary } from '@/src/entities/models/agent-manifest';
import type { PlantSiteSummary } from '@/src/entities/models/plant-model';

import {
  ChatComposer,
  type ComposerTool,
} from '@/app/_components/chat/chat-composer';
import { ChatDatabasePicker } from './chat-database-picker';
import {
  ChatLanding,
  type ChatConnectionStatus,
  type LandingShortcut,
} from '@/app/_components/chat/chat-landing';
import { ChatMessageList } from '@/app/_components/chat/chat-message-list';
import { READING_COLUMN } from '@/app/_components/chat/reading-column';
import { ConversationsMenu } from './conversations-menu';
import { useChatSessionsStore } from '@/app/_stores/chat-sessions.store';
import { useCurrentUserId } from '@/app/_providers/current-user-provider';

/* Actions read off the store rather than selected: an action's identity never
 * changes, but a selected one is a reactive value that every callback below
 * would have to list. Reaching through `getState` keeps them out of the graph
 * while still calling the current implementation. */
const setSessions: ReturnType<typeof useChatSessionsStore.getState>['setSessions'] = (updater) =>
  useChatSessionsStore.getState().setSessions(updater);
const setActiveSessionId = (id: string | null): void =>
  useChatSessionsStore.getState().setActiveSessionId(id);
const hydrateSessions = (userId: string): void => useChatSessionsStore.getState().hydrate(userId);
import { ChatTimelineRail } from './chat-timeline-rail';
import {
  useChatConversation,
  type ChatConversationStore,
} from '@/app/_components/chat/use-chat-conversation';
import type { ChatSession, MessageBlock } from '@/app/_components/chat/types';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/app/_components/ui/resizable';
import { EMPTY_STAGE, stageReducer } from './stage/chat-stage.reducer';
import { ChatStageShell } from './stage/chat-stage-shell';
import type { Artifact } from './stage/chat-stage.types';
import type { WorkspaceChange } from '@/src/entities/models/workspace-tree';
import { chartsArtifact, ChartPane } from './stage/chart-pane';
import { runArtifact, TerminalPane } from './stage/terminal-pane';
import { agentInfoArtifact, DocumentPane } from './stage/document-pane';
import { applicationStateArtifact, TablePane } from './stage/table-pane';
import { automationsArtifact, AutomationPane } from './stage/automation-pane';
import { workspaceArtifact, WorkspaceTreePane } from './stage/workspace-tree-pane';
import { BlockPane } from './stage/block-pane';
import { blockArtifactId, messageBlockArtifact } from './stage/message-block-artifact';
import { decideAutoOpen, type AutoOpenMemory } from './stage/auto-open';
import { isArtifactBlock } from '@/app/_components/chat/message-block-content';
import { parseSystemReminderContent } from '@/app/_components/chat/system-reminder';
import type { KeptChart } from '@/app/_components/chat/artifact-keep';
import {
  formatMessageWithAttachments,
  type ChatAttachment,
} from '@/src/entities/models/chat-attachment';
import type { AutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';
import type { ListCanonicalChartsController } from '@/src/interface-adapters/controllers/canonical-charts/list-canonical-charts.controller';
import type { ListChartCollectionsController } from '@/src/interface-adapters/controllers/chart-collections/list-chart-collections.controller';
import type { GetCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/get-canonical-chart.controller';
import type { RunSavedCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/run-saved-canonical-chart.controller';
import type { CancelCanonicalChartRunController } from '@/src/interface-adapters/controllers/canonical-charts/cancel-canonical-chart-run.controller';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import type { SaveChatChartPreviewController } from '@/src/interface-adapters/controllers/canonical-charts/save-chat-chart-preview.controller';
import { CanonicalChartSidebar } from './canonical-chart-sidebar';
import { ChatAgentPicker } from './chat-agent-picker';

function mergeWorkspaceChanges(
  current: readonly WorkspaceChange[],
  incoming: readonly WorkspaceChange[],
): readonly WorkspaceChange[] {
  const byPath = new Map(current.map((change) => [change.path, change]));
  for (const change of incoming) byPath.set(change.path, change);
  return [...byPath.values()];
}

interface ChatScreenProps {
  readonly controller: ManageChatController;
  readonly listAgentManifests?: ListAgentManifestsController;
  readonly listMessageBlockHistory: ListMessageBlockHistoryController;
  readonly subscribeMessageBlocks: SubscribeMessageBlocksController;
  readonly listCharts: ListChartsController;
  readonly subscribeCharts: SubscribeChartsController;
  readonly createChart?: CreateChartController;
  readonly patchChart?: PatchChartController;
  readonly deleteChart?: DeleteChartController;
  readonly setChartDataFromCsv?: SetChartDataFromCsvController;
  readonly submitQuery?: SubmitQueryController;
  readonly monitorQuery?: MonitorQueryController;
  readonly listQueryCatalogs?: ListQueryCatalogsController;
  readonly suggestChartEncodings?: SuggestChartEncodingsController;
  readonly listPendingActions: ListPendingActionsController;
  readonly approvePendingAction: ApprovePendingActionController;
  readonly rejectPendingAction: RejectPendingActionController;
  readonly resolveCitations: ResolveCitationsController;
  readonly listWorkspaceTree?: ListWorkspaceTreeController;
  readonly getWorkspaceFileContent?: GetWorkspaceFileContentController;
  readonly automationWorkflow?: AutomationWorkflowController;
  readonly listCanonicalCharts?: ListCanonicalChartsController;
  readonly listChartCollections?: ListChartCollectionsController;
  readonly getCanonicalChart?: GetCanonicalChartController;
  readonly runSavedCanonicalChart?: RunSavedCanonicalChartController;
  readonly cancelCanonicalChartRun?: CancelCanonicalChartRunController;
  readonly chartRenderer?: ChartRenderer;
  readonly saveChatPreview?: SaveChatChartPreviewController;
  /** Plants in the workspace, so home can link straight into one. */
  readonly listPlantSites?: () => Promise<readonly PlantSiteSummary[]>;
}

/**
 * The scope a run carries. Only the schema is named: the workspace has one
 * Iceberg catalog, and the agent reads an absent catalog as "any", so pinning
 * it here would add a value to keep in step for no gain.
 */
function dataScopeOf(database: string | null): { dataScope?: { schema: string } } {
  return database === null ? {} : { dataScope: { schema: database } };
}

function chatUrl(pathname: string, roomId: string): string {
  const params = new URLSearchParams({ chatId: roomId });
  return `${pathname}?${params.toString()}`;
}

function useNarrowChatLayout(): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 760px)');
    const update = (): void => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return narrow;
}

export function ChatScreen({
  controller,
  listAgentManifests,
  listMessageBlockHistory,
  subscribeMessageBlocks,
  listCharts,
  subscribeCharts,
  createChart,
  patchChart,
  deleteChart,
  setChartDataFromCsv,
  submitQuery,
  monitorQuery,
  listQueryCatalogs,
  suggestChartEncodings,
  listPendingActions,
  approvePendingAction,
  rejectPendingAction,
  resolveCitations,
  listWorkspaceTree,
  getWorkspaceFileContent,
  automationWorkflow,
  listCanonicalCharts,
  listChartCollections,
  getCanonicalChart,
  runSavedCanonicalChart,
  cancelCanonicalChartRun,
  chartRenderer,
  saveChatPreview,
  listPlantSites,
}: ChatScreenProps) {
  const { t } = useTranslation();
  const narrowChatLayout = useNarrowChatLayout();
  const userId = useCurrentUserId();
  const [availableAgents, setAvailableAgents] = useState<readonly AgentManifestSummary[] | null>(
    null,
  );
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);
  // Shared with the sidebar, which lists the same conversations; see
  // `app/_stores/chat-sessions.store.ts`. Only the values are selected — the
  // actions are module-level wrappers, so they never enter a dependency array
  // and the callbacks below keep the identities they had as local setters.
  const sessions = useChatSessionsStore((state) => state.sessions);
  const activeSessionId = useChatSessionsStore((state) => state.activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  // Manifest listing order is not an authorization or product default. The
  // configured general-chat agent must win over an unrelated workflow agent.
  const configuredGeneralAgent = process.env.NEXT_PUBLIC_CHAT_AGENT_NAME;
  const pendingAgentName =
    pendingAgent ??
    (configuredGeneralAgent
      ? (availableAgents?.find((agent) => agent.name === configuredGeneralAgent)?.name ?? null)
      : (availableAgents?.[0]?.name ?? null));
  const conversationAgentName = activeSession
    ? (activeSession.agentName ?? undefined)
    : (pendingAgentName ?? undefined);
  const sessionsHydrated = useChatSessionsStore((state) => state.hydrated);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Held separately until the first message creates the session that will own
  // it, so choosing a database before typing is not lost.
  const [pendingDatabase, setPendingDatabase] = useState<string | null>(null);
  const pendingDatabaseRef = useRef<string | null>(null);
  // A stable id for the not-yet-created session, so `useChatConversation`'s
  // `roomKey` (bound once per render, before `handleSend` can promote it into
  // a real session) already matches the id `handleSend` promotes on first
  // send. Regenerated (not reused) once promoted, for the next fresh chat.
  const [draftSessionId, setDraftSessionId] = useState(() => crypto.randomUUID());
  const [applicationState, setApplicationState] = useState<Record<string, unknown>>({});
  const [workspaceRefreshSignal, setWorkspaceRefreshSignal] = useState(0);
  const [workspaceChanges, setWorkspaceChanges] = useState<{
    readonly roomId: string;
    readonly changes: readonly WorkspaceChange[];
  } | null>(null);
  const activeWorkspaceChanges = useMemo(
    () =>
      workspaceChanges !== null && workspaceChanges.roomId === activeSession?.roomId
        ? workspaceChanges.changes
        : [],
    [activeSession?.roomId, workspaceChanges],
  );
  const [chartFocusRequest, setChartFocusRequest] = useState<{
    readonly chartId: string;
    readonly nonce: number;
  } | null>(null);
  const [chartsRefreshNonce, setChartsRefreshNonce] = useState(0);
  const [isCoreApiReachable, setIsCoreApiReachable] = useState<boolean | null>(null);
  const messageRowRefs = useRef(new Map<string, HTMLDivElement>());
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [attachments, setAttachments] = useState<readonly ChatAttachment[]>([]);
  const [firstPlantId, setFirstPlantId] = useState<string | null>(null);

  useEffect(() => {
    if (!listPlantSites) return;
    let active = true;
    void listPlantSites().then(
      (sites) => {
        if (active) setFirstPlantId(sites[0]?.id ?? null);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [listPlantSites]);

  /* Home is the workspace's front door, and the two plant flows are the ones
     that start from a video rather than a question. A repair belongs to a
     plant, so without one it opens the plant list instead. */
  const floorShortcuts = useMemo<readonly LandingShortcut[]>(
    () =>
      listPlantSites
        ? [
            {
              id: 'walk',
              href: '/plant-model/walkthrough',
              label: t('chat.landing.walk'),
              description: t('chat.landing.walk.desc'),
              icon: <UploadIcon size={16} />,
            },
            {
              id: 'repair',
              href:
                firstPlantId === null
                  ? '/plant-model'
                  : `/plant-model/${encodeURIComponent(firstPlantId)}/repairs/capture`,
              label: t('chat.landing.repair'),
              description: t('chat.landing.repair.desc'),
              icon: <VideoIcon size={16} />,
            },
          ]
        : [],
    [firstPlantId, listPlantSites, t],
  );

  const [openedRestoredBlocks, setOpenedRestoredBlocks] = useState<
    ReadonlyMap<string, MessageBlock>
  >(() => new Map());

  useEffect(() => {
    if (!listAgentManifests) return;
    let active = true;
    void listAgentManifests()
      .then((agents) => {
        if (active) setAvailableAgents(agents);
      })
      .catch(() => {
        if (active) setAvailableAgents([]);
      });
    return () => {
      active = false;
    };
  }, [listAgentManifests]);
  // Stage layout (open/split/focus/maximize panes) is interaction state
  // scoped to this screen — not needed by an unrelated route — so it's a
  // plain reducer, not a Zustand store (see skills/state-management).
  const [stage, dispatchStage] = useReducer(stageReducer, EMPTY_STAGE);

  /*
   * Every chart and table this conversation has produced, keyed by the id the
   * stage knows it as. Built from the transcript rather than a second store:
   * `MessageBlock` already carries a stable `id`, so the transcript is the
   * index and the stage only ever holds a reference into it.
   */
  const artifactBlocks = useMemo(() => {
    const byArtifactId = new Map<
      string,
      { block: MessageBlock; question: string | null; messageId: string }
    >();
    /*
     * The question is carried alongside the block because it is the one thing
     * chat knows that the chart builder does not, and it is worth writing onto
     * a chart that gets kept. It is the last thing the person said before the
     * turn that produced the artifact.
     */
    let question: string | null = null;
    for (const message of activeSession?.messages ?? []) {
      if (message.role === 'user') {
        const spoken = parseSystemReminderContent(message.content).content.trim();
        if (spoken.length > 0) question = spoken;
        continue;
      }
      for (const block of message.messageBlocks ?? []) {
        if (isArtifactBlock(block))
          byArtifactId.set(blockArtifactId(block.id), { block, question, messageId: message.id });
      }
    }
    return byArtifactId;
  }, [activeSession?.messages]);

  /* A tab pressed on the stage takes the transcript back to where that
     artifact was drawn: the card itself when it is on screen, else the
     answer it belongs to. */
  const scrollTranscriptToArtifact = useCallback(
    (artifact: Artifact) => {
      const entry = artifactBlocks.get(artifact.id);
      if (entry === undefined) return;
      const row = messageRowRefs.current.get(entry.messageId);
      const card = row?.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(entry.block.id)}"]`,
      );
      (card ?? row)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    [artifactBlocks],
  );

  /*
   * Which artifacts have been promoted into Our analytics this session. Held
   * here rather than in the pane: a pane unmounts when its tab loses focus, and
   * a chart that forgets it was kept would offer to keep it a second time.
   */
  const [keptCharts, setKeptCharts] = useState<Readonly<Record<string, KeptChart>>>({});

  /* The artifacts showing on the stage right now: one per pane, its active
     tab. Every chart has a tab, so "has a tab" would light every card; the
     card that lights is the one whose chart is in front. */
  const openArtifactIds = useMemo(
    () =>
      new Set(
        stage.open
          ? stage.columns.flatMap((column) => column.panes.map((pane) => pane.activeId))
          : [],
      ),
    [stage.columns, stage.open],
  );

  const openBlockArtifact = useCallback(
    (block: MessageBlock, placement?: 'right') => {
      const artifact = messageBlockArtifact(block, t);
      if (artifact === null) return;
      setOpenedRestoredBlocks((current) => {
        if (current.has(artifact.id)) return current;
        const next = new Map(current);
        next.set(artifact.id, block);
        return next;
      });
      dispatchStage({ type: 'open', artifact, ...(placement ? { placement } : {}) });
    },
    [t],
  );

  /*
   * An artifact the agent just produced opens its tab without being asked.
   * `decideAutoOpen` holds the rules that keep that from being a nuisance for
   * tables and documents. Charts go further: the stage is the conversation's
   * chart index, one tab per chart in the order they were drawn, so on
   * arriving in a conversation every chart it holds gets its tab (newest
   * active) and the tabs that belonged to the previous conversation go.
   */
  const autoOpenedRef = useRef<AutoOpenMemory>({ session: null, ids: new Set() });
  useEffect(() => {
    const arrived = autoOpenedRef.current.session !== activeSessionId;
    const decision = decideAutoOpen(autoOpenedRef.current, activeSessionId, artifactBlocks.keys());
    autoOpenedRef.current = decision.memory;

    if (arrived) {
      for (const column of stage.columns) {
        for (const pane of column.panes) {
          for (const tab of pane.tabs) {
            if (tab.id.startsWith('block:') && !artifactBlocks.has(tab.id)) {
              dispatchStage({ type: 'closeTab', paneId: pane.id, tabId: tab.id });
            }
          }
        }
      }
    }

    const toOpen = arrived
      ? [...artifactBlocks.entries()]
          .filter(([, entry]) => entry.block.blockType === 'chart')
          .map(([artifactId]) => artifactId)
      : decision.open;
    for (const artifactId of toOpen) {
      const entry = artifactBlocks.get(artifactId);
      if (entry === undefined) continue;
      const artifact = messageBlockArtifact(entry.block, t);
      if (artifact !== null) dispatchStage({ type: 'open', artifact });
    }
  }, [activeSessionId, artifactBlocks, stage.columns, t]);

  /*
   * The workspace panels, in the composer rather than in a floating header.
   *
   * These used to be five icon buttons hovering over the transcript, next to
   * the two that belong there. The design system's sixth rule puts them with
   * the message, and each one is still gated on the controller that backs it:
   * a panel with nothing behind it is not offered rather than offered broken.
   */
  const composerTools = useMemo<readonly ComposerTool[]>(() => {
    const entries: ComposerTool[] = [];

    if (activeSession?.roomId && listWorkspaceTree && getWorkspaceFileContent) {
      entries.push({
        id: 'workspace',
        label: t('chat.openWorkspace'),
        icon: <FolderTreeIcon size={17} />,
        onSelect: () => dispatchStage({ type: 'open', artifact: workspaceArtifact(t) }),
      });
    }
    if (
      (listCanonicalCharts &&
        listChartCollections &&
        getCanonicalChart &&
        runSavedCanonicalChart &&
        chartRenderer) ||
      (createChart && patchChart && deleteChart && setChartDataFromCsv)
    ) {
      entries.push({
        id: 'charts',
        label: t('chat.openCharts'),
        icon: <ChartIcon size={17} />,
        onSelect: () => dispatchStage({ type: 'open', artifact: chartsArtifact(t) }),
      });
    }
    if (automationWorkflow) {
      entries.push({
        id: 'automations',
        label: t('chat.openAutomations'),
        icon: <WorkflowIcon size={17} />,
        onSelect: () => dispatchStage({ type: 'open', artifact: automationsArtifact(t) }),
      });
    }
    if (Object.keys(applicationState).length > 0) {
      entries.push({
        id: 'application-state',
        label: t('chat.openApplicationState'),
        icon: <Table2Icon size={15} />,
        onSelect: () => dispatchStage({ type: 'open', artifact: applicationStateArtifact(t) }),
      });
    }
    entries.push({
      id: 'agent-info',
      label: t('chat.agentInfo.toggle'),
      icon: <InfoIcon size={15} />,
      onSelect: () => dispatchStage({ type: 'open', artifact: agentInfoArtifact(t) }),
    });

    return entries;
  }, [
    activeSession?.roomId,
    applicationState,
    automationWorkflow,
    chartRenderer,
    createChart,
    deleteChart,
    getCanonicalChart,
    getWorkspaceFileContent,
    listCanonicalCharts,
    listChartCollections,
    listWorkspaceTree,
    patchChart,
    runSavedCanonicalChart,
    setChartDataFromCsv,
    t,
  ]);
  const openRunInspector = useCallback(
    (runId: string) => {
      dispatchStage({ type: 'open', artifact: runArtifact(runId, t) });
    },
    [t],
  );
  const renderArtifact = useCallback(
    (artifact: Artifact) => {
      /* Block-backed artifacts share `chart`, `table`, and `document` with the singleton
         library panes, so the id space decides before the kind does. */
      const restoredBlock = openedRestoredBlocks.get(artifact.id);
      const entry =
        artifactBlocks.get(artifact.id) ??
        (restoredBlock === undefined ? undefined : { block: restoredBlock, question: null });
      if (entry) {
        return (
          <BlockPane
            block={entry.block}
            kept={keptCharts[artifact.id]}
            question={entry.question}
            renderer={chartRenderer}
            onKept={(kept) => setKeptCharts((prev) => ({ ...prev, [artifact.id]: kept }))}
            {...(listChartCollections ? { listCollections: listChartCollections } : {})}
            {...(saveChatPreview ? { saveChatPreview } : {})}
          />
        );
      }

      switch (artifact.kind) {
        case 'chart':
          if (
            listCanonicalCharts &&
            listChartCollections &&
            getCanonicalChart &&
            runSavedCanonicalChart &&
            chartRenderer
          ) {
            return (
              <CanonicalChartSidebar
                embedded
                listCharts={listCanonicalCharts}
                listCollections={listChartCollections}
                getChart={getCanonicalChart}
                runSavedChart={runSavedCanonicalChart}
                cancelRun={cancelCanonicalChartRun}
                renderer={chartRenderer}
                refreshNonce={chartsRefreshNonce}
                focusChartRequest={chartFocusRequest}
                onInspectRun={openRunInspector}
                onAttachChart={(chart) =>
                  setAttachments((prev) =>
                    prev.some((attachment) => attachment.id === chart.id)
                      ? prev
                      : [...prev, { type: 'chart', id: chart.id, title: chart.title }],
                  )
                }
              />
            );
          }
          return (
            createChart &&
            patchChart &&
            deleteChart &&
            setChartDataFromCsv && (
              <ChartPane
                listCharts={listCharts}
                subscribeCharts={subscribeCharts}
                createChart={createChart}
                patchChart={patchChart}
                deleteChart={deleteChart}
                setChartDataFromCsv={setChartDataFromCsv}
                submitQuery={submitQuery}
                monitorQuery={monitorQuery}
                listQueryCatalogs={listQueryCatalogs}
                suggestChartEncodings={suggestChartEncodings}
                onInspectRun={openRunInspector}
                focusChartRequest={chartFocusRequest}
                onAttachChart={(chart) =>
                  setAttachments((prev) =>
                    prev.some((attachment) => attachment.id === chart.id)
                      ? prev
                      : [...prev, { type: 'chart', id: chart.id, title: chart.title }],
                  )
                }
              />
            )
          );
        case 'terminal':
          return (
            <TerminalPane
              runId={artifact.id.slice('terminal:'.length)}
              getRunManifest={(runId) => controller.getRunManifest(userId, runId)}
              getRunTrace={(runId) => controller.getRunTrace(userId, runId)}
              getRunReport={(runId) => controller.getRunReport(userId, runId)}
              getRunValidation={(runId) => controller.getRunValidation(userId, runId)}
              getRunGovernance={
                controller.getRunGovernance
                  ? (runId) => controller.getRunGovernance!(userId, runId)
                  : undefined
              }
              getRunGovernanceEvidence={
                controller.getRunGovernanceEvidence
                  ? (runId, cursor) => controller.getRunGovernanceEvidence!(userId, runId, cursor)
                  : undefined
              }
              listRunFiles={(runId) => controller.listRunFiles(userId, runId)}
              getRunFileContent={(runId, path) => controller.getRunFileContent(userId, runId, path)}
              getSessionResult={(sessionId) =>
                controller.getSessionTranscriptById(userId, sessionId)
              }
              listPendingActions={listPendingActions}
              approvePendingAction={approvePendingAction}
              rejectPendingAction={rejectPendingAction}
            />
          );
        case 'document':
          return <DocumentPane />;
        case 'table':
          return <TablePane state={applicationState} />;
        case 'automation':
          return (
            automationWorkflow && (
              <AutomationPane
                automationWorkflow={automationWorkflow}
                onInspectRun={openRunInspector}
              />
            )
          );
        case 'workspace':
          return (
            listWorkspaceTree &&
            getWorkspaceFileContent && (
              <WorkspaceTreePane
                key={activeSession?.roomId ?? 'workspace-no-room'}
                roomId={activeSession?.roomId ?? null}
                listWorkspaceTree={listWorkspaceTree}
                getWorkspaceFileContent={getWorkspaceFileContent}
                refreshSignal={workspaceRefreshSignal}
                workspaceChanges={activeWorkspaceChanges}
                onWorkspaceChangesReconciled={(roomId) =>
                  setWorkspaceChanges((previous) => (previous?.roomId === roomId ? null : previous))
                }
              />
            )
          );
      }
    },
    [
      applicationState,
      activeSession?.roomId,
      artifactBlocks,
      openedRestoredBlocks,
      keptCharts,
      cancelCanonicalChartRun,
      chartRenderer,
      chartFocusRequest,
      runSavedCanonicalChart,
      saveChatPreview,
      chartsRefreshNonce,
      controller,
      createChart,
      deleteChart,
      getCanonicalChart,
      getWorkspaceFileContent,
      automationWorkflow,
      listCanonicalCharts,
      listChartCollections,
      listWorkspaceTree,
      listCharts,
      listPendingActions,
      approvePendingAction,
      rejectPendingAction,
      monitorQuery,
      openRunInspector,
      patchChart,
      listQueryCatalogs,
      setChartDataFromCsv,
      submitQuery,
      subscribeCharts,
      suggestChartEncodings,
      userId,
      workspaceRefreshSignal,
      activeWorkspaceChanges,
    ],
  );
  const scopedDatabase = activeSession ? activeSession.databaseName : pendingDatabase;

  useEffect(() => {
    pendingDatabaseRef.current = pendingDatabase;
  }, [pendingDatabase]);

  const chooseDatabase = (database: string | null): void => {
    if (activeSessionId === null) {
      setPendingDatabase(database);
      return;
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? { ...s, databaseName: database } : s)),
    );
  };

  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession]);

  /* The three most recent conversations, for the opening screen's Recent list.
     Already in the store for the conversations menu, so this costs no read. */
  const recentConversations = useMemo(
    () =>
      sessions.slice(0, 3).map((session) => ({
        id: session.id,
        title: session.title,
        subject: session.databaseName,
      })),
    [sessions],
  );
  const selectTimelineEntry = useCallback((messageId: string) => {
    messageRowRefs.current.get(messageId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setTimelineOpen(false);
  }, []);
  const conversationStore: ChatConversationStore = useMemo(
    () => ({
      get messages() {
        return (
          useChatSessionsStore
            .getState()
            .sessions.find((session) => session.id === (activeSessionId ?? draftSessionId))
            ?.messages ?? []
        );
      },
      get roomId() {
        return (
          useChatSessionsStore
            .getState()
            .sessions.find((session) => session.id === (activeSessionId ?? draftSessionId))
            ?.roomId ?? null
        );
      },
      setMessages: (updater) => {
        // Not just `activeSessionId`: `handleSend` creates and promotes a
        // brand-new session (under `draftSessionId`) and calls `send`
        // synchronously after, in the same tick — before this closure's own
        // `activeSessionId` (captured at the last render) reflects it.
        const sessionId = activeSessionId ?? draftSessionId;
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, messages: updater(s.messages) } : s)),
        );
      },
      setRoomId: (roomId) => {
        const sessionId = activeSessionId ?? draftSessionId;
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, roomId } : s)));
      },
    }),
    [activeSessionId, draftSessionId],
  );

  const {
    isStreaming,
    error,
    streamStatus,
    send: sendConversationMessage,
    regenerate: regenerateAnswer,
    reconnect: reconnectStream,
    disconnect: disconnectStream,
    decideApproval,
  } = useChatConversation({
    // A new conversation uses the selected tenant manifest; an older room
    // uses the agent persisted in its member list. Omitting this keeps legacy
    // rooms on the configured default agent.
    agentName: conversationAgentName,
    roomKey: activeSessionId ?? draftSessionId,
    userId,
    controller,
    listMessageBlockHistory,
    subscribeMessageBlocks,
    store: conversationStore,
    preserveStoreOnConversationChange: true,
    dataScope: dataScopeOf(scopedDatabase).dataScope,
    errorFallbackMessage: t('chat.error'),
    onApplicationStateSet: (update) =>
      setApplicationState((prev) => ({ ...prev, [update.name]: update.value })),
    onWorkspaceChanged: (changes, roomId) => {
      if (!roomId) return;
      setWorkspaceChanges((previous) => ({
        roomId,
        changes:
          previous?.roomId === roomId ? mergeWorkspaceChanges(previous.changes, changes) : changes,
      }));
      setWorkspaceRefreshSignal((previous) => previous + 1);
    },
    onRunFinished: (status) => {
      if (status !== 'awaiting_client_tool' && status !== 'awaiting_input') {
        setChartsRefreshNonce((nonce) => nonce + 1);
      }
    },
  });

  const databasePicker = (
    <ChatDatabasePicker disabled={isStreaming} onChange={chooseDatabase} value={scopedDatabase} />
  );
  const agentPicker =
    listAgentManifests && availableAgents !== null && availableAgents.length > 0 ? (
      <ChatAgentPicker
        agents={availableAgents}
        value={conversationAgentName ?? ''}
        disabled={isStreaming || activeSessionId !== null}
        onChange={(value) => {
          if (activeSessionId === null) setPendingAgent(value);
        }}
      />
    ) : null;
  const chatToolbar = (
    <div className="flex w-full min-w-0 items-center justify-between gap-2">
      {databasePicker}
      {agentPicker ? <div className="ml-auto shrink-0">{agentPicker}</div> : null}
    </div>
  );

  useEffect(() => {
    let active = true;
    void controller.checkHealth().then((reachable) => {
      if (active) setIsCoreApiReachable(reachable);
    });
    return () => {
      active = false;
    };
  }, [controller]);

  // Restore from a previous session. Runs client-only, after mount, so the
  // first render matches the server (see skills/state-management/SKILL.md).
  useEffect(() => {
    hydrateSessions(userId);
  }, [userId]);

  // The sidebar and every "Ask AI" button address this screen through the
  // URL: `?chatId=` opens a server-backed conversation, while the legacy
  // `?session=` form remains supported for links created by older clients.
  // `?database=` starts a fresh one already scoped.
  //
  // Keyed on the query string rather than on mount, because the commonest way
  // in is from this screen itself — clicking a conversation in the sidebar
  // while already chatting. That is a same-route navigation, so nothing
  // remounts and a mount-only read never fired: the address bar changed and
  // the transcript did not.
  useEffect(() => {
    // A session id means nothing until the list it indexes has loaded.
    if (!sessionsHydrated) return;
    const requestedChatId = normalizeChatId(searchParams.get('chatId'));
    const requestedSession = searchParams.get('session');
    const requestedDatabase = searchParams.get('database');
    if (requestedChatId === null && requestedSession === null && requestedDatabase === null) return;

    if (requestedChatId !== null) {
      const requestedChat = sessions.find((session) => session.roomId === requestedChatId);
      setActiveSessionId(requestedChat?.id ?? null);
      return;
    }

    if (requestedSession !== null) {
      setActiveSessionId(requestedSession);
    } else if (requestedDatabase !== null) {
      setActiveSessionId(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- consuming the URL this screen was addressed with, not derived state
      setPendingDatabase(requestedDatabase);
    }

    // Consumed, so it is taken back out. Left in place, clicking the same
    // sidebar entry a second time would change nothing about the URL, this
    // effect would not run, and the click would be dead.
    router.replace(pathname, { scroll: false });
  }, [activeSessionId, pathname, router, searchParams, sessions, sessionsHydrated]);

  const connectionStatus: ChatConnectionStatus =
    isCoreApiReachable === null ? 'checking' : isCoreApiReachable ? 'connected' : 'offline';

  // ─── Manual reconnect ──────────────────────────────────────────────────────

  const handleManualReconnect = useCallback(() => {
    reconnectStream();
  }, [reconnectStream]);

  // ─── Session management ────────────────────────────────────────────────────

  const startNewChat = useCallback(() => {
    disconnectStream();
    setActiveSessionId(null);
    router.replace(pathname, { scroll: false });
  }, [disconnectStream, pathname, router]);

  const selectChat = useCallback(
    (id: string) => {
      disconnectStream();
      setActiveSessionId(id);
      const selectedSession = sessions.find((session) => session.id === id);
      router.replace(
        selectedSession?.roomId ? chatUrl(pathname, selectedSession.roomId) : pathname,
        { scroll: false },
      );
    },
    [disconnectStream, pathname, router, sessions],
  );

  // ─── Send message ──────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const sessionId = activeSessionId ?? draftSessionId;

      if (!activeSessionId) {
        const newSession: ChatSession = {
          id: sessionId,
          roomId: null,
          title: text.slice(0, 60),
          agentName: conversationAgentName ?? null,
          messages: [],
          databaseName: pendingDatabaseRef.current,
        };
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(sessionId);
        setDraftSessionId(crypto.randomUUID());
      }

      await sendConversationMessage(text);
      const roomId = useChatSessionsStore
        .getState()
        .sessions.find((session) => session.id === sessionId)?.roomId;
      if (roomId) router.replace(chatUrl(pathname, roomId), { scroll: false });
    },
    [
      activeSessionId,
      conversationAgentName,
      draftSessionId,
      isStreaming,
      pathname,
      router,
      sendConversationMessage,
    ],
  );

  const retryRun = useCallback(
    (messageId: string) => {
      if (isStreaming) return;
      const failedIndex = messages.findIndex((message) => message.id === messageId);
      const previousUserMessage =
        failedIndex > 0
          ? [...messages.slice(0, failedIndex)].reverse().find((message) => message.role === 'user')
          : undefined;
      if (previousUserMessage) void handleSend(previousUserMessage.content);
    },
    [handleSend, isStreaming, messages],
  );

  // ─── Landing state — no active conversation ────────────────────────────────

  if (!activeSessionId) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] md:h-dvh">
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatLanding
            pending={isStreaming}
            connectionStatus={connectionStatus}
            onSubmit={(text) => {
              handleSend(formatMessageWithAttachments(text, attachments));
              setAttachments([]);
            }}
            toolbar={chatToolbar}
            tools={composerTools}
            attachments={attachments}
            onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
            recent={recentConversations}
            onSelectRecent={selectChat}
            shortcuts={floorShortcuts}
            header={
              <div className="flex w-full items-center gap-1">
                <ConversationsMenu activeId={null} onSelect={selectChat} onNew={startNewChat} />
                <IconButton label={t('chat.newConversation')} onClick={startNewChat}>
                  <SquarePenIcon size={18} />
                </IconButton>
              </div>
            }
          />
        </main>
      </div>
    );
  }

  const paneCount = stage.columns.reduce((sum, column) => sum + column.panes.length, 0);
  const stageVisible = stage.open && paneCount > 0;
  const pendingQuestion = messages[messages.length - 1]?.awaitingInput;
  const pendingApproval = messages[messages.length - 1]?.runAwaitingApproval;

  // ─── Single unified chat view ──────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] md:h-dvh">
      <ResizablePanelGroup
        orientation={stageVisible && narrowChatLayout ? 'vertical' : 'horizontal'}
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          id="chat"
          defaultSize={stageVisible ? (narrowChatLayout ? 58 : 44) : 100}
          minSize={stageVisible && narrowChatLayout ? 40 : 340}
        >
          <main className="relative flex h-full min-h-0 flex-col bg-card">
            {/* The conversation bar. It used to be icons floating over the
                transcript with a fade under them; a notebook has a title, and
                the scope (which database, which agent) is set once for the
                whole conversation, so it lives here rather than in the
                composer. On a phone the scope wraps to a second row. */}
            <header
              aria-label={t('chat.bar.label')}
              className="relative z-10 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-3 py-2 sm:px-4"
            >
              <div className="relative z-10 flex items-center gap-1">
                <ConversationsMenu
                  activeId={activeSessionId}
                  onSelect={selectChat}
                  onNew={startNewChat}
                />
                <IconButton label={t('chat.newConversation')} onClick={startNewChat}>
                  <SquarePenIcon size={18} />
                </IconButton>
              </div>
              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="font-mono text-micro tracking-[0.12em] text-muted-foreground uppercase">
                  {t('chat.bar.eyebrow')}
                </span>
                <span className="truncate text-label text-foreground">{activeSession?.title}</span>
              </div>
              <div className="order-last flex w-full min-w-0 items-center gap-2 overflow-x-auto sm:order-none sm:w-auto sm:shrink-0">
                {databasePicker}
                {agentPicker}
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <IconButton label={t('chat.timeline.open')} onClick={() => setTimelineOpen(true)}>
                    <PanelLeftOpenIcon size={18} />
                  </IconButton>
                )}
                {paneCount > 0 && (
                  <IconButton
                    label={
                      stageVisible
                        ? t('chat.stage.hide')
                        : t('chat.stage.show', { count: paneCount })
                    }
                    onClick={() => dispatchStage({ type: 'setOpen', open: !stage.open })}
                  >
                    {stage.open ? (
                      <PanelRightCloseIcon size={18} />
                    ) : (
                      <PanelRightOpenIcon size={18} />
                    )}
                  </IconButton>
                )}
              </div>
            </header>

            {timelineOpen && (
              <ChatTimelineRail
                messages={messages}
                onSelect={selectTimelineEntry}
                onClose={() => setTimelineOpen(false)}
              />
            )}

            {/* Connection status banner */}
            {streamStatus === 'reconnecting' && (
              <div
                role="status"
                aria-live="polite"
                className="absolute inset-x-0 top-20 z-20 mx-auto flex w-fit items-center gap-2 rounded-full border border-status-warning/40 bg-status-warning-light px-3 py-1.5 text-xs text-status-warning-dark shadow-sm"
              >
                <ThinkingOrb label={t('chat.reconnecting')} size={20} state="connecting" />
                {t('chat.reconnecting')}
              </div>
            )}
            {streamStatus === 'disconnected' && activeSession?.roomId && (
              <div
                role="alert"
                className="absolute inset-x-0 top-20 z-20 mx-auto flex w-fit items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-destructive" />
                {t('chat.disconnected')}
                <button
                  type="button"
                  onClick={handleManualReconnect}
                  className="ml-1 cursor-pointer border-0 bg-transparent p-0 text-xs text-destructive underline"
                >
                  {t('chat.retryConnection')}
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="min-h-0 flex-1 px-3 sm:px-5">
              <ChatMessageList
                /* Remounted per conversation so the scroller opens each one at
                   its end; a draft keeps its id when it becomes a session, so
                   the first turn does not remount mid-stream. */
                key={activeSessionId ?? draftSessionId}
                messages={messages}
                isStreaming={isStreaming}
                messageRowRefs={messageRowRefs}
                resolveCitations={resolveCitations}
                onCitationsResolved={(messageId, citations) => {
                  conversationStore.setMessages((prev) =>
                    prev.map((message) =>
                      message.id === messageId
                        ? { ...message, resolvedCitations: citations }
                        : message,
                    ),
                  );
                }}
                onCitationClick={(citation) => {
                  if (citation.type !== 'chart' || !citation.found) return;
                  dispatchStage({ type: 'open', artifact: chartsArtifact(t) });
                  setChartFocusRequest({ chartId: citation.id, nonce: Date.now() });
                }}
                onSuggestionSelect={handleSend}
                /* The bar is solid now, so the first exchange only needs
                   breathing room; the bottom clears the composer's fade. */
                contentClassName="pt-6 pb-8 sm:pt-8 sm:pb-10"
                onOpenArtifact={openBlockArtifact}
                openArtifactIds={openArtifactIds}
                onInspectRun={openRunInspector}
                listPendingActions={listPendingActions}
                approvePendingAction={approvePendingAction}
                rejectPendingAction={rejectPendingAction}
                onApprovalDecision={(runId, approvalId, decision) =>
                  decideApproval(runId, approvalId, decision)
                }
                onRetryRun={retryRun}
                onRegenerate={regenerateAnswer}
                renderer={chartRenderer}
              />
            </div>

            {/* Error bar */}
            {error && (
              <div
                role="alert"
                className="border-t border-destructive/30 bg-destructive/10 px-3 py-2.5 text-caption leading-relaxed text-destructive sm:px-5 sm:text-sm"
              >
                {error}
              </div>
            )}

            {/* The composer docks under the transcript with no rule above
                it: the last lines of an answer fade out behind it instead. The
                scope moved to the bar, so the composer is only for writing. */}
            <div className="relative shrink-0 px-3 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-gradient-to-t from-card to-transparent"
              />
              <div className={READING_COLUMN}>
                <ChatComposer
                  compact
                  disabled={isStreaming || pendingQuestion?.allowOther === false || pendingApproval}
                  tools={composerTools}
                  placeholder={
                    messages[messages.length - 1]?.runAwaitingInput
                      ? t('chat.composer.answerToCarryOn')
                      : t('chat.placeholder')
                  }
                  onSubmit={(text) => {
                    handleSend(formatMessageWithAttachments(text, attachments));
                    setAttachments([]);
                  }}
                  attachments={attachments}
                  onRemoveAttachment={(id) =>
                    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
                  }
                />
                <p className="m-0 mt-2 hidden text-center font-mono text-micro text-muted-foreground sm:block">
                  {t('chat.composer.hint')}
                </p>
              </div>
            </div>
          </main>
        </ResizablePanel>
        {stageVisible ? (
          <>
            <ResizableHandle />
            <ResizablePanel
              id="stage"
              defaultSize={narrowChatLayout ? '42%' : 56}
              minSize={narrowChatLayout ? '30%' : 380}
            >
              <ChatStageShell
                stage={stage}
                dispatch={dispatchStage}
                renderPane={renderArtifact}
                onActivate={scrollTranscriptToArtifact}
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}

function normalizeChatId(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(/[.,]+$/u, '');
  return normalized === '' ? null : normalized;
}
