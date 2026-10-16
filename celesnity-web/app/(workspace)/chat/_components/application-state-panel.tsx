'use client';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/_components/ui/tooltip';

export interface ApplicationStatePanelProps {
  /** User-visible variables the agent has set this session, keyed by name. */
  readonly state: Readonly<Record<string, unknown>>;
}

/**
 * Live view of the agent's named application-state variables
 * (`SetApplicationState`) — set from the tool's own `tool_started` args on
 * the room stream, so this reflects only what happened since the page was
 * loaded, not a durable read (see `parse-sse-stream.ts`).
 */
export function ApplicationStatePanel({ state }: ApplicationStatePanelProps) {
  const { t } = useTranslation();
  const entries = Object.entries(state);
  if (entries.length === 0) return null;

  return (
    <div
      className="flex min-w-0 items-center gap-1.5 overflow-x-auto"
      aria-label={t('chat.applicationState.label')}
    >
      {entries.map(([name, value]) => (
        <Tooltip key={name}>
          <TooltipTrigger asChild>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-muted-foreground">
              {name}
              <span className="ml-1 font-semibold text-foreground">{formatValue(value)}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{`${name}: ${formatValue(value)}`}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
