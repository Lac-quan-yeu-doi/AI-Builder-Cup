'use client';

import { CheckIcon, XIcon } from 'lucide-react';

import { ThinkingOrb, type ThinkingOrbState } from '@/app/_components/ui/thinking-orb';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { ToolActivity } from '@/app/_components/chat/types';

/*
 * A checkbox-sized mark, so a chain of tool calls reads as a list of steps
 * being ticked off: a tick once a step finished, a cross when it failed, and
 * the orb — searching, composing, weaving — while it is still going, now that
 * the agent announces a call before running it. The status word beside the
 * mark carries the same fact for a screen reader, so the mark is decorative.
 */
export function ToolStatusMark({
  status,
  orbState,
}: {
  readonly status: ToolActivity['status'];
  readonly orbState: ThinkingOrbState;
}) {
  const { t } = useTranslation();
  return (
    <span
      aria-hidden="true"
      data-tool-status={status}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center',
        status !== 'running' && 'rounded-sm border',
        status === 'done' &&
          'border-status-success/40 bg-status-success-light text-status-success-dark',
        status === 'failed' && 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
    >
      {status === 'running' ? (
        <ThinkingOrb label={t('chat.reasoning.running')} size={20} state={orbState} />
      ) : status === 'done' ? (
        <CheckIcon className="size-3.5" strokeWidth={3} />
      ) : (
        <XIcon className="size-3.5" strokeWidth={3} />
      )}
    </span>
  );
}
