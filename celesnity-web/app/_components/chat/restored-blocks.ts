import type { MessageBlock } from './types';
import { isArtifactBlock } from './message-block-content';

export interface RestoredBlockSplit {
  /** Blocks that belong to a message already on screen. */
  readonly attach: readonly MessageBlock[];
  /** Artifacts with no message to sit under, oldest first. */
  readonly restored: readonly MessageBlock[];
}

/**
 * Where a block fetched from history can go.
 *
 * A block names its run; a message restored from the agent's transcript does
 * not, because that transcript is `{ role, content, reasoning }` and nothing
 * more. So after a reload every artifact the conversation produced finds no
 * message to attach to. It used to be parked in a ref and dropped: the text of
 * the conversation came back and its charts and tables did not.
 *
 * Blocks whose run is still on screen attach as before. The rest come back as
 * a group the transcript can index at the end, which is the honest placement —
 * the data cannot say which turn produced them.
 *
 * Prose blocks are left out. A paragraph with no home is noise; a chart with no
 * home is work somebody lost.
 */
export function splitRestoredBlocks(
  messages: readonly { readonly runId?: string }[],
  blocks: readonly MessageBlock[],
): RestoredBlockSplit {
  const runs = new Set(messages.map((message) => message.runId).filter(Boolean));
  const attach: MessageBlock[] = [];
  const restored: MessageBlock[] = [];

  for (const block of blocks) {
    if (block.runId !== null && runs.has(block.runId)) {
      attach.push(block);
      continue;
    }
    if (isArtifactBlock(block)) restored.push(block);
  }

  return { attach, restored: [...restored].sort(byPublishedAt) };
}

function byPublishedAt(left: MessageBlock, right: MessageBlock): number {
  const leftAt = left.publishedAt ?? '';
  const rightAt = right.publishedAt ?? '';
  if (leftAt === rightAt) return left.id.localeCompare(right.id);
  return leftAt < rightAt ? -1 : 1;
}

/** Merges newly restored blocks into the ones already held, by id. */
export function mergeRestoredBlocks(
  current: readonly MessageBlock[],
  incoming: readonly MessageBlock[],
): readonly MessageBlock[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((block) => block.id));
  const added = incoming.filter((block) => !seen.has(block.id));
  return added.length === 0 ? current : [...current, ...added].sort(byPublishedAt);
}
