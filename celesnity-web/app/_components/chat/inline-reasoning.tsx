'use client';

import { useState } from 'react';

import { GrowIn } from '@/app/_components/ui/grow-in';
import { ChevronDownIcon } from '@/app/_components/ui/icons';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { ChatEventTrace, ToolActivity } from '@/app/_components/chat/types';
import { activityDetail, activityLabelKey, isVisibleActivityEvent } from './activity-display';
import { cn } from '@/app/_components/ui/utils';

import { describeTool, orbStateFor } from './tool-label';
import { ToolStatusMark } from './tool-status-mark';

interface InlineReasoningProps {
  readonly reasoning?: string;
  readonly toolActivity: readonly ToolActivity[];
  readonly eventTrace?: readonly ChatEventTrace[];
  readonly onOpen?: () => void;
  /** True for the reply still streaming, whose text the toggle appears above. */
  readonly growIn?: boolean;
}

/**
 * Palantir-inspired inline reasoning panel: collapses tool activity and
 * reasoning text into a "View reasoning" toggle. When expanded, shows
 * the tool chain with status indicators.
 *
 * The count used to be a bare number in a blue pill — "View reasoning 1" — so
 * the one thing it did not say was what it was counting. It names its unit now,
 * and the toggle is a disclosure control rather than a link: blue belongs to
 * links, focus and selection (CLAUDE.md rule 7), and a row of blue toggles down
 * the transcript pulls harder than the answers they sit above.
 */
export function InlineReasoning({
  reasoning,
  toolActivity,
  eventTrace = [],
  onOpen,
  growIn = false,
}: InlineReasoningProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const visibleTools = toolActivity.filter((tool) => tool.name !== 'publish_message_block');
  const visibleEvents = eventTrace.filter((event) => isVisibleActivityEvent(event.type));
  if (!reasoning && visibleTools.length === 0 && visibleEvents.length === 0) return null;

  // On a live reply the toggle appears above text already on screen — the
  // first tool call comes after the opening sentence — so it grows into
  // place rather than shoving the text down by a line. `GrowIn` mounts at
  // that moment: nothing renders until there is something to show.
  return (
    <GrowIn active={growIn} className="w-fit max-w-full">
      <div>
        <button
          data-tutorial-target="chat-reasoning-toggle"
          aria-expanded={expanded}
          type="button"
          onClick={() =>
            setExpanded((prev) => {
              if (!prev) onOpen?.();
              return !prev;
            })
          }
          className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-caption font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDownIcon
            size={13}
            className={
              expanded
                ? 'shrink-0 rotate-0 transition-transform'
                : 'shrink-0 -rotate-90 transition-transform'
            }
          />
          {t('chat.reasoning.toggle')}
          {visibleTools.length > 0 && (
            <span className="font-normal">
              ·{' '}
              {visibleTools.length === 1
                ? t('chat.reasoning.step')
                : t('chat.reasoning.steps', { count: visibleTools.length })}
            </span>
          )}
        </button>

        {expanded && (
          <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
            {/* Reasoning text */}
            {reasoning && (
              <p className="m-0 border-l-2 border-border pl-2.5 text-caption leading-relaxed text-muted-foreground italic">
                {reasoning}
              </p>
            )}

            {/* Tool chain: one checklist row per call — what it did, and to what. */}
            {visibleTools.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {visibleTools.map((tool) => {
                  const step = describeTool(tool.name, tool.arguments);
                  const failed = tool.status === 'failed';
                  return (
                    <div key={tool.id} className="flex items-center gap-2 text-caption">
                      <ToolStatusMark orbState={orbStateFor(step.labelKey)} status={tool.status} />
                      <span
                        className={cn(
                          'min-w-0 truncate',
                          failed ? 'text-destructive' : 'text-foreground',
                        )}
                        title={step.raw}
                      >
                        {t(step.labelKey)}
                        {step.detail === undefined ? null : (
                          <span className={failed ? undefined : 'text-muted-foreground'}>
                            {': '}
                            {step.detail}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'ml-auto shrink-0 text-micro',
                          failed ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {tool.status === 'running'
                          ? t('chat.reasoning.running')
                          : tool.status === 'done'
                            ? t('chat.reasoning.done')
                            : t('chat.reasoning.failed')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {visibleEvents.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                {visibleEvents.map((event) => (
                  <span
                    key={`${event.seq}-${event.type}`}
                    className="rounded-md bg-muted px-1.5 py-0.5 text-micro text-muted-foreground"
                  >
                    {t(activityLabelKey(event.type))}
                    {activityDetail(event.type, event.data) && (
                      <span className="ml-1 text-foreground/70">
                        · {activityDetail(event.type, event.data)}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </GrowIn>
  );
}
