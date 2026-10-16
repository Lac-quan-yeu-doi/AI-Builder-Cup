'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { AssistantPanel } from '@/app/_components/assistant/assistant-panel';
import { useScopedAssistantConversation } from '@/app/_components/assistant/use-scoped-assistant-conversation';
import type { AssistantScopeChip } from '@/app/_components/assistant/assistant-scope';
import { Button } from '@/app/_components/ui/button';
import { useTranslation } from '@/app/_i18n/use-translation';

const WORKFLOW_MUTATION_TOOLS = new Set([
  'create_workflow',
  'add_workflow_step',
  'remove_workflow_step',
  'update_workflow_step',
  'update_workflow_trigger',
  'enable_workflow',
]);
const WORKFLOW_MCP_TOOL_PREFIX = 'mcp__automation_workflow__';

function isWorkflowMutationTool(toolName: string): boolean {
  const unnamespacedName = toolName.startsWith(WORKFLOW_MCP_TOOL_PREFIX)
    ? toolName.slice(WORKFLOW_MCP_TOOL_PREFIX.length)
    : toolName;
  return WORKFLOW_MUTATION_TOOLS.has(unnamespacedName);
}

// `NEXT_PUBLIC_*` vars are safe to read directly in the app layer (Next.js
// inlines them at build time) — read here rather than through
// `publicEnvironment` (under `src/infrastructure/`), which the app layer is
// architecturally forbidden from importing directly (see
// tests/unit/app/frameworks-layer.test.ts).
function automationWorkflowChatAgentName(): string {
  const value = process.env.NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME;
  if (value === undefined || value === '') {
    throw new Error(
      'NEXT_PUBLIC_AUTOMATION_WORKFLOW_CHAT_AGENT_NAME is required — set it to a name already ' +
        "registered via minder-agent's agents/ directory before the workflow chat panel can add " +
        'it as a room member.',
    );
  }
  return value;
}

export interface AutomationWorkflowChatPanelProps {
  readonly workflowId?: string;
  readonly workflowName: string;
  readonly onWorkflowChanged?: () => void;
  readonly context?: 'workflow-list';
  readonly topicOptions?: readonly string[];
  readonly onTopicSelected?: (topic: string) => void;
  /** The workflow dock frames its own tab; the list screen does not. */
  readonly embedded?: boolean;
  readonly onClose?: () => void;
}

export function AutomationWorkflowChatPanel({
  workflowId,
  workflowName,
  onWorkflowChanged,
  topicOptions,
  context,
  onTopicSelected,
  embedded = false,
  onClose,
}: AutomationWorkflowChatPanelProps) {
  const { t } = useTranslation();
  const seededRef = useRef(false);
  const isTopicAssistant = topicOptions !== undefined;
  const conversationNamespace = workflowId
    ? `automation-workflow:${workflowId}`
    : 'automation-topic-assistant';
  const legacyConversationKey = workflowId
    ? `workflow-${workflowId}`
    : 'automation-topic-assistant';

  useEffect(() => {
    seededRef.current = false;
  }, [conversationNamespace]);

  const {
    activeConversationId,
    controllers,
    history,
    historyLoading,
    messages,
    roomId,
    isStreaming,
    error,
    send,
    decideApproval,
    selectConversation,
    startNewConversation,
  } = useScopedAssistantConversation({
    agentName: automationWorkflowChatAgentName(),
    conversationNamespace,
    legacyConversationKey,
    title: workflowName,
    onRunFinished: onWorkflowChanged,
    onToolFinished: (toolName) => {
      if (isWorkflowMutationTool(toolName)) onWorkflowChanged?.();
    },
  });

  const startNewWorkflowConversation = useCallback(() => {
    seededRef.current = false;
    startNewConversation();
  }, [startNewConversation]);

  async function submit(text: string) {
    if (!seededRef.current && roomId === null) {
      seededRef.current = true;
      const contextMessage = isTopicAssistant
        ? `You are helping the user create an automation workflow. These are the only existing ` +
          `event topics in the organization: ${topicOptions.length > 0 ? topicOptions.join(', ') : '(none)'}. ` +
          'Recommend only topics from this list. Never invent a topic and never create or modify a workflow.\n\n'
        : context === 'workflow-list' || workflowId === undefined
          ? 'You are helping the user manage automation workflows from the workflow list. There is no selected workflow yet. Help them understand, choose, or create a workflow, and use automation workflow tools when appropriate. Do not invent event topics.\n\n'
          : `You are editing automation workflow ${workflowId} ("${workflowName}"). Use this id for ` +
            `every automation-workflow tool call.\n\n`;
      await send(`${contextMessage}${text}`, text);
      return;
    }
    await send(text);
  }

  const scope = useMemo<readonly AssistantScopeChip[]>(() => {
    if (isTopicAssistant) return [];
    if (workflowId === undefined) return [];
    return [{ id: 'workflow', kind: t('assistant.scope.workflow'), value: workflowName }];
  }, [isTopicAssistant, t, workflowId, workflowName]);

  // The topic list is the one thing this surface adds to a conversation: the
  // agent may only recommend topics that already exist, so the visitor needs to
  // see the same list it is working from.
  const intro = isTopicAssistant ? (
    <div className="shrink-0 border-b border-border px-3 py-3">
      <p className="m-0 text-caption text-muted-foreground">
        {t('automationWorkflow.topicAssistantDescription')}
      </p>
      <div className="mt-2.5 grid gap-1.5">
        {topicOptions.length === 0 ? (
          <p className="m-0 text-caption text-muted-foreground">
            {t('automationWorkflow.noExistingEventTopics')}
          </p>
        ) : (
          topicOptions.map((topic) => (
            <div
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2"
              key={topic}
            >
              <code className="min-w-0 truncate text-caption" title={topic}>
                {topic}
              </code>
              <Button
                aria-label={`${t('automationWorkflow.useTopic')} ${topic}`}
                onClick={() => onTopicSelected?.(topic)}
                size="xs"
                variant="outline"
              >
                {t('automationWorkflow.useTopic')}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <AssistantPanel
      controllers={controllers}
      embedded={embedded}
      emptyDescription={
        isTopicAssistant
          ? t('automationWorkflow.topicAssistantDescription')
          : t('automationWorkflow.assistantDescription')
      }
      emptyTitle={
        isTopicAssistant
          ? t('automationWorkflow.topicAssistantEmptyTitle')
          : t('automationWorkflow.assistantEmptyTitle')
      }
      error={error}
      {...(intro === null ? {} : { intro })}
      history={history}
      historyLoading={historyLoading}
      isStreaming={isStreaming}
      messages={messages}
      activeHistoryId={activeConversationId}
      {...(onClose === undefined ? {} : { onClose })}
      onHistorySelect={selectConversation}
      onNewThread={startNewWorkflowConversation}
      onSubmit={(text) => void submit(text)}
      onApprovalDecision={decideApproval}
      scope={scope}
      starters={
        isTopicAssistant
          ? []
          : [
              {
                id: 'step',
                label: t('automationWorkflow.starterStep'),
                prompt: t('automationWorkflow.starterStep'),
              },
              {
                id: 'trigger',
                label: t('automationWorkflow.starterTrigger'),
                prompt: t('automationWorkflow.starterTrigger'),
              },
              {
                id: 'explain',
                label: t('automationWorkflow.starterExplain'),
                prompt: t('automationWorkflow.starterExplain'),
              },
            ]
      }
      surface={isTopicAssistant ? 'automations-list' : 'automations'}
      title={
        isTopicAssistant
          ? t('automationWorkflow.topicAssistantTitle')
          : t('automationWorkflow.assistantTitle')
      }
    />
  );
}
