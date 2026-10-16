import type { CloudFile } from '@application/cloud-file/interfaces/i-cloud-file-source';
import type { SheetRange, SheetRangeQuery, SpreadsheetOverview } from './spreadsheet.models';

export interface ISpreadsheetReader {
  supports(file: CloudFile): boolean;
  overview(identityId: string, file: CloudFile, sampleRows: number): Promise<SpreadsheetOverview>;
  readRange(identityId: string, file: CloudFile, query: SheetRangeQuery): Promise<SheetRange>;
}
