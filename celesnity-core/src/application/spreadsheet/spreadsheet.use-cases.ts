import { CloudFileError, CloudFileErrorCode } from '@application/cloud-file/errors/cloud-file.error';
import type { CloudFile } from '@application/cloud-file/interfaces/i-cloud-file-source';
import type { ICloudFileSourceRegistry } from '@application/cloud-file/interfaces/i-cloud-file-source-registry';
import type { ISpreadsheetReader } from './interfaces/i-spreadsheet-reader';
import type { ISpreadsheetWriter, NewSpreadsheetSpec } from './interfaces/i-spreadsheet-writer';
import type { SheetRange, SheetRangeQuery, SpreadsheetOverview } from './interfaces/spreadsheet.models';

export interface SpreadsheetLimits {
  readonly maxSampleRows: number;
  readonly maxRowsPerRead: number;
  readonly maxCellsPerWrite: number;
  readonly maxSheetsPerWrite: number;
}

export class SpreadsheetUseCases {
  private readonly writers: ReadonlyMap<string, ISpreadsheetWriter>;

  public constructor(
    private readonly sources: ICloudFileSourceRegistry,
    private readonly readers: readonly ISpreadsheetReader[],
    writers: readonly ISpreadsheetWriter[],
    private readonly limits: SpreadsheetLimits,
  ) {
    this.writers = new Map(writers.map((writer) => [writer.provider, writer]));
  }

  public async overview(
    identityId: string,
    provider: string,
    fileId: string,
    sampleRows: number,
  ): Promise<SpreadsheetOverview> {
    const file = await this.sources.get(provider).get(identityId, fileId);
    return this.readerFor(file).overview(
      identityId,
      file,
      clamp(sampleRows, 0, this.limits.maxSampleRows),
    );
  }

  public async readRange(
    identityId: string,
    provider: string,
    fileId: string,
    query: SheetRangeQuery,
  ): Promise<SheetRange> {
    const file = await this.sources.get(provider).get(identityId, fileId);
    return this.readerFor(file).readRange(identityId, file, {
      ...query,
      offset: Math.max(query.offset, 0),
      limit: clamp(query.limit, 1, this.limits.maxRowsPerRead),
    });
  }

  public async create(
    identityId: string,
    provider: string,
    spec: NewSpreadsheetSpec,
  ): Promise<CloudFile> {
    this.validate(spec);
    const writer = this.writers.get(provider);
    if (!writer) {
      throw new CloudFileError(
        CloudFileErrorCode.PROVIDER_UNSUPPORTED,
        `Creating spreadsheets in ${provider} is not supported.`,
      );
    }
    if (spec.sourceFileId) {
      const source = await this.sources.get(provider).get(identityId, spec.sourceFileId);
      if (source.kind !== 'spreadsheet') {
        throw new CloudFileError(
          CloudFileErrorCode.UNSUPPORTED_FORMAT,
          `${source.name} is not a spreadsheet.`,
        );
      }
    }
    return writer.create(identityId, spec);
  }

  private readerFor(file: CloudFile): ISpreadsheetReader {
    const reader = this.readers.find((candidate) => candidate.supports(file));
    if (!reader) {
      throw new CloudFileError(
        CloudFileErrorCode.UNSUPPORTED_FORMAT,
        `${file.name} (${file.mimeType}) is not a spreadsheet.`,
      );
    }
    return reader;
  }

  private validate(spec: NewSpreadsheetSpec): void {
    const invalid = (message: string): CloudFileError =>
      new CloudFileError(CloudFileErrorCode.INVALID_REQUEST, message);
    if (spec.name.trim().length === 0 || spec.name.length > 255) {
      throw invalid('The spreadsheet name must be 1 to 255 characters.');
    }
    if (spec.sheets.length > this.limits.maxSheetsPerWrite) {
      throw invalid(`At most ${this.limits.maxSheetsPerWrite} sheets can be written at once.`);
    }
    const names = new Set<string>();
    let cells = 0;
    for (const sheet of spec.sheets) {
      const name = sheet.name.trim();
      if (name.length === 0 || name.length > 100) throw invalid('Sheet names must be 1 to 100 characters.');
      if (names.has(name.toLowerCase())) throw invalid(`Sheet "${name}" appears more than once.`);
      names.add(name.toLowerCase());
      cells += sheet.rows.reduce((total, row) => total + row.length, 0);
    }
    if (cells > this.limits.maxCellsPerWrite) {
      throw invalid(`At most ${this.limits.maxCellsPerWrite} cells can be written at once.`);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}
