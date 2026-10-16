import { parse } from 'csv-parse/sync';

/** Above this many bytes, a CSV upload is rejected before it's even parsed. */
export const MAX_CSV_BYTES = 10 * 1024 * 1024;
/** Above this many data rows (header excluded), a CSV upload is rejected. */
export const MAX_CSV_ROWS = 50_000;

export class CsvIngestionError extends Error {
  public readonly code: string;

  private constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CsvIngestionError';
  }

  public static tooLarge(bytes: number): CsvIngestionError {
    return new CsvIngestionError(
      'CSV_TOO_LARGE',
      `CSV file is ${bytes} bytes; the maximum is ${MAX_CSV_BYTES}.`,
    );
  }

  public static tooManyRows(rows: number): CsvIngestionError {
    return new CsvIngestionError(
      'CSV_TOO_MANY_ROWS',
      `CSV file has ${rows} data rows; the maximum is ${MAX_CSV_ROWS}.`,
    );
  }

  public static empty(): CsvIngestionError {
    return new CsvIngestionError('CSV_EMPTY', 'CSV file has a header but no data rows.');
  }

  public static malformed(reason: string): CsvIngestionError {
    return new CsvIngestionError('CSV_MALFORMED', `Could not parse CSV: ${reason}`);
  }
}

/**
 * Turns an uploaded CSV file into chart-ready data rows (AIP Analyst's
 * spreadsheet-ingestion pattern) — the first row is the header, every
 * other row becomes one record keyed by those column names. Each cell is
 * coerced to a number when the entire (trimmed) value parses as one, so a
 * caller gets quantitative encodings without a separate cleanup pass;
 * anything else — including an empty cell — is kept as the literal string
 * `csv-parse` produced.
 */
export function parseCsvToChartRows(csv: Buffer): readonly Record<string, unknown>[] {
  if (csv.length > MAX_CSV_BYTES) {
    throw CsvIngestionError.tooLarge(csv.length);
  }

  let records: Record<string, string>[];
  try {
    records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    throw CsvIngestionError.malformed(err instanceof Error ? err.message : 'unknown parse error');
  }

  if (records.length === 0) {
    throw CsvIngestionError.empty();
  }
  if (records.length > MAX_CSV_ROWS) {
    throw CsvIngestionError.tooManyRows(records.length);
  }

  return records.map(coerceRow);
}

function coerceRow(row: Record<string, string>): Record<string, unknown> {
  const coerced: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    coerced[column] = coerceValue(value);
  }
  return coerced;
}

function coerceValue(value: string): unknown {
  if (value === '') return value;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : value;
}
