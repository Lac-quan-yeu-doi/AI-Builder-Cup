import { describe, expect, it } from 'vitest';

import { blockBoundaries, splitBlocks } from '@/app/_components/chat/markdown-split';

describe('blockBoundaries', () => {
  it('cuts at every blank line that a paragraph or heading follows', () => {
    const content = 'One.\n\nTwo.\n\n## Three\n\nFour.';
    expect(blockBoundaries(content)).toEqual([
      'One.\n\n'.length,
      'One.\n\nTwo.\n\n'.length,
      'One.\n\nTwo.\n\n## Three\n\n'.length,
    ]);
  });

  it('cuts before or after a fenced code block, never inside it', () => {
    const content = 'Intro.\n\n```sql\nSELECT 1\n\nFROM t\n```\n\nAfter.';
    expect(blockBoundaries(content)).toEqual([
      'Intro.\n\n'.length,
      'Intro.\n\n```sql\nSELECT 1\n\nFROM t\n```\n\n'.length,
    ]);
  });

  it('does not cut before a list item or an indented line, which continue the block above', () => {
    const list = 'Steps:\n\n1. One\n\n2. Two\n\n- Three\n\n    code';
    expect(blockBoundaries(list)).toEqual([]);
    expect(blockBoundaries(list + '\n\nDone.')).toEqual([list.length + 2]);
  });

  it('cuts before a quote or a table, which stand on their own', () => {
    const content = 'A.\n\n> Quote\n\n| a |\n| - |\n\nB.';
    expect(blockBoundaries(content)).toEqual([
      'A.\n\n'.length,
      'A.\n\n> Quote\n\n'.length,
      'A.\n\n> Quote\n\n| a |\n| - |\n\n'.length,
    ]);
  });

  it('leaves a blank line with nothing after it yet in the last block', () => {
    expect(blockBoundaries('One.\n\n')).toEqual([]);
    expect(blockBoundaries('One.\n\nT')).toEqual(['One.\n\n'.length]);
  });
});

describe('splitBlocks', () => {
  it('turns the boundaries into blocks that start where they sit in the source', () => {
    expect(splitBlocks('One.\n\nTwo.\n\nThree')).toEqual([
      { start: 0, text: 'One.\n\n' },
      { start: 6, text: 'Two.\n\n' },
      { start: 12, text: 'Three' },
    ]);
    expect(splitBlocks('Only.')).toEqual([{ start: 0, text: 'Only.' }]);
  });
});
