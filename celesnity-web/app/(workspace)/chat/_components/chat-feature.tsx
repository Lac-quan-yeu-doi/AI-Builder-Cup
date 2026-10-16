'use client';

import { getInjection } from '@/di/container';

import { ChatScreen } from './chat-screen';
import { TutorialAgentChatScreen } from './tutorial-agent-chat-screen';
import { useTutorialSessionStore } from '@/app/_stores/tutorial-session.store';
import { isTutorialChatScenarioId } from '@/src/entities/models/tutorial-chat-scenario';

const controller = getInjection('ManageChatController');
const listAgentManifests = getInjection('ListAgentManifestsController');
const listMessageBlockHistory = getInjection('ListMessageBlockHistoryController');
const subscribeMessageBlocks = getInjection('SubscribeMessageBlocksController');
const listCharts = getInjection('ListChartsController');
const subscribeCharts = getInjection('SubscribeChartsController');
const createChart = getInjection('CreateChartController');
const patchChart = getInjection('PatchChartController');
const deleteChart = getInjection('DeleteChartController');
const setChartDataFromCsv = getInjection('SetChartDataFromCsvController');
const submitQuery = getInjection('SubmitQueryController');
const monitorQuery = getInjection('MonitorQueryController');
const listQueryCatalogs = getInjection('ListQueryCatalogsController');
const suggestChartEncodings = getInjection('SuggestChartEncodingsController');
const listPendingActions = getInjection('ListPendingActionsController');
const approvePendingAction = getInjection('ApprovePendingActionController');
const rejectPendingAction = getInjection('RejectPendingActionController');
const resolveCitations = getInjection('ResolveCitationsController');
const listWorkspaceTree = getInjection('ListWorkspaceTreeController');
const getWorkspaceFileContent = getInjection('GetWorkspaceFileContentController');
const uploadDocument = getInjection('UploadDocumentController');
const getDocumentContent = getInjection('GetDocumentContentController');
const automationWorkflow = getInjection('AutomationWorkflowController');
const listCanonicalCharts = getInjection('ListCanonicalChartsController');
const listChartCollections = getInjection('ListChartCollectionsController');
const getCanonicalChart = getInjection('GetCanonicalChartController');
const runSavedCanonicalChart = getInjection('RunSavedCanonicalChartController');
const cancelCanonicalChartRun = getInjection('CancelCanonicalChartRunController');
const chartRenderer = getInjection('ChartRendererService');
const saveChatPreview = getInjection('SaveChatChartPreviewController');

export function ChatFeature() {
  const activeExperience = useTutorialSessionStore((state) => state.activeExperience);
  const activeRunId = useTutorialSessionStore((state) => state.activeRunId);
  if (
    activeExperience?.mode === 'SIMULATED_CHAT' &&
    isTutorialChatScenarioId(activeExperience.scenarioId)
  ) {
    return (
      <TutorialAgentChatScreen
        key={`${activeExperience.scenarioId}:${activeRunId ?? 'launching'}`}
        scenarioId={activeExperience.scenarioId}
        chartRenderer={chartRenderer}
      />
    );
  }
  return (
    <ChatScreen
      controller={controller}
      listAgentManifests={listAgentManifests}
      listMessageBlockHistory={listMessageBlockHistory}
      subscribeMessageBlocks={subscribeMessageBlocks}
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
      listPendingActions={listPendingActions}
      approvePendingAction={approvePendingAction}
      rejectPendingAction={rejectPendingAction}
      resolveCitations={resolveCitations}
      listWorkspaceTree={listWorkspaceTree}
      getWorkspaceFileContent={getWorkspaceFileContent}
      uploadDocument={uploadDocument}
      getDocumentContent={getDocumentContent}
      automationWorkflow={automationWorkflow}
      listCanonicalCharts={listCanonicalCharts}
      listChartCollections={listChartCollections}
      getCanonicalChart={getCanonicalChart}
      runSavedCanonicalChart={runSavedCanonicalChart}
      cancelCanonicalChartRun={cancelCanonicalChartRun}
      chartRenderer={chartRenderer}
      saveChatPreview={saveChatPreview}
    />
  );
}
