import { CloudFileSourceRegistry } from '@application/cloud-file/cloud-file-source.registry';
import { CloudFileError, CloudFileErrorCode } from '@application/cloud-file/errors/cloud-file.error';
import type { CloudFile, ICloudFileSource } from '@application/cloud-file/interfaces/i-cloud-file-source';
import { DownloadedWorkbookReader } from '@application/spreadsheet/downloaded-workbook.reader';
import type { ISpreadsheetParser, ParsedWorkbook } from '@application/spreadsheet/interfaces/i-spreadsheet-parser';
import type { ISpreadsheetWriter, NewSpreadsheetSpec } from '@application/spreadsheet/interfaces/i-spreadsheet-writer';
import { SpreadsheetUseCases } from '@application/spreadsheet/spreadsheet.use-cases';

const WORKBOOK: ParsedWorkbook = {
  sheets: [
    {
      name: 'Output',
      hidden: false,
      rows: [
        [],
        ['Line', 'Date', 'Units'],
        ['L1', '2026-09-24', 120],
        ['L2', '2026-09-24', 95],
        ['L1', '2026-09-25', 130],
      ],
    },
    { name: 'Notes', hidden: true, rows: [] },
  ],
};

function file(overrides: Partial<CloudFile> = {}): CloudFile {
  return {
    provider: 'drive',
    fileId: 'A',
    name: 'Daily output',
    mimeType: 'text/csv',
    kind: 'spreadsheet',
    nativeFormat: false,
    parentIds: [],
    revision: '7',
    createdByPlatform: false,
    ...overrides,
  };
}

describe('SpreadsheetUseCases', () => {
  let source: jest.Mocked<ICloudFileSource>;
  let parser: jest.Mocked<ISpreadsheetParser>;
  let writer: jest.Mocked<ISpreadsheetWriter>;
  let useCases: SpreadsheetUseCases;

  beforeEach(() => {
    source = {
      provider: 'drive',
      search: jest.fn(),
      get: jest.fn().mockResolvedValue(file()),
      download: jest.fn().mockResolvedValue({ bytes: new Uint8Array([1]), mimeType: 'text/csv' }),
    };
    parser = { supports: jest.fn().mockReturnValue(true), parse: jest.fn().mockResolvedValue(WORKBOOK) };
    writer = { provider: 'drive', create: jest.fn().mockResolvedValue(file({ fileId: 'B2' })) };
    const registry = new CloudFileSourceRegistry([source]);
    const reader = new DownloadedWorkbookReader(registry, [parser], { ttlMs: 60_000, maxEntries: 5 }, {
      now: () => new Date('2026-09-25T10:00:00Z'),
    });
    useCases = new SpreadsheetUseCases(registry, [reader], [writer], {
      maxSampleRows: 20,
      maxRowsPerRead: 2,
      maxCellsPerWrite: 10,
      maxSheetsPerWrite: 3,
    });
  });

  describe('reading', () => {
    it('summarizes each sheet with the first non-empty row as header', async () => {
      const overview = await useCases.overview('id-1', 'drive', 'A', 1);

      expect(overview.sheets[0]).toEqual({
        name: 'Output',
        index: 0,
        hidden: false,
        rowCount: 5,
        columnCount: 3,
        header: ['Line', 'Date', 'Units'],
        sampleRows: [['L1', '2026-09-24', 120]],
      });
      expect(overview.sheets[1]).toMatchObject({ name: 'Notes', hidden: true, header: [] });
    });

    it('pages a range and clamps the page size to the limit', async () => {
      const first = await useCases.readRange('id-1', 'drive', 'A', {
        sheet: 'output',
        range: 'A3:C5',
        offset: 0,
        limit: 100,
      });

      expect(first).toEqual({
        sheet: 'Output',
        range: 'A3:C5',
        rows: [
          ['L1', '2026-09-24', 120],
          ['L2', '2026-09-24', 95],
        ],
        totalRows: 3,
        nextOffset: 2,
      });
    });

    it('downloads once for an overview and following range reads of the same revision', async () => {
      await useCases.overview('id-1', 'drive', 'A', 1);
      await useCases.readRange('id-1', 'drive', 'A', { sheet: 'Output', offset: 0, limit: 2 });

      expect(source.download).toHaveBeenCalledTimes(1);
    });

    it('downloads again when the revision changes', async () => {
      await useCases.overview('id-1', 'drive', 'A', 1);
      source.get.mockResolvedValue(file({ revision: '8' }));
      await useCases.overview('id-1', 'drive', 'A', 1);

      expect(source.download).toHaveBeenCalledTimes(2);
    });

    it('never shares a cached workbook between identities', async () => {
      await useCases.overview('id-1', 'drive', 'A', 1);
      await useCases.overview('id-2', 'drive', 'A', 1);

      expect(source.download).toHaveBeenCalledTimes(2);
    });

    it('lists the real sheet names when a sheet is missing', async () => {
      await expect(
        useCases.readRange('id-1', 'drive', 'A', { sheet: 'Totals', offset: 0, limit: 1 }),
      ).rejects.toThrow('Sheets: Output, Notes');
    });

    it('refuses non-spreadsheet files', async () => {
      source.get.mockResolvedValue(file({ kind: 'pdf', mimeType: 'application/pdf' }));

      await expect(useCases.overview('id-1', 'drive', 'A', 1)).rejects.toMatchObject({
        code: CloudFileErrorCode.UNSUPPORTED_FORMAT,
      });
    });
  });

  describe('creating', () => {
    const spec = (overrides: Partial<NewSpreadsheetSpec> = {}): NewSpreadsheetSpec => ({
      name: 'B 2026-09-25',
      sourceFileId: 'B',
      sheets: [{ name: 'Output', mode: 'append', rows: [['L1', '2026-09-25', 130]] }],
      ...overrides,
    });

    it('checks the source is a readable spreadsheet before creating the copy', async () => {
      await useCases.create('id-1', 'drive', spec());

      expect(source.get).toHaveBeenCalledWith('id-1', 'B');
      expect(writer.create).toHaveBeenCalledWith('id-1', spec());
    });

    it('does not create anything when the source is not a spreadsheet', async () => {
      source.get.mockResolvedValue(file({ kind: 'document' }));

      await expect(useCases.create('id-1', 'drive', spec())).rejects.toBeInstanceOf(CloudFileError);
      expect(writer.create).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty name', spec({ name: ' ' })],
      ['duplicate sheet names', spec({ sheets: [{ name: 'A', mode: 'replace', rows: [] }, { name: 'a', mode: 'replace', rows: [] }] })],
      ['too many cells', spec({ sheets: [{ name: 'A', mode: 'replace', rows: [Array<number>(11).fill(1)] }] })],
      ['too many sheets', spec({ sheets: ['1', '2', '3', '4'].map((name) => ({ name, mode: 'replace' as const, rows: [] })) })],
    ])('rejects %s', async (_label, invalid) => {
      await expect(useCases.create('id-1', 'drive', invalid)).rejects.toMatchObject({
        code: CloudFileErrorCode.INVALID_REQUEST,
      });
      expect(writer.create).not.toHaveBeenCalled();
    });

    it('reports providers that cannot create spreadsheets', async () => {
      await expect(useCases.create('id-1', 'onedrive', spec())).rejects.toMatchObject({
        code: CloudFileErrorCode.PROVIDER_UNSUPPORTED,
      });
    });
  });
});
