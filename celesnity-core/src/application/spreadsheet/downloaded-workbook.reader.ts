import { CloudFileError, CloudFileErrorCode } from '@application/cloud-file/errors/cloud-file.error';
import type { CloudFile } from '@application/cloud-file/interfaces/i-cloud-file-source';
import type { ICloudFileSourceRegistry } from '@application/cloud-file/interfaces/i-cloud-file-source-registry';
import type { IClock } from '@application/shared/interfaces/i-clock';
import { formatA1Range, parseA1Range } from './a1-range';
import type { ISpreadsheetParser, ParsedSheet, ParsedWorkbook } from './interfaces/i-spreadsheet-parser';
import type { ISpreadsheetReader } from './interfaces/i-spreadsheet-reader';
import type {
  CellValue,
  SheetRange,
  SheetRangeQuery,
  SpreadsheetOverview,
} from './interfaces/spreadsheet.models';

export interface WorkbookCacheConfig {
  readonly ttlMs: number;
  readonly maxEntries: number;
}

interface CacheEntry {
  readonly workbook: ParsedWorkbook;
  readonly expiresAt: number;
}

export class DownloadedWorkbookReader implements ISpreadsheetReader {
  private readonly cache = new Map<string, CacheEntry>();

  public constructor(
    private readonly sources: ICloudFileSourceRegistry,
    private readonly parsers: readonly ISpreadsheetParser[],
    private readonly cacheConfig: WorkbookCacheConfig,
    private readonly clock: IClock,
  ) {}

  public supports(file: CloudFile): boolean {
    return file.kind === 'spreadsheet';
  }

  public async overview(
    identityId: string,
    file: CloudFile,
    sampleRows: number,
  ): Promise<SpreadsheetOverview> {
    const workbook = await this.load(identityId, file);
    return {
      file,
      sheets: workbook.sheets.map((sheet, index) => {
        const headerIndex = sheet.rows.findIndex((row) => row.some((value) => !isBlank(value)));
        return {
          name: sheet.name,
          index,
          hidden: sheet.hidden,
          rowCount: sheet.rows.length,
          columnCount: sheet.rows.reduce((max, row) => Math.max(max, row.length), 0),
          header: headerIndex < 0 ? [] : sheet.rows[headerIndex]!,
          sampleRows: headerIndex < 0 ? [] : sheet.rows.slice(headerIndex + 1, headerIndex + 1 + sampleRows),
        };
      }),
    };
  }

  public async readRange(
    identityId: string,
    file: CloudFile,
    query: SheetRangeQuery,
  ): Promise<SheetRange> {
    const workbook = await this.load(identityId, file);
    const sheet = findSheet(workbook, query.sheet);
    const width = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
    const bounds = query.range === undefined ? { startRow: 0, startColumn: 0 } : parseA1Range(query.range);
    if (!bounds) {
      throw new CloudFileError(CloudFileErrorCode.UNSUPPORTED_FORMAT, `Invalid A1 range: ${query.range}`);
    }
    const endRow = Math.min(bounds.endRow ?? sheet.rows.length - 1, sheet.rows.length - 1);
    const endColumn = Math.min(bounds.endColumn ?? width - 1, width - 1);
    const selected: CellValue[][] = [];
    for (let r = bounds.startRow; r <= endRow; r += 1) {
      const row = sheet.rows[r] ?? [];
      const values: CellValue[] = [];
      for (let c = bounds.startColumn; c <= endColumn; c += 1) values.push(row[c] ?? null);
      selected.push(values);
    }
    const page = selected.slice(query.offset, query.offset + query.limit);
    const nextOffset = query.offset + page.length;
    return {
      sheet: sheet.name,
      range:
        selected.length === 0 || endColumn < bounds.startColumn
          ? ''
          : formatA1Range({ startRow: bounds.startRow, endRow, startColumn: bounds.startColumn, endColumn }),
      rows: page,
      totalRows: selected.length,
      ...(nextOffset < selected.length ? { nextOffset } : {}),
    };
  }

  private async load(identityId: string, file: CloudFile): Promise<ParsedWorkbook> {
    const key = [identityId, file.provider, file.fileId, file.revision ?? file.modifiedTime ?? ''].join('|');
    const now = this.clock.now().getTime();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.workbook;

    const content = await this.sources.get(file.provider).download(identityId, file.fileId);
    const parser = this.parsers.find((candidate) => candidate.supports(content.mimeType));
    if (!parser) {
      throw new CloudFileError(
        CloudFileErrorCode.UNSUPPORTED_FORMAT,
        `${file.name} (${content.mimeType}) is not a readable spreadsheet format.`,
      );
    }
    const workbook = await parser.parse(content.bytes, content.mimeType);
    this.remember(key, { workbook, expiresAt: now + this.cacheConfig.ttlMs });
    return workbook;
  }

  private remember(key: string, entry: CacheEntry): void {
    this.cache.delete(key);
    this.cache.set(key, entry);
    while (this.cache.size > this.cacheConfig.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}

function findSheet(workbook: ParsedWorkbook, name: string): ParsedSheet {
  const sheet =
    workbook.sheets.find((candidate) => candidate.name === name) ??
    workbook.sheets.find((candidate) => candidate.name.toLowerCase() === name.trim().toLowerCase());
  if (!sheet) {
    throw new CloudFileError(
      CloudFileErrorCode.NOT_FOUND,
      `Sheet "${name}" does not exist. Sheets: ${workbook.sheets.map((s) => s.name).join(', ')}`,
    );
  }
  return sheet;
}

function isBlank(value: CellValue): boolean {
  return value === null || value === '';
}
