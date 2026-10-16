import type { CellValue } from './spreadsheet.models';

export interface ParsedSheet {
  readonly name: string;
  readonly hidden: boolean;
  readonly rows: readonly (readonly CellValue[])[];
}

export interface ParsedWorkbook {
  readonly sheets: readonly ParsedSheet[];
}

export interface ISpreadsheetParser {
  supports(mimeType: string): boolean;
  parse(bytes: Uint8Array, mimeType: string): Promise<ParsedWorkbook>;
}
