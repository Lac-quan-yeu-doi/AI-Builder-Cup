import { describe, expect, it } from 'vitest';

import { parseDelimitedText } from '@/app/_components/chat/file-preview/delimited-text-parser';

const csv = (source: string, overrides: Partial<Parameters<typeof parseDelimitedText>[1]> = {}) =>
  parseDelimitedText(source, {
    delimiter: ',',
    maxRows: 2_000,
    maxColumns: 100,
    ...overrides,
  });

describe('parseDelimitedText', () => {
  it('uses the first row as headers and parses quoted delimiters', () => {
    expect(csv('name,notes\nAda,"a,b"')).toEqual({
      headers: ['name', 'notes'],
      rows: [['Ada', 'a,b']],
      truncated: false,
    });
  });

  it('parses escaped quotes and multiline fields', () => {
    expect(csv('name,note\nAda,"say ""hello""\nnext"')).toEqual({
      headers: ['name', 'note'],
      rows: [['Ada', 'say "hello"\nnext']],
      truncated: false,
    });
  });

  it('supports tabs, CRLF, and empty cells', () => {
    expect(
      parseDelimitedText('name\tage\r\nAda\t\r\n', {
        delimiter: '\t',
        maxRows: 2_000,
        maxColumns: 100,
      }),
    ).toEqual({
      headers: ['name', 'age'],
      rows: [['Ada', '']],
      truncated: false,
    });
  });

  it('pads short rows and truncates columns above the bound', () => {
    expect(csv('a,b,c\n1', { maxColumns: 2 })).toEqual({
      headers: ['a', 'b'],
      rows: [['1', '']],
      truncated: true,
    });
  });

  it('truncates data rows above the bound', () => {
    expect(csv('a\n1\n2\n3', { maxRows: 2 })).toEqual({
      headers: ['a'],
      rows: [['1'], ['2']],
      truncated: true,
    });
  });

  it('returns an empty table for empty input', () => {
    expect(csv('')).toEqual({ headers: [], rows: [], truncated: false });
  });

  it('returns safe partial data for an unterminated quoted field', () => {
    expect(csv('name,note\nAda,"unfinished')).toEqual({
      headers: ['name', 'note'],
      rows: [['Ada', 'unfinished']],
      truncated: true,
    });
  });
});
