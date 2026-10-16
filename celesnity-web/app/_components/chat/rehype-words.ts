/**
 * A rehype plugin that puts every word of prose in its own
 * `<span data-token="…">`, where the value is the word's offset in the
 * markdown source. `ChatMarkdown` reads it to tell the words that just
 * streamed in from the ones already on screen, so only the new ones fade in
 * (the idea behind flowtoken's "diff" mode, done inside our own renderer).
 * Whitespace stays as text between the spans, so lines still wrap and the
 * text still selects and copies as prose. Code is left whole: a fenced block
 * is copied and highlighted as one piece.
 */

/** The slice of a hast node this plugin touches. */
interface Node {
  readonly type: string;
  tagName?: string;
  value?: string;
  children?: Node[];
  properties?: Record<string, unknown>;
  position?: { readonly start: { readonly offset?: number } };
}

const UNSPLIT = new Set(['code', 'pre']);

export function rehypeWords() {
  return (tree: Node): void => {
    splitWords(tree);
  };
}

function splitWords(node: Node): void {
  if (node.children === undefined || (node.tagName !== undefined && UNSPLIT.has(node.tagName)))
    return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return wordsOf(child);
    splitWords(child);
    return [child];
  });
}

function wordsOf(text: Node): Node[] {
  const base = text.position?.start.offset;
  // A node the parser made up (no source position) has no offset to key
  // on; it stays whole and never animates.
  if (base === undefined || text.value === undefined) return [text];
  const out: Node[] = [];
  let at = 0;
  for (const part of text.value.split(/(\s+)/)) {
    if (part !== '') {
      out.push(
        /^\s+$/.test(part)
          ? { type: 'text', value: part }
          : {
              type: 'element',
              tagName: 'span',
              properties: { dataToken: base + at },
              children: [{ type: 'text', value: part }],
            },
      );
    }
    at += part.length;
  }
  return out;
}
