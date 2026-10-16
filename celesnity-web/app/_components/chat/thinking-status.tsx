'use client';

import { useEffect, useState } from 'react';

import { ShimmerText } from '@/app/_components/ui/shimmer-text';
import { TextWipe } from '@/app/_components/ui/text-wipe';
import { ThinkingOrb, type ThinkingOrbState } from '@/app/_components/ui/thinking-orb';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { TranslationKey } from '@/app/_i18n/en';
import type { ToolActivity } from '@/app/_components/chat/types';

import { describeTool, orbStateFor } from './tool-label';
import { ToolStatusMark } from './tool-status-mark';

/**
 * What the agent is doing while nothing has been said yet, told two ways: the
 * orb changes shape and a line under "Thinking…" changes with it. When a tool
 * is actually running, both follow the tool; otherwise they walk through the
 * phases below, so a long wait still reads as work in progress rather than a
 * stalled spinner.
 */
const THINKING_PHASES: readonly {
  readonly state: ThinkingOrbState;
  readonly labelKey: Extract<TranslationKey, `chat.thinking.phase.${string}`>;
}[] = [
  { state: 'working', labelKey: 'chat.thinking.phase.working' },
  { state: 'searching', labelKey: 'chat.thinking.phase.searching' },
  { state: 'solving', labelKey: 'chat.thinking.phase.solving' },
  { state: 'weaving', labelKey: 'chat.thinking.phase.weaving' },
  { state: 'composing', labelKey: 'chat.thinking.phase.composing' },
];

/** Long enough to read the line, short enough that a wait never looks stuck. */
export const THINKING_PHASE_MS = 2_600;

interface ThinkingStatusProps {
  /** The turn's tool calls so far, in the order they were made. */
  readonly tools?: readonly ToolActivity[];
  /**
   * Whether the finished calls are listed under the card. Off when the card
   * sits under a reply that has started, where the reasoning toggle above
   * the text already counts the steps.
   */
  readonly steps?: boolean;
}

export function ThinkingStatus({ tools = [], steps = true }: ThinkingStatusProps) {
  const { t } = useTranslation();
  const visibleTools = tools.filter((tool) => tool.name !== 'publish_message_block');
  const running = visibleTools.find((tool) => tool.status === 'running');
  // The card is the step in progress; the chips are the steps behind it.
  const finished = steps ? visibleTools.filter((tool) => tool.status !== 'running') : [];
  const phase = THINKING_PHASES[useThinkingPhase(running !== undefined)] ?? THINKING_PHASES[0]!;

  const step = running === undefined ? undefined : describeTool(running.name, running.arguments);
  const state = step === undefined ? phase.state : orbStateFor(step.labelKey);
  const detail =
    step === undefined
      ? t(phase.labelKey)
      : step.detail === undefined
        ? t(step.labelKey)
        : `${t(step.labelKey)}: ${step.detail}`;
  const seconds = useElapsedSeconds(running?.id);

  return (
    <div className="flex w-fit max-w-full flex-col gap-2">
      {/* Hugs its content like a bubble: a tile for the orb, the title beside
          it, the phase underneath. The minimum width keeps the card from
          resizing every time the caption changes. */}
      <div className="flex w-fit min-w-56 max-w-full items-center gap-3 self-start rounded-xl bg-status-info-light/25 py-2 pr-4 pl-2.5 shadow-hairline">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-status-info-light">
          <ThinkingOrb label={t('chat.thinking')} size={32} state={state} tint="text-status-info" />
        </span>
        {/* Both lines carry the sheen: a status that only sits there reads
            as finished. The title shines in its own, darker ink. */}
        <span className="flex min-w-0 flex-col">
          <ShimmerText className="text-body-sm font-semibold text-foreground motion-safe:from-foreground motion-safe:via-foreground/45 motion-safe:to-foreground">
            {t('chat.thinking')}
          </ShimmerText>
          {/* The caption changes with the work; each change is wiped in by a
              block cursor rather than swapped, so the line reads as being
              rewritten. */}
          <span className="flex min-w-0 items-baseline gap-1">
            <ShimmerText
              className="truncate text-caption text-muted-foreground"
              data-thinking-phase={state}
            >
              <TextWipe text={detail} />
            </ShimmerText>
            {/* How long this step has run. Kept out of the live region: a
                number that changes every second would be read out every
                second. */}
            {seconds > 0 && (
              <span
                aria-hidden="true"
                data-thinking-elapsed={seconds}
                className="shrink-0 text-caption text-muted-foreground tabular-nums"
              >
                · {seconds}s
              </span>
            )}
          </span>
        </span>
      </div>
      {finished.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {finished.map((tool) => {
            const toolStep = describeTool(tool.name, tool.arguments);
            return (
              <span
                key={tool.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-2.5 pl-1.5 text-caption text-muted-foreground"
                title={toolStep.raw}
              >
                <ToolStatusMark orbState={orbStateFor(toolStep.labelKey)} status={tool.status} />
                <span className="truncate">
                  {t(toolStep.labelKey)}
                  {toolStep.detail === undefined ? null : `: ${toolStep.detail}`}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Walks the phases while nothing more specific is known. Held still while a
 * tool runs (the tool names the phase) and under reduced motion, where a line
 * that keeps rewording itself is the kind of movement being asked to stop.
 */
function useThinkingPhase(paused: boolean): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused || prefersReducedMotion()) return undefined;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % THINKING_PHASES.length),
      THINKING_PHASE_MS,
    );
    return () => clearInterval(timer);
  }, [paused]);
  return index;
}

/**
 * Seconds since this step began, starting over when a different tool takes
 * the card. Counted from a timestamp rather than by incrementing, so a tab
 * left in the background, where timers are throttled, still shows the real
 * wait when it comes back.
 */
function useElapsedSeconds(stepKey: string | undefined): number {
  const [seconds, setSeconds] = useState(0);
  const [trackedKey, setTrackedKey] = useState(stepKey);
  if (trackedKey !== stepKey) {
    setTrackedKey(stepKey);
    setSeconds(0);
  }
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000))),
      1_000,
    );
    return () => clearInterval(timer);
  }, [stepKey]);
  return seconds;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
