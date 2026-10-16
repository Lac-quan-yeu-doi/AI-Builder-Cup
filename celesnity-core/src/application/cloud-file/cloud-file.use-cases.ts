import type {
  CloudFile,
  CloudFilePage,
  CloudFileSearchQuery,
} from './interfaces/i-cloud-file-source';
import type { ICloudFileSourceRegistry } from './interfaces/i-cloud-file-source-registry';

const MAX_PAGE_SIZE = 50;

export class CloudFileUseCases {
  public constructor(private readonly sources: ICloudFileSourceRegistry) {}

  public search(
    identityId: string,
    provider: string,
    query: CloudFileSearchQuery,
  ): Promise<CloudFilePage> {
    return this.sources.get(provider).search(identityId, {
      ...query,
      pageSize: Math.min(Math.max(query.pageSize, 1), MAX_PAGE_SIZE),
    });
  }

  public get(identityId: string, provider: string, fileId: string): Promise<CloudFile> {
    return this.sources.get(provider).get(identityId, fileId);
  }
}
