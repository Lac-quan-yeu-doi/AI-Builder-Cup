export type CloudFileKind = 'spreadsheet' | 'document' | 'presentation' | 'pdf' | 'folder' | 'other';

export interface CloudFile {
  readonly provider: string;
  readonly fileId: string;
  readonly name: string;
  readonly mimeType: string;
  readonly kind: CloudFileKind;
  readonly nativeFormat: boolean;
  readonly modifiedTime?: string;
  readonly sizeBytes?: number;
  readonly webUrl?: string;
  readonly parentIds: readonly string[];
  readonly revision?: string;
  readonly createdByPlatform: boolean;
}

export interface CloudFileSearchQuery {
  readonly text?: string;
  readonly kind?: CloudFileKind;
  readonly parentId?: string;
  readonly modifiedAfter?: Date;
  readonly pageSize: number;
  readonly pageToken?: string;
}

export interface CloudFilePage {
  readonly files: readonly CloudFile[];
  readonly nextPageToken?: string;
}

export interface CloudFileContent {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface ICloudFileSource {
  readonly provider: string;
  search(identityId: string, query: CloudFileSearchQuery): Promise<CloudFilePage>;
  get(identityId: string, fileId: string): Promise<CloudFile>;
  download(identityId: string, fileId: string): Promise<CloudFileContent>;
}
