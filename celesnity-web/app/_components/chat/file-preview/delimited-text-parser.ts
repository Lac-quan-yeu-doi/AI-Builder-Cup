export interface DelimitedTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly truncated: boolean;
}

export interface DelimitedParseOptions {
  readonly delimiter: ',' | '\t';
  readonly maxRows: number;
  readonly maxColumns: number;
}

export function parseDelimitedText(source: string, options: DelimitedParseOptions): DelimitedTable {
  const maxRows = Math.max(0, options.maxRows);
  const maxColumns = Math.max(1, options.maxColumns);
  const headers: string[] = [];
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let truncated = false;
  let parsedRowCount = 0;

  const pushField = () => {
    if (currentRow.length >= maxColumns) {
      truncated = true;
      currentField = '';
      return;
    }
    currentRow.push(currentField);
    currentField = '';
  };

  const pushRow = () => {
    const values = currentRow.slice(0, maxColumns);
    currentRow = [];
    if (headers.length === 0) {
      headers.push(...values);
      return;
    }

    parsedRowCount += 1;
    if (parsedRowCount > maxRows) {
      truncated = true;
      return;
    }

    const width = headers.length;
    rows.push([
      ...values.slice(0, width),
      ...Array.from({ length: Math.max(0, width - values.length) }, () => ''),
    ]);
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          currentField += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += character;
      }
      continue;
    }

    if (character === '"' && currentField.length === 0) {
      inQuotes = true;
      continue;
    }
    if (character === options.delimiter) {
      pushField();
      continue;
    }
    if (character === '\n' || character === '\r') {
      pushField();
      pushRow();
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      continue;
    }
    currentField += character;
  }

  if (inQuotes) truncated = true;
  if (currentField.length > 0 || currentRow.length > 0) {
    pushField();
    pushRow();
  }

  return { headers, rows, truncated };
}
