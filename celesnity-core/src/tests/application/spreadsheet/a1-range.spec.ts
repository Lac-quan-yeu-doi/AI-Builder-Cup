import { columnName, formatA1Range, parseA1Range } from '@application/spreadsheet/a1-range';

describe('A1 ranges', () => {
  it.each([
    ['A1:F200', { startRow: 0, endRow: 199, startColumn: 0, endColumn: 5 }],
    ['c5', { startRow: 4, endRow: 4, startColumn: 2, endColumn: 2 }],
    ['B:D', { startRow: 0, startColumn: 1, endColumn: 3 }],
    ['3:10', { startRow: 2, endRow: 9, startColumn: 0 }],
    ['AA1:AB2', { startRow: 0, endRow: 1, startColumn: 26, endColumn: 27 }],
  ])('parses %s', (range, bounds) => {
    expect(parseA1Range(range)).toEqual(bounds);
  });

  it.each(['', 'Sheet1!A1', 'A0', 'B2:A1', 'A1:B2:C3', '1A'])('rejects %p', (range) => {
    expect(parseA1Range(range)).toBeUndefined();
  });

  it('formats bounds and column names', () => {
    expect(formatA1Range({ startRow: 0, endRow: 9, startColumn: 0, endColumn: 27 })).toBe('A1:AB10');
    expect(columnName(25)).toBe('Z');
    expect(columnName(701)).toBe('ZZ');
  });
});
