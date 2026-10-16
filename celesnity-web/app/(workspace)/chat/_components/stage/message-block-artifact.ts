import type { MessageBlock } from '@/app/_components/chat/types';
import {
  ARTIFACT_KIND_KEY,
  artifactKindOf,
  artifactRowCountOf,
  artifactTitleOf,
  isArtifactBlock,
} from '@/app/_components/chat/message-block-content';
import type { Translator } from '@/app/_i18n/translate';

import type { Artifact } from './chat-stage.types';

/**
 * The stage's id for a block.
 *
 * Namespaced so it can never collide with the singleton artifacts, whose ids
 * are `chart:list`, `table:application-state` and the rest. Two id spaces in
 * one `Stage` is how a library pane and an answer would end up fighting over
 * the same tab.
 */
export function blockArtifactId(blockId: string): string {
  return `block:${blockId}`;
}

/**
 * A chart or table the conversation produced, as something the stage can hold.
 *
 * This is the whole of what the design system's first two rules need, and it
 * costs no request: `MessageBlock` already carries a stable `id` and a typed
 * `blockType`, and the payload already carries the title and the rows. Nothing
 * about Core changes to put an answer on the stage.
 *
 * Returns `null` for the block types that are prose. A paragraph is not an
 * artifact, and giving it a card would bury the ones that are.
 */
export function messageBlockArtifact(block: MessageBlock, t: Translator): Artifact | null {
  if (!isArtifactBlock(block)) return null;

  const artifactKind = artifactKindOf(block);
  const kind = artifactKind === 'chart' ? 'chart' : 'table';
  const kindLabel = t(ARTIFACT_KIND_KEY[artifactKind]);
  const rows = artifactRowCountOf(block);

  return {
    id: blockArtifactId(block.id),
    kind,
    title: artifactTitleOf(block) ?? kindLabel,
    meta:
      rows === null ? kindLabel : t('chat.artifact.meta', { kind: kindLabel, count: `${rows}` }),
  };
}
