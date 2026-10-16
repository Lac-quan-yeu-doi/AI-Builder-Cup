'use client';

import { useMemo } from 'react';

import { AssistantPanel } from '@/app/_components/assistant/assistant-panel';
import { useScopedAssistantConversation } from '@/app/_components/assistant/use-scoped-assistant-conversation';
import type { AssistantScopeChip } from '@/app/_components/assistant/assistant-scope';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { PlantModelDraft, PlantSite } from '@/src/entities/models/plant-model';

import { buildPlantModelToolScope } from './plant-model-tool-scope';

const PLANT_MODEL_MUTATION_TOOLS = new Set([
  'create_plant_model_site',
  'update_plant_model_site',
  'save_plant_model',
  'publish_plant_model',
  'apply_plant_model_template',
  'associate_plant_model_dashboard',
  'remove_plant_model_dashboard',
]);
const PLANT_MODEL_MCP_TOOL_PREFIX = 'mcp__plant_model__';

function isPlantModelMutationTool(toolName: string): boolean {
  const unnamespacedName = toolName.startsWith(PLANT_MODEL_MCP_TOOL_PREFIX)
    ? toolName.slice(PLANT_MODEL_MCP_TOOL_PREFIX.length)
    : toolName;
  return PLANT_MODEL_MUTATION_TOOLS.has(unnamespacedName);
}

function plantModelChatAgentName(): string {
  const value = process.env.NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME;
  if (value === undefined || value === '') {
    throw new Error(
      'NEXT_PUBLIC_PLANT_MODEL_CHAT_AGENT_NAME is required — set it to a name already registered ' +
        "via minder-agent's agents/ directory before the Plant Model chat panel can add it as a " +
        'room member.',
    );
  }
  return value;
}

export function PlantModelChatPanel({
  site,
  draft,
  selectedNodeId,
  selectedRelationshipId,
  selectedDashboardId,
  close,
  onModelChanged,
}: {
  readonly site: PlantSite;
  readonly draft: PlantModelDraft;
  readonly selectedNodeId?: string;
  readonly selectedRelationshipId?: string;
  readonly selectedDashboardId?: string;
  readonly close: () => void;
  /** Refreshes the host model after an assistant mutation completes. */
  readonly onModelChanged?: () => void;
}) {
  const { t } = useTranslation();
  const agentName = plantModelChatAgentName();
  const selectedNode = draft.nodes.find(({ id }) => id === selectedNodeId);
  const selectedRelationship = draft.relationships.find(({ id }) => id === selectedRelationshipId);
  const {
    controllers,
    activeConversationId,
    history,
    historyLoading,
    messages,
    setMessages,
    isStreaming,
    error,
    send,
    decideApproval,
    selectConversation,
    startNewConversation,
  } = useScopedAssistantConversation({
    agentName,
    conversationNamespace: `plant-model:${site.id}`,
    legacyConversationKey: `plant-model-${site.id}`,
    title: `${site.name} Plant Model`,
    plantModelScope: buildPlantModelToolScope(
      site,
      selectedNodeId,
      selectedRelationshipId,
      selectedDashboardId,
    ),
    errorFallbackMessage: t('plantModel.chatError'),
    onToolFinished: (toolName) => {
      if (isPlantModelMutationTool(toolName)) onModelChanged?.();
    },
  });

  const submit = async (text: string): Promise<void> => {
    if (text.trim() === '/new') {
      startNewConversation();
      return;
    }
    await send(text);
  };

  const scope = useMemo<readonly AssistantScopeChip[]>(() => {
    if (selectedNode) {
      return [
        { id: 'site', kind: t('assistant.scope.site'), value: site.name },
        { id: 'node', kind: t('assistant.scope.node'), value: selectedNode.name },
      ];
    }
    return [{ id: 'site', kind: t('assistant.scope.site'), value: site.name }];
  }, [selectedNode, site.name, t]);

  return (
    <AssistantPanel
      controllers={controllers}
      emptyDescription={
        selectedNode
          ? t('plantModel.chatNodeContext', { node: selectedNode.name })
          : selectedRelationship
            ? t('plantModel.chatRelationshipContext')
            : t('plantModel.chatEmptyDescription')
      }
      emptyTitle={t('plantModel.chatEmptyTitle')}
      error={error}
      history={history}
      historyLoading={historyLoading}
      isStreaming={isStreaming}
      messages={messages}
      activeHistoryId={activeConversationId}
      onCitationClick={(citation) => {
        if (citation.type === 'chart' && citation.found) {
          window.open(`/analytics/charts/${encodeURIComponent(citation.id)}`, '_blank');
        }
      }}
      onCitationsResolved={(messageId, citations) =>
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId ? { ...message, resolvedCitations: citations } : message,
          ),
        )
      }
      onClose={close}
      onHistorySelect={selectConversation}
      onNewThread={startNewConversation}
      onSubmit={(text) => void submit(text)}
      onApprovalDecision={decideApproval}
      placeholder={t('plantModel.chatPlaceholder')}
      scope={scope}
      starters={[
        {
          id: 'status',
          label: t('plantModel.starterStatus'),
          prompt: t('plantModel.starterStatus'),
        },
        { id: 'route', label: t('plantModel.starterRoute'), prompt: t('plantModel.starterRoute') },
        {
          id: 'performance',
          label: t('plantModel.starterPerformance'),
          prompt: t('plantModel.starterPerformance'),
        },
      ]}
      surface="plant-model"
      title={t('plantModel.chatTitle')}
    />
  );
}
