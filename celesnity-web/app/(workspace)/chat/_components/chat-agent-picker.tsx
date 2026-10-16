'use client';

import { BotIcon, CheckIcon } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { useTranslation } from '@/app/_i18n/use-translation';
import { cn } from '@/app/_components/ui/utils';
import type { AgentManifestSummary } from '@/src/entities/models/agent-manifest';

interface ChatAgentPickerProps {
  readonly agents: readonly AgentManifestSummary[];
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

export function ChatAgentPicker({ agents, disabled, onChange, value }: ChatAgentPickerProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={t('chat.agentPicker.label')}
        title={`${t('chat.agentPicker.label')}: ${value}`}
        disabled={disabled}
        className={cn(
          'flex h-8 max-w-[min(48vw,220px)] shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-card/80 px-2 text-caption',
          'text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <BotIcon aria-hidden="true" size={17} />
        <span className="truncate font-mono">{value}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[190px]" side="top">
        <DropdownMenuLabel>{t('chat.agentPicker.label')}</DropdownMenuLabel>
        {agents.map((agent) => (
          <DropdownMenuItem key={agent.name} onSelect={() => onChange(agent.name)}>
            <CheckIcon
              aria-hidden="true"
              className={cn(value !== agent.name && 'invisible')}
              size={17}
            />
            <span className="truncate font-mono">{agent.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
