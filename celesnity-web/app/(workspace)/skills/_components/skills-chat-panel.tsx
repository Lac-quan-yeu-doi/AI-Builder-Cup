'use client';

import { useMemo } from 'react';

import { AssistantPanel } from '@/app/_components/assistant/assistant-panel';
import { useScopedAssistantConversation } from '@/app/_components/assistant/use-scoped-assistant-conversation';
import type { AssistantScopeChip } from '@/app/_components/assistant/assistant-scope';
import { useTranslation } from '@/app/_i18n/use-translation';

// A skill write from the agent mutates the same `/skills` files the list on
// the left renders, so the panel refreshes that list whenever one of these
// runs (mirrors the automation panel's WORKFLOW_MUTATION_TOOLS set).
const SKILL_MUTATION_TOOLS = new Set(['create_skill', 'update_skill', 'delete_skill']);
const SKILL_MCP_TOOL_PREFIX = 'mcp__skill__';

function isSkillMutationTool(toolName: string): boolean {
  const unnamespacedName = toolName.startsWith(SKILL_MCP_TOOL_PREFIX)
    ? toolName.slice(SKILL_MCP_TOOL_PREFIX.length)
    : toolName;
  return SKILL_MUTATION_TOOLS.has(unnamespacedName);
}

// `NEXT_PUBLIC_*` vars are safe to read directly in the app layer (Next.js
// inlines them at build time) — read here rather than through
// `publicEnvironment` (under `src/infrastructure/`), which the app layer is
// architecturally forbidden from importing directly (see the automation
// workflow chat panel, which reads its own agent-name env var the same way).
function skillChatAgentName(): string {
  const value = process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME;
  if (value === undefined || value === '') {
    throw new Error(
      'NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME is required — set it to a name already registered via ' +
        "minder-agent's agents/ directory (e.g. skill-creator) before the skills chat panel can " +
        'add it as a room member.',
    );
  }
  return value;
}

export interface SkillsChatPanelProps {
  /** Called after a run finishes or a skill-mutating tool completes, so the list can refresh. */
  readonly onSkillsChanged?: () => void;
  /** The skill open in the editor, which the thread is keyed to. */
  readonly skillName?: string | null;
  readonly onClose?: () => void;
}

export function SkillsChatPanel({ onClose, onSkillsChanged, skillName }: SkillsChatPanelProps) {
  const { t } = useTranslation();
  const {
    activeConversationId,
    controllers,
    history,
    historyLoading,
    messages,
    isStreaming,
    error,
    send,
    decideApproval,
    selectConversation,
    startNewConversation,
  } = useScopedAssistantConversation({
    agentName: skillChatAgentName(),
    conversationNamespace:
      skillName === null || skillName === undefined ? 'skill-workspace' : `skill-${skillName}`,
    legacyConversationKey:
      skillName === null || skillName === undefined ? 'skill-workspace' : `skill-${skillName}`,
    title: t('skills.assistantTitle'),
    onRunFinished: onSkillsChanged,
    onToolFinished: (toolName) => {
      if (isSkillMutationTool(toolName)) onSkillsChanged?.();
    },
  });

  const scope = useMemo<readonly AssistantScopeChip[]>(
    () =>
      skillName === null || skillName === undefined
        ? []
        : [{ id: 'skill', kind: t('assistant.scope.skill'), value: skillName }],
    [skillName, t],
  );

  async function submit(text: string) {
    await send(text);
  }

  return (
    <AssistantPanel
      controllers={controllers}
      emptyDescription={t('skills.assistantDescription')}
      emptyTitle={t('skills.assistantEmptyTitle')}
      error={error}
      history={history}
      historyLoading={historyLoading}
      isStreaming={isStreaming}
      messages={messages}
      activeHistoryId={activeConversationId}
      {...(onClose === undefined ? {} : { onClose })}
      onHistorySelect={selectConversation}
      onNewThread={startNewConversation}
      onSubmit={(text) => void submit(text)}
      onApprovalDecision={decideApproval}
      scope={scope}
      starters={[
        { id: 'draft', label: t('skills.starterDraft'), prompt: t('skills.starterDraft') },
        { id: 'improve', label: t('skills.starterImprove'), prompt: t('skills.starterImprove') },
        { id: 'list', label: t('skills.starterList'), prompt: t('skills.starterList') },
      ]}
      surface="skills"
      title={t('skills.assistantTitle')}
    />
  );
}
