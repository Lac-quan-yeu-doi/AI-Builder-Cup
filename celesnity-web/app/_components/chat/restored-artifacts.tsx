'use client';

import type { ReactElement } from 'react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { BlockArtifactCard } from './inline-message-block';
import type { MessageBlock } from './types';

interface RestoredArtifactsProps {
  readonly blocks: readonly MessageBlock[];
  readonly openIds?: ReadonlySet<string>;
  readonly onOpen: (block: MessageBlock, placement?: 'right') => void;
}

/**
 * The charts and tables a conversation produced before this page load.
 *
 * They cannot go back inline: the agent's transcript has no run ids, so nothing
 * says which turn made which artifact. Rather than drop them — which is what
 * happened until now, silently — they come back as the conversation's index at
 * the end of the transcript, in the order Core published them.
 *
 * Same card as the inline one, so opening a pane from here is the same action
 * it was before the reload.
 */
export function RestoredArtifacts({
  blocks,
  openIds,
  onOpen,
}: RestoredArtifactsProps): ReactElement | null {
  const { t } = useTranslation();
  if (blocks.length === 0) return null;

  return (
    <section
      aria-label={t('chat.restoredArtifacts.label')}
      className="grid gap-2 border-t border-border pt-4"
    >
      <p className="m-0 text-micro font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {t('chat.restoredArtifacts.title', { count: blocks.length })}
      </p>
      <div className="grid gap-2">
        {blocks.map((block) => (
          <BlockArtifactCard
            block={block}
            key={block.id}
            onOpen={onOpen}
            open={openIds?.has(`block:${block.id}`) === true}
          />
        ))}
      </div>
    </section>
  );
}
