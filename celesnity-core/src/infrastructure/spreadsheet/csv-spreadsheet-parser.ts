import { parse } from 'csv-parse/sync';

import { CloudFileError, CloudFileErrorCode } from '@application/cloud-file/errors/cloud-file.error';
import type {
  ISpreadsheetParser,
  ParsedWorkbook,
} from '@application/spreadsheet/interfaces/i-spreadsheet-parser';

const CSV_MIMES = new Set(['text/csv', 'application/csv', 'text/comma-separated-values']);

export class CsvSpreadsheetParser implements ISpreadsheetParser {
  public constructor(private readonly maxCells: number) {}

  public supports(mimeType: string): boolean {
    return CSV_MIMES.has(mimeType);
  }

  public parse(bytes: Uint8Array): Promise<ParsedWorkbook> {
    let rows: string[][];
    try {
      rows = parse(Buffer.from(bytes).toString('utf8'), {
        bom: true,
        relax_column_count: true,
        relax_quotes: true,
      });
    } catch (error) {
      throw new CloudFileError(
        CloudFileErrorCode.UNSUPPORTED_FORMAT,
        `The CSV could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const cells = rows.reduce((total, row) => total + row.length, 0);
    if (cells > this.maxCells) {
      throw new CloudFileError(CloudFileErrorCode.TOO_LARGE, `The CSV has more than ${this.maxCells} cells.`);
    }
    return Promise.resolve({ sheets: [{ name: 'Sheet1', hidden: false, rows }] });
  }
}
