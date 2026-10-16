/**
 * Where a streaming markdown message can be cut without changing how any
 * piece renders: at a blank line that is followed by a block which stands on
 * its own — a paragraph, heading, quote, table or code fence. A blank line
 * inside a fenced code block, or followed by a list item or an indented line,
 * does not count: those blocks continue across it, and two renders would
 * split one list in two (restarting its numbers) or break a code block. A raw
 * HTML block can span blank lines too, so a line starting with `<` does not
 * count either.
 *
 * `ChatMarkdown` renders each piece on its own, keyed by where it starts in
 * the source. A piece that has settled is parsed once and left alone; only
 * the live piece at the end is rebuilt per tick — and because the keys are
 * offsets, a piece settling never re-creates the pieces after it. (Cutting
 * the message in a fixed head and a moving tail did: every time the head
 * grew, the tail's elements were rebuilt and their words faded in again.)
 */

export interface MarkdownBlock {
  /** Offset of the block in the source. */
  readonly start: number;
  readonly text: string;
}

export function splitBlocks(content: string): readonly MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let start = 0;
  for (const boundary of blockBoundaries(content)) {
    blocks.push({ start, text: content.slice(start, boundary) });
    start = boundary;
  }
  blocks.push({ start, text: content.slice(start) });
  return blocks;
}

/** Every offset at which `content` may be cut, ascending. */
export function blockBoundaries(content: string): readonly number[] {
  const boundaries: number[] = [];
  let fenceOpen = false;
  let lineStart = 0;
  while (lineStart < content.length) {
    const lineEnd = content.indexOf('\n', lineStart);
    const end = lineEnd === -1 ? content.length : lineEnd;
    const line = content.slice(lineStart, end);
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) fenceOpen = !fenceOpen;
    else if (!fenceOpen && line.trim() === '' && lineStart > 0) {
      const nextEnd = content.indexOf('\n', end + 1);
      const next = content.slice(end + 1, nextEnd === -1 ? content.length : nextEnd);
      if (startsOwnBlock(next)) boundaries.push(end + 1);
    }
    lineStart = end + 1;
  }
  return boundaries;
}

/** A block that no earlier block could claim as its continuation. */
function startsOwnBlock(line: string): boolean {
  return line.trim() !== '' && !/^(\s|[-*+]\s|\d+[.)]\s|<)/.test(line);
}
