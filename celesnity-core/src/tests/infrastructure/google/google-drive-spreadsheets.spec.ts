import { CloudFileErrorCode } from '@application/cloud-file/errors/cloud-file.error';
import {
  OAuthConnectionError,
  OAuthConnectionErrorCode,
} from '@application/oauth-connection/errors/oauth-connection.error';
import { GoogleApiHttp } from '@infrastructure/google/google-api-http';
import { GoogleDriveFileSource } from '@infrastructure/google/google-drive-file-source';
import { GoogleSheetsWriter } from '@infrastructure/google/google-sheets-writer';

interface RecordedCall {
  readonly method: string;
  readonly url: URL;
  readonly body: unknown;
}

const MARKED = { appProperties: { celesnityCreated: 'true' } };

describe('Google Drive spreadsheets', () => {
  let calls: RecordedCall[];
  let respond: (call: RecordedCall) => { status?: number; body: unknown };
  const http = new GoogleApiHttp({ getAccessToken: () => Promise.resolve('token') }, 'google-drive');

  beforeEach(() => {
    calls = [];
    jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
      const call: RecordedCall = {
        method: init?.method ?? 'GET',
        url: new URL(input as string),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const { status = 200, body } = respond(call);
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    });
  });

  afterEach(() => jest.restoreAllMocks());

  describe('GoogleSheetsWriter', () => {
    const writer = new GoogleSheetsWriter(http, 'google-drive');

    beforeEach(() => {
      respond = (call) => {
        if (call.url.pathname.endsWith('/copy') || call.url.pathname.endsWith('/files/copy-1')) {
          return { body: { id: 'copy-1', name: 'B new', mimeType: 'application/vnd.google-apps.spreadsheet', ...MARKED } };
        }
        if (call.method === 'GET' && call.url.pathname.endsWith('/spreadsheets/copy-1')) {
          return { body: { sheets: [{ properties: { sheetId: 0, title: 'Output' } }] } };
        }
        return { body: {} };
      };
    });

    it('copies the source into a marked native Sheet and writes only the copy, as RAW values', async () => {
      const created = await writer.create('id-1', {
        name: 'B new',
        sourceFileId: 'B',
        sheets: [
          { name: 'Output', mode: 'append', rows: [['L1', '=HYPERLINK("x")']] },
          { name: 'Summary', mode: 'replace', rows: [['total', 250]] },
        ],
      });

      expect(created).toMatchObject({ fileId: 'copy-1', createdByPlatform: true });
      expect(calls[0]).toMatchObject({ method: 'POST', body: { name: 'B new', mimeType: 'application/vnd.google-apps.spreadsheet', ...MARKED } });
      expect(calls[0]?.url.pathname).toBe('/drive/v3/files/B/copy');

      const writes = calls.slice(1).filter((call) => call.method !== 'GET');
      expect(writes.every((call) => call.url.pathname.includes('copy-1'))).toBe(true);
      expect(writes.some((call) => call.url.pathname.includes('/files/B'))).toBe(false);

      const append = writes.find((call) => call.url.pathname.endsWith(':append'));
      expect(append?.url.searchParams.get('valueInputOption')).toBe('RAW');
      expect(append?.body).toEqual({ values: [['L1', '=HYPERLINK("x")']] });

      const addSheet = writes.find((call) => call.url.pathname.endsWith(':batchUpdate'));
      expect(addSheet?.body).toEqual({ requests: [{ addSheet: { properties: { title: 'Summary' } } }] });

      const update = writes.find((call) => call.url.pathname.endsWith('values:batchUpdate'));
      expect(update?.body).toMatchObject({ valueInputOption: 'RAW', data: [{ range: "'Summary'!A1" }] });
    });

    it('refuses to write when the created file does not carry the platform marker', async () => {
      respond = () => ({ body: { id: 'x', name: 'x', mimeType: 'application/vnd.google-apps.spreadsheet' } });

      await expect(
        writer.create('id-1', { name: 'x', sheets: [{ name: 'S', mode: 'replace', rows: [] }] }),
      ).rejects.toMatchObject({ code: CloudFileErrorCode.WRITE_FORBIDDEN });
      expect(calls).toHaveLength(1);
    });

    it('trashes its own half-written copy when a write fails', async () => {
      const base = respond;
      respond = (call) =>
        call.url.pathname.endsWith(':append') ? { status: 500, body: { error: { message: 'boom' } } } : base(call);

      await expect(
        writer.create('id-1', { name: 'B new', sourceFileId: 'B', sheets: [{ name: 'Output', mode: 'append', rows: [[1]] }] }),
      ).rejects.toMatchObject({ code: CloudFileErrorCode.PROVIDER_UNAVAILABLE });
      expect(calls.at(-1)).toMatchObject({ method: 'PATCH', body: { trashed: true } });
      expect(calls.at(-1)?.url.pathname).toBe('/drive/v3/files/copy-1');
    });
  });

  describe('GoogleDriveFileSource', () => {
    const source = new GoogleDriveFileSource(http, { provider: 'google-drive', maxDownloadBytes: 10 });

    it('escapes user text in the Drive query', async () => {
      respond = () => ({ body: { files: [] } });

      await source.search('id-1', { text: "x' or name contains '", kind: 'spreadsheet', pageSize: 5 });

      const q = calls[0]?.url.searchParams.get('q') ?? '';
      expect(q).toContain("name contains 'x\\' or name contains \\''");
      expect(q).toContain('trashed = false');
      expect(q).toContain("mimeType = 'application/vnd.google-apps.spreadsheet'");
    });

    it('exports native Sheets as xlsx', async () => {
      respond = (call) =>
        call.url.pathname.endsWith('/export')
          ? { body: 'x' }
          : { body: { id: 'A', name: 'A', mimeType: 'application/vnd.google-apps.spreadsheet' } };

      const content = await source.download('id-1', 'A');

      expect(content.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(calls[1]?.url.searchParams.get('mimeType')).toBe(content.mimeType);
    });

    it('rejects files above the download limit before downloading', async () => {
      respond = () => ({ body: { id: 'A', name: 'A', mimeType: 'text/csv', size: '11' } });

      await expect(source.download('id-1', 'A')).rejects.toMatchObject({ code: CloudFileErrorCode.TOO_LARGE });
      expect(calls).toHaveLength(1);
    });

    it('maps 401 to NEEDS_REAUTH and 404 to NOT_FOUND', async () => {
      respond = () => ({ status: 401, body: {} });
      const unauthorized: unknown = await source.get('id-1', 'A').catch((e: unknown) => e);
      expect(OAuthConnectionError.is(unauthorized, OAuthConnectionErrorCode.NEEDS_REAUTH)).toBe(true);

      respond = () => ({ status: 404, body: { error: { message: 'File not found' } } });
      await expect(source.get('id-1', 'A')).rejects.toMatchObject({ code: CloudFileErrorCode.NOT_FOUND });
    });
  });
});
