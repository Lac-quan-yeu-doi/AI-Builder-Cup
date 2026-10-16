'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRightIcon, BookmarkIcon, CheckIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import { Spinner } from '@/app/_components/ui/spinner';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import { defaultKeepDestination } from '@/app/_components/shared/chart-collection-options';
import type { ChatChartPreview } from '@/src/entities/models/chat-chart-preview';
import type { ListChartCollectionsController } from '@/src/interface-adapters/controllers/chart-collections/list-chart-collections.controller';
import type { SaveChatChartPreviewController } from '@/src/interface-adapters/controllers/canonical-charts/save-chat-chart-preview.controller';

export interface KeptChart {
  readonly chartId: string;
  readonly collectionName: string;
}

interface ArtifactKeepProps {
  readonly preview: ChatChartPreview;
  /** The question this chart answers, used when the agent wrote no description. */
  readonly question: string | null;
  /** Set once this artifact has been kept, so the state survives a tab switch. */
  readonly kept: KeptChart | undefined;
  readonly onKept: (kept: KeptChart) => void;
  readonly listCollections: ListChartCollectionsController;
  readonly saveChatPreview: SaveChatChartPreviewController;
}

type Phase = 'idle' | 'keeping' | 'failed';

/**
 * Keeping an answer.
 *
 * A chat chart and a chart in Our analytics are the same payload: the save
 * takes exactly what the preview already carries, plus a collection. So this is
 * a promotion rather than a conversion, and it is one press. The destination is
 * derived — the person's own collection — instead of being demanded up front by
 * a dialog, which in a workspace with one collection was a required choice with
 * a single option.
 *
 * The state replaces the action in place. No toast: where a thing went belongs
 * beside the thing, next to where it came from, and it has to still be there
 * when somebody looks back a minute later.
 */
export function ArtifactKeep({
  preview,
  question,
  kept,
  onKept,
  listCollections,
  saveChatPreview,
}: ArtifactKeepProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /*
   * Settles in rather than snapping: the state took a round trip to arrive, and
   * a swap with no transition reads as a glitch rather than a result.
   */
  if (kept) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground motion-safe:animate-message-in">
        <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
        {t('chat.keep.done')}
        <Link
          className="inline-flex min-w-0 items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
          href={`/analytics/charts/${encodeURIComponent(kept.chartId)}`}
        >
          <span className="truncate">{kept.collectionName}</span>
          <ArrowUpRightIcon aria-hidden="true" className="size-3 shrink-0" />
        </Link>
      </span>
    );
  }

  /*
   * A capped preview is a sample, and Core refuses to store one. Saying so on a
   * disabled control is better than a button that throws when pressed.
   */
  if (preview.truncated) {
    return (
      <Button disabled size="sm" title={t('chat.keep.truncatedReason')} variant="ghost">
        <BookmarkIcon aria-hidden="true" className="size-3.5" />
        {t('chat.keep.truncated')}
      </Button>
    );
  }

  const keep = async (): Promise<void> => {
    setPhase('keeping');
    setFailure(null);
    try {
      const destination = defaultKeepDestination(await listCollections());
      if (destination === null) throw new Error(t('chat.keep.noCollection'));

      const chart = await saveChatPreview({
        title: preview.title,
        description: preview.description ?? question,
        collectionId: destination.collection.id,
        queryDefinition: preview.queryDefinition,
        visualizationDefinition: preview.visualizationDefinition,
        outputSchema: preview.outputSchema,
        parameterValues: preview.parameterValues,
        truncated: preview.truncated,
      });
      if (!alive.current) return;
      onKept({ chartId: chart.id, collectionName: destination.collection.name });
    } catch (cause) {
      if (!alive.current) return;
      setFailure(cause instanceof Error && cause.message ? cause.message : t('chat.keep.failed'));
      setPhase('failed');
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      {failure === null ? null : (
        <span className="max-w-[18rem] truncate text-caption text-destructive" role="alert">
          {failure}
        </span>
      )}
      <Button
        className={cn('gap-1.5', phase === 'keeping' && 'pointer-events-none')}
        disabled={phase === 'keeping'}
        onClick={() => void keep()}
        size="sm"
      >
        {phase === 'keeping' ? (
          <Spinner className="size-3.5" />
        ) : (
          <BookmarkIcon aria-hidden="true" className="size-3.5" />
        )}
        {phase === 'keeping' ? t('chat.keep.keeping') : t('chat.keep.action')}
      </Button>
    </span>
  );
}
