import { Workbook, type Cell, type CellValue as ExcelCellValue } from 'exceljs';

import { CloudFileError, CloudFileErrorCode } from '@application/cloud-file/errors/cloud-file.error';
import type {
  ISpreadsheetParser,
  ParsedSheet,
  ParsedWorkbook,
} from '@application/spreadsheet/interfaces/i-spreadsheet-parser';
import type { CellValue } from '@application/spreadsheet/interfaces/spreadsheet.models';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class ExcelJsSpreadsheetParser implements ISpreadsheetParser {
  public constructor(private readonly maxCells: number) {}

  public supports(mimeType: string): boolean {
    return mimeType === XLSX_MIME;
  }

  public async parse(bytes: Uint8Array): Promise<ParsedWorkbook> {
    const workbook = new Workbook();
    try {
      await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    } catch (error) {
      throw new CloudFileError(
        CloudFileErrorCode.UNSUPPORTED_FORMAT,
        `The workbook could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let cells = 0;
    const sheets: ParsedSheet[] = [];
    for (const worksheet of workbook.worksheets) {
      const rowCount = worksheet.actualRowCount === 0 ? 0 : worksheet.rowCount;
      const columnCount = worksheet.columnCount;
      cells += rowCount * columnCount;
      if (cells > this.maxCells) {
        throw new CloudFileError(
          CloudFileErrorCode.TOO_LARGE,
          `The workbook has more than ${this.maxCells} cells.`,
        );
      }
      const rows: CellValue[][] = [];
      for (let r = 1; r <= rowCount; r += 1) {
        const row = worksheet.getRow(r);
        const values: CellValue[] = [];
        for (let c = 1; c <= columnCount; c += 1) values.push(readCell(row.getCell(c)));
        rows.push(values);
      }
      sheets.push({ name: worksheet.name, hidden: worksheet.state !== 'visible', rows: trim(rows) });
    }
    return { sheets };
  }
}

function readCell(cell: Cell): CellValue {
  return toCellValue(cell.isMerged ? cell.master.value : cell.value);
}

function toCellValue(value: ExcelCellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'object') {
    if ('result' in value) return toCellValue(value.result);
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('error' in value) return String(value.error);
  }
  return null;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const FIRST_REAL_DATE_MS = Date.UTC(1900, 0, 1);
const DAY_MS = 86_400_000;

function formatDate(value: Date): CellValue {
  const ms = value.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms >= FIRST_REAL_DATE_MS || ms < EXCEL_EPOCH_MS) return value.toISOString();
  const offset = Math.round((ms - EXCEL_EPOCH_MS) / 1000) * 1000;
  const days = Math.floor(offset / DAY_MS);
  const time = new Date(offset - days * DAY_MS).toISOString().slice(11, 19);
  const clock = time.endsWith(':00') ? time.slice(0, 5) : time;
  return days > 0 ? `${clock} (+${days}d)` : clock;
}

function trim(rows: CellValue[][]): CellValue[][] {
  const isEmpty = (value: CellValue): boolean => value === null || value === '';
  let lastRow = rows.length - 1;
  while (lastRow >= 0 && rows[lastRow]!.every(isEmpty)) lastRow -= 1;
  const kept = rows.slice(0, lastRow + 1);
  let width = 0;
  for (const row of kept) {
    for (let c = row.length - 1; c >= width; c -= 1) {
      if (!isEmpty(row[c]!)) {
        width = c + 1;
        break;
      }
    }
  }
  return kept.map((row) => row.slice(0, width));
}
