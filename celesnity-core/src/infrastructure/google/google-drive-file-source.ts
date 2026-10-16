import { CloudFileError, CloudFileErrorCode } from '@application/cloud-file/errors/cloud-file.error';
import type {
  CloudFile,
  CloudFileContent,
  CloudFilePage,
  CloudFileSearchQuery,
  ICloudFileSource,
} from '@application/cloud-file/interfaces/i-cloud-file-source';
import type { GoogleApiHttp } from './google-api-http';
import {
  EXPORT_MIME_BY_NATIVE,
  GOOGLE_FOLDER_MIME,
  isGoogleNative,
  kindOfMime,
  mimeTypesOfKind,
} from './google-drive-mime';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export const PLATFORM_CREATED_PROPERTY = 'celesnityCreated';

export const DRIVE_FILE_FIELDS =
  'id,name,mimeType,modifiedTime,size,webViewLink,parents,version,appProperties';

export interface DriveFileResource {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly modifiedTime?: string;
  readonly size?: string;
  readonly webViewLink?: string;
  readonly parents?: readonly string[];
  readonly version?: string;
  readonly appProperties?: Readonly<Record<string, string>>;
}

export interface GoogleDriveFileSourceConfig {
  readonly provider: string;
  readonly maxDownloadBytes: number;
}

export class GoogleDriveFileSource implements ICloudFileSource {
  public readonly provider: string;

  public constructor(
    private readonly http: GoogleApiHttp,
    private readonly config: GoogleDriveFileSourceConfig,
  ) {
    this.provider = config.provider;
  }

  public async search(identityId: string, query: CloudFileSearchQuery): Promise<CloudFilePage> {
    const params = new URLSearchParams({
      q: buildDriveQuery(query),
      fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
      pageSize: String(query.pageSize),
      orderBy: 'modifiedTime desc',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (query.pageToken) params.set('pageToken', query.pageToken);
    const page = await this.http.json<{ files?: DriveFileResource[]; nextPageToken?: string }>(
      identityId,
      `${DRIVE_API}/files?${params}`,
    );
    return {
      files: (page.files ?? []).map((file) => toCloudFile(this.provider, file)),
      ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
    };
  }

  public async get(identityId: string, fileId: string): Promise<CloudFile> {
    const params = new URLSearchParams({ fields: DRIVE_FILE_FIELDS, supportsAllDrives: 'true' });
    const file = await this.http.json<DriveFileResource>(
      identityId,
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params}`,
    );
    return toCloudFile(this.provider, file);
  }

  public async download(identityId: string, fileId: string): Promise<CloudFileContent> {
    const file = await this.get(identityId, fileId);
    const id = encodeURIComponent(fileId);
    if (file.nativeFormat) {
      const exportMime = EXPORT_MIME_BY_NATIVE[file.mimeType];
      if (!exportMime) {
        throw new CloudFileError(
          CloudFileErrorCode.UNSUPPORTED_FORMAT,
          `${file.name} (${file.mimeType}) cannot be downloaded.`,
        );
      }
      const params = new URLSearchParams({ mimeType: exportMime });
      return {
        bytes: await this.http.bytes(
          identityId,
          `${DRIVE_API}/files/${id}/export?${params}`,
          this.config.maxDownloadBytes,
        ),
        mimeType: exportMime,
      };
    }
    if (file.sizeBytes !== undefined && file.sizeBytes > this.config.maxDownloadBytes) {
      throw new CloudFileError(
        CloudFileErrorCode.TOO_LARGE,
        `${file.name} is larger than the ${Math.round(this.config.maxDownloadBytes / 1024 / 1024)} MB limit.`,
      );
    }
    const params = new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' });
    return {
      bytes: await this.http.bytes(
        identityId,
        `${DRIVE_API}/files/${id}?${params}`,
        this.config.maxDownloadBytes,
      ),
      mimeType: file.mimeType,
    };
  }
}

export function toCloudFile(provider: string, file: DriveFileResource): CloudFile {
  const size = file.size === undefined ? undefined : Number(file.size);
  return {
    provider,
    fileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    kind: kindOfMime(file.mimeType),
    nativeFormat: isGoogleNative(file.mimeType) && file.mimeType !== GOOGLE_FOLDER_MIME,
    ...(file.modifiedTime ? { modifiedTime: file.modifiedTime } : {}),
    ...(size !== undefined && Number.isFinite(size) ? { sizeBytes: size } : {}),
    ...(file.webViewLink ? { webUrl: file.webViewLink } : {}),
    parentIds: file.parents ?? [],
    ...(file.version ? { revision: file.version } : {}),
    createdByPlatform: file.appProperties?.[PLATFORM_CREATED_PROPERTY] === 'true',
  };
}

function buildDriveQuery(query: CloudFileSearchQuery): string {
  const clauses = ['trashed = false'];
  if (query.text?.trim()) clauses.push(`name contains ${quote(query.text.trim())}`);
  if (query.kind) {
    const mimes = mimeTypesOfKind(query.kind);
    if (mimes.length > 0) {
      clauses.push(`(${mimes.map((mime) => `mimeType = ${quote(mime)}`).join(' or ')})`);
    }
  }
  if (query.parentId) clauses.push(`${quote(query.parentId)} in parents`);
  if (query.modifiedAfter) clauses.push(`modifiedTime > ${quote(query.modifiedAfter.toISOString())}`);
  return clauses.join(' and ');
}

function quote(value: string): string {
  return `'${value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`;
}
