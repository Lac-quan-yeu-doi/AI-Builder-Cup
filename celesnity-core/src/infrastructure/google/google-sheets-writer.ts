import { CloudFileError, CloudFileErrorCode } from '@application/cloud-file/errors/cloud-file.error';
import type { CloudFile } from '@application/cloud-file/interfaces/i-cloud-file-source';
import type {
  ISpreadsheetWriter,
  NewSpreadsheetSpec,
} from '@application/spreadsheet/interfaces/i-spreadsheet-writer';
import type { GoogleApiHttp } from './google-api-http';
import {
  DRIVE_FILE_FIELDS,
  PLATFORM_CREATED_PROPERTY,
  toCloudFile,
  type DriveFileResource,
} from './google-drive-file-source';
import { GOOGLE_SHEET_MIME } from './google-drive-mime';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

interface SheetProperties {
  readonly sheetId: number;
  readonly title: string;
}

export class GoogleSheetsWriter implements ISpreadsheetWriter {
  public constructor(
    private readonly http: GoogleApiHttp,
    public readonly provider: string,
  ) {}

  public async create(identityId: string, spec: NewSpreadsheetSpec): Promise<CloudFile> {
    const created = await this.createFile(identityId, spec);
    if (!created.createdByPlatform) {
      throw new CloudFileError(
        CloudFileErrorCode.WRITE_FORBIDDEN,
        'Refusing to write a file the platform did not create.',
      );
    }
    try {
      await this.writeSheets(identityId, created.fileId, spec);
    } catch (error) {
      await this.discard(identityId, created.fileId);
      throw error;
    }
    return this.get(identityId, created.fileId);
  }

  private async createFile(identityId: string, spec: NewSpreadsheetSpec): Promise<CloudFile> {
    const body = JSON.stringify({
      name: spec.name,
      mimeType: GOOGLE_SHEET_MIME,
      ...(spec.parentId ? { parents: [spec.parentId] } : {}),
      appProperties: { [PLATFORM_CREATED_PROPERTY]: 'true' },
    });
    const params = new URLSearchParams({ fields: DRIVE_FILE_FIELDS, supportsAllDrives: 'true' });
    const url = spec.sourceFileId
      ? `${DRIVE_API}/files/${encodeURIComponent(spec.sourceFileId)}/copy?${params}`
      : `${DRIVE_API}/files?${params}`;
    const file = await this.http.json<DriveFileResource>(identityId, url, { method: 'POST', body });
    return toCloudFile(this.provider, file);
  }

  private async writeSheets(identityId: string, fileId: string, spec: NewSpreadsheetSpec): Promise<void> {
    if (spec.sheets.length === 0) return;
    const id = encodeURIComponent(fileId);
    const existing = await this.sheetProperties(identityId, id);
    const existingTitles = new Set(existing.map((sheet) => sheet.title));
    const wanted = new Set(spec.sheets.map((sheet) => sheet.name));

    const requests: object[] = spec.sheets
      .filter((sheet) => !existingTitles.has(sheet.name))
      .map((sheet) => ({ addSheet: { properties: { title: sheet.name } } }));
    if (!spec.sourceFileId) {
      for (const sheet of existing) {
        if (!wanted.has(sheet.title)) requests.push({ deleteSheet: { sheetId: sheet.sheetId } });
      }
    }
    if (requests.length > 0) {
      await this.http.json(identityId, `${SHEETS_API}/${id}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests }),
      });
    }

    const replaced = spec.sheets.filter(
      (sheet) => sheet.mode === 'replace' || !existingTitles.has(sheet.name),
    );
    if (replaced.length > 0) {
      await this.http.json(identityId, `${SHEETS_API}/${id}/values:batchClear`, {
        method: 'POST',
        body: JSON.stringify({ ranges: replaced.map((sheet) => quoteSheet(sheet.name)) }),
      });
      await this.http.json(identityId, `${SHEETS_API}/${id}/values:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: replaced.map((sheet) => ({ range: `${quoteSheet(sheet.name)}!A1`, values: sheet.rows })),
        }),
      });
    }

    for (const sheet of spec.sheets) {
      if (sheet.mode !== 'append' || !existingTitles.has(sheet.name) || sheet.rows.length === 0) continue;
      const params = new URLSearchParams({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
      const range = encodeURIComponent(`${quoteSheet(sheet.name)}!A1`);
      await this.http.json(identityId, `${SHEETS_API}/${id}/values/${range}:append?${params}`, {
        method: 'POST',
        body: JSON.stringify({ values: sheet.rows }),
      });
    }
  }

  private async sheetProperties(identityId: string, id: string): Promise<readonly SheetProperties[]> {
    const params = new URLSearchParams({ fields: 'sheets.properties(sheetId,title)' });
    const result = await this.http.json<{ sheets?: { properties: SheetProperties }[] }>(
      identityId,
      `${SHEETS_API}/${id}?${params}`,
    );
    return (result.sheets ?? []).map((sheet) => sheet.properties);
  }

  private async get(identityId: string, fileId: string): Promise<CloudFile> {
    const params = new URLSearchParams({ fields: DRIVE_FILE_FIELDS, supportsAllDrives: 'true' });
    const file = await this.http.json<DriveFileResource>(
      identityId,
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params}`,
    );
    return toCloudFile(this.provider, file);
  }

  private async discard(identityId: string, fileId: string): Promise<void> {
    try {
      const file = await this.get(identityId, fileId);
      if (!file.createdByPlatform) return;
      const params = new URLSearchParams({ supportsAllDrives: 'true' });
      await this.http.json(identityId, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params}`, {
        method: 'PATCH',
        body: JSON.stringify({ trashed: true }),
      });
    } catch {
      // Cleanup is best effort; preserve the original write error.
    }
  }
}

function quoteSheet(name: string): string {
  return `'${name.replace(/'/gu, "''")}'`;
}
