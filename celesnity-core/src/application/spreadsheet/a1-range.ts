export interface GridBounds {
  readonly startRow: number;
  readonly endRow?: number;
  readonly startColumn: number;
  readonly endColumn?: number;
}

const CELL = /^([A-Z]*)(\d*)$/u;

export function parseA1Range(range: string): GridBounds | undefined {
  const [first, second, ...rest] = range.trim().toUpperCase().split(':');
  if (!first || rest.length > 0) return undefined;
  const start = parseCell(first);
  const end = second === undefined ? start : parseCell(second);
  if (!start || !end) return undefined;
  const startRow = start.row ?? 0;
  const startColumn = start.column ?? 0;
  if ((end.row !== undefined && end.row < startRow) || (end.column !== undefined && end.column < startColumn)) {
    return undefined;
  }
  return {
    startRow,
    startColumn,
    ...(end.row === undefined ? {} : { endRow: end.row }),
    ...(end.column === undefined ? {} : { endColumn: end.column }),
  };
}

export function formatA1Range(bounds: Required<GridBounds>): string {
  return `${columnName(bounds.startColumn)}${bounds.startRow + 1}:${columnName(bounds.endColumn)}${bounds.endRow + 1}`;
}

export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function parseCell(value: string): { row?: number; column?: number } | undefined {
  const match = CELL.exec(value);
  if (!match || (match[1] === '' && match[2] === '')) return undefined;
  const [, letters = '', digits = ''] = match;
  const row = digits === '' ? undefined : Number(digits) - 1;
  if (row !== undefined && row < 0) return undefined;
  const column =
    letters === ''
      ? undefined
      : [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  return { ...(row === undefined ? {} : { row }), ...(column === undefined ? {} : { column }) };
}
