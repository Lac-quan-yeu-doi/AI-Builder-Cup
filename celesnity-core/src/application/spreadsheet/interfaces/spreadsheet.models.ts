import type { CloudFile } from '@application/cloud-file/interfaces/i-cloud-file-source';

export type CellValue = string | number | boolean | null;

export interface SheetSummary {
  readonly name: string;
  readonly index: number;
  readonly hidden: boolean;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly header: readonly CellValue[];
  readonly sampleRows: readonly (readonly CellValue[])[];
}

export interface SpreadsheetOverview {
  readonly file: CloudFile;
  readonly sheets: readonly SheetSummary[];
}

export interface SheetRangeQuery {
  readonly sheet: string;
  readonly range?: string;
  readonly offset: number;
  readonly limit: number;
}

export interface SheetRange {
  readonly sheet: string;
  readonly range: string;
  readonly rows: readonly (readonly CellValue[])[];
  readonly totalRows: number;
  readonly nextOffset?: number;
}
