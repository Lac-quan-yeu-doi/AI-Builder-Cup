import type { CloudFile } from '@application/cloud-file/interfaces/i-cloud-file-source';
import type { CellValue } from './spreadsheet.models';

export interface NewSheetContent {
  readonly name: string;
  readonly rows: readonly (readonly CellValue[])[];
  readonly mode: 'replace' | 'append';
}

export interface NewSpreadsheetSpec {
  readonly name: string;
  readonly parentId?: string;
  readonly sourceFileId?: string;
  readonly sheets: readonly NewSheetContent[];
}

export interface ISpreadsheetWriter {
  readonly provider: string;
  create(identityId: string, spec: NewSpreadsheetSpec): Promise<CloudFile>;
}
