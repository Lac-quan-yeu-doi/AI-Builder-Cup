'use client';

import { useMemo, useState } from 'react';
import { MessageSquareIcon, SearchIcon, SquarePenIcon } from 'lucide-react';

import { IconButton } from '@/app/_components/ui/icon-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { Input } from '@/app/_components/ui/input';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import { useChatSessionsStore } from '@/app/_stores/chat-sessions.store';
import type { ChatSession } from '@/app/_components/chat/types';

interface ConversationsMenuProps {
  readonly activeId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onNew: () => void;
  readonly sessions?: readonly ChatSession[];
  readonly onOpen?: () => void;
}

/**
 * The conversation switcher, translated from the reference thread switcher
 * into the existing workspace shell. Search stays local to the hydrated
 * session store; richer status/pin/archive actions require session API fields
 * that are not part of the production contract yet.
 */
export function ConversationsMenu({
  activeId,
  onSelect,
  onNew,
  sessions: providedSessions,
  onOpen,
}: ConversationsMenuProps) {
  const { t } = useTranslation();
  const storedSessions = useChatSessionsStore((state) => state.sessions);
  const sessions = providedSessions ?? storedSessions;
  const [search, setSearch] = useState('');
  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => {
      return `${session.title} ${session.databaseName ?? ''}`.toLowerCase().includes(query);
    });
  }, [search, sessions]);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) onOpen?.();
        else setSearch('');
      }}
    >
      <DropdownMenuTrigger asChild>
        <IconButton
          data-tutorial-target="chat-conversation-history"
          label={t('chat.conversations.open')}
        >
          <MessageSquareIcon size={18} />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-72">
        <DropdownMenuItem
          data-tutorial-target="chat-new-conversation"
          onSelect={onNew}
          className="gap-2 font-medium"
        >
          <SquarePenIcon className="size-4" />
          {t('chat.newConversation')}
        </DropdownMenuItem>
        {sessions.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="relative px-1 pb-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                aria-label={t('chat.conversations.search')}
                placeholder={t('chat.conversations.search')}
                className="h-8 pl-8 text-xs"
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </div>
            <DropdownMenuLabel className="text-micro tracking-[0.08em] text-muted-foreground uppercase">
              {t('nav.recents')}
            </DropdownMenuLabel>
            {filteredSessions.length > 0 ? (
              filteredSessions.map((session) => (
                <DropdownMenuItem
                  data-tutorial-target={
                    session.id === sessions[0]?.id ? 'chat-conversation-first' : undefined
                  }
                  key={session.id}
                  onSelect={() => onSelect(session.id)}
                  className={cn(
                    'gap-2',
                    session.id === activeId && 'bg-accent font-medium text-accent-foreground',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{session.title}</span>
                  {session.databaseName !== null && (
                    <span className="shrink-0 font-mono text-micro text-muted-foreground/70">
                      {session.databaseName}
                    </span>
                  )}
                </DropdownMenuItem>
              ))
            ) : (
              <div role="status" className="px-2 py-2 text-xs text-muted-foreground">
                {t('chat.conversations.noMatches')}
              </div>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
