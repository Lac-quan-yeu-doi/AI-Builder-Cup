'use client';

import { useMemo } from 'react';

import { AssistantPanel } from '@/app/_components/assistant/assistant-panel';
import { useScopedAssistantConversation } from '@/app/_components/assistant/use-scoped-assistant-conversation';
import type { AssistantScopeChip } from '@/app/_components/assistant/assistant-scope';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { TableRef } from '@/src/entities/models/catalog';

interface DatabaseAssistantPanelProps {
  readonly database: string;
  /** The table open in the Tables tab, if any. */
  readonly table?: TableRef;
  readonly onClose: () => void;
}

/**
 * The assistant, on the database it is being asked about.
 *
 * Ask AI used to be a link to `/chat?database=…`, which answered the question
 * by leaving the screen that raised it. The panel now owns a fresh draft and
 * keeps its older database conversations in the shared History menu.
 */
export function DatabaseAssistantPanel({ database, table, onClose }: DatabaseAssistantPanelProps) {
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
    conversationNamespace: `database:${database}`,
    legacyConversationKey: `database-${database}`,
    title: database,
    // The one thing the chat picker made the visitor answer, already answered
    // by the route they are standing on.
    dataScope: { schema: database },
  });

  const scope = useMemo<readonly AssistantScopeChip[]>(() => {
    const chips: AssistantScopeChip[] = [
      { id: 'database', kind: t('assistant.scope.database'), value: database },
    ];
    if (table) {
      chips.push({ id: 'table', kind: t('assistant.scope.table'), value: table.table });
    }
    return chips;
  }, [database, table, t]);

  return (
    <AssistantPanel
      controllers={controllers}
      emptyDescription={t('database.assistantEmptyDescription')}
      emptyTitle={t('database.assistantEmptyTitle')}
      error={error}
      history={history}
      historyLoading={historyLoading}
      isStreaming={isStreaming}
      messages={messages}
      activeHistoryId={activeConversationId}
      onClose={onClose}
      onHistorySelect={selectConversation}
      onNewThread={startNewConversation}
      onSubmit={(text) => void send(text)}
      onApprovalDecision={decideApproval}
      openInChatHref={`/chat?database=${encodeURIComponent(database)}`}
      scope={scope}
      starters={[
        { id: 'tables', label: t('database.starterTables'), prompt: t('database.starterTables') },
        { id: 'query', label: t('database.starterQuery'), prompt: t('database.starterQuery') },
        {
          id: 'freshness',
          label: t('database.starterFreshness'),
          prompt: t('database.starterFreshness'),
        },
      ]}
      surface="database"
      title={t('database.assistantTitle')}
    />
  );
}
