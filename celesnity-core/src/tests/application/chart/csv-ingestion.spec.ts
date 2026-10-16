import {
  CsvIngestionError,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  parseCsvToChartRows,
} from '@application/chart/csv-ingestion';

function csv(text: string): Buffer {
  return Buffer.from(text, 'utf-8');
}

describe('parseCsvToChartRows', () => {
  it('turns the header row into keys and every other row into a record', () => {
    const rows = parseCsvToChartRows(csv('month,revenue\nJan,100\nFeb,150\n'));

    expect(rows).toEqual([
      { month: 'Jan', revenue: 100 },
      { month: 'Feb', revenue: 150 },
    ]);
  });

  it('coerces a cell to a number only when the whole trimmed value is numeric', () => {
    const rows = parseCsvToChartRows(csv('label,value\nq1-2026,42\n'));

    expect(rows).toEqual([{ label: 'q1-2026', value: 42 }]);
  });

  it('keeps an empty cell as an empty string rather than coercing it to 0', () => {
    const rows = parseCsvToChartRows(csv('a,b\n1,\n'));

    expect(rows).toEqual([{ a: 1, b: '' }]);
  });

  it('handles quoted fields containing commas and embedded newlines', () => {
    const rows = parseCsvToChartRows(csv('name,note\n"Acme, Inc.","line one\nline two"\n'));

    expect(rows).toEqual([{ name: 'Acme, Inc.', note: 'line one\nline two' }]);
  });

  it('strips a UTF-8 BOM if present', () => {
    const rows = parseCsvToChartRows(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csv('a\n1\n')]),
    );

    expect(rows).toEqual([{ a: 1 }]);
  });

  it('skips blank lines', () => {
    const rows = parseCsvToChartRows(csv('a,b\n1,2\n\n3,4\n'));

    expect(rows).toEqual([
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ]);
  });

  it('rejects a file over the byte limit before attempting to parse it', () => {
    const oversized = Buffer.alloc(MAX_CSV_BYTES + 1, 'a');

    try {
      parseCsvToChartRows(oversized);
      fail('expected CsvIngestionError');
    } catch (err) {
      expect(err).toBeInstanceOf(CsvIngestionError);
      expect((err as CsvIngestionError).code).toBe('CSV_TOO_LARGE');
    }
  });

  it('rejects a header with no data rows', () => {
    try {
      parseCsvToChartRows(csv('a,b\n'));
      fail('expected CsvIngestionError');
    } catch (err) {
      expect(err).toBeInstanceOf(CsvIngestionError);
      expect((err as CsvIngestionError).code).toBe('CSV_EMPTY');
    }
  });

  it('rejects more data rows than the configured maximum', () => {
    const header = 'a\n';
    const body = Array.from({ length: MAX_CSV_ROWS + 1 }, (_, i) => `${i}`).join('\n');

    try {
      parseCsvToChartRows(csv(header + body));
      fail('expected CsvIngestionError');
    } catch (err) {
      expect((err as CsvIngestionError).code).toBe('CSV_TOO_MANY_ROWS');
    }
  });

  it('rejects malformed CSV rather than throwing an unlabeled parser error', () => {
    // An unterminated quoted field.
    try {
      parseCsvToChartRows(csv('a,b\n"unterminated,2\n'));
      fail('expected CsvIngestionError');
    } catch (err) {
      expect(err).toBeInstanceOf(CsvIngestionError);
      expect((err as CsvIngestionError).code).toBe('CSV_MALFORMED');
    }
  });
});
