'use client';

import { cn } from '@/app/_components/ui/utils';
import { IconButton } from '@/app/_components/ui/icon-button';
import { PanelLeftCloseIcon } from '@/app/_components/ui/icons';
import { useTranslation } from '@/app/_i18n/use-translation';

import type { DisplayMessage } from '@/app/_components/chat/types';
import { parseSystemReminderContent } from '@/app/_components/chat/system-reminder';

interface ChatTimelineRailProps {
  readonly messages: readonly DisplayMessage[];
  readonly onSelect: (messageId: string) => void;
  readonly onClose: () => void;
}

/**
 * A collapsible outline of the current conversation — AIP Analyst's
 * icon-coded step list, scaled down to what celesnity-web already tracks per
 * message (`DisplayMessage.toolActivity`) rather than fetching a separate
 * trace. Selecting an entry scrolls the transcript to it; this component
 * only reports the choice; `chat-screen.tsx` owns the actual scrolling via
 * its own message refs.
 */
export function ChatTimelineRail({ messages, onSelect, onClose }: ChatTimelineRailProps) {
  const { t } = useTranslation();
  const entries = messages
    .map((message) => ({ message, toolCount: countVisibleTools(message) }))
    .filter(({ message, toolCount }) => message.content.length > 0 || toolCount > 0);

  const labelFor = (message: DisplayMessage): string => {
    const parsed = parseSystemReminderContent(message.content);
    if (!parsed.content && parsed.reminders.length > 0) return t('chat.systemUpdate');
    if (parsed.content.length > 0) return parsed.content;
    return '…';
  };

  return (
    <div
      role="complementary"
      aria-label={t('chat.timeline.title')}
      className="absolute inset-y-0 left-0 z-20 flex w-[240px] flex-col border-r border-border bg-card shadow-300"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <h3 className="m-0 text-caption font-semibold text-foreground">
          {t('chat.timeline.title')}
        </h3>
        <IconButton label={t('chat.timeline.close')} size="sm" onClick={onClose}>
          <PanelLeftCloseIcon size={16} />
        </IconButton>
      </div>
      <ol className="m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto p-2">
        {entries.map(({ message, toolCount }) => (
          <li key={message.id}>
            <button
              type="button"
              onClick={() => onSelect(message.id)}
              aria-label={`${message.role === 'user' ? t('chat.timeline.you') : t('chat.timeline.assistant')}: ${labelFor(message)}`}
              className="flex w-full cursor-pointer items-start gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left transition-colors hover:bg-muted"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1 size-1.5 shrink-0 rounded-full',
                  message.role === 'user' ? 'bg-muted-foreground' : 'bg-accent',
                )}
              />
              <span aria-hidden="true" className="min-w-0 flex-1">
                <span className="block truncate text-caption text-foreground">
                  {labelFor(message)}
                </span>
                {toolCount > 0 && (
                  <span className="block text-micro text-muted-foreground">
                    {t('chat.timeline.toolCount', { count: toolCount })}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function countVisibleTools(message: DisplayMessage): number {
  return (message.toolActivity ?? []).filter((tool) => tool.name !== 'publish_message_block')
    .length;
}
