import { CloudFileError, CloudFileErrorCode } from './errors/cloud-file.error';
import type { ICloudFileSource } from './interfaces/i-cloud-file-source';
import type { ICloudFileSourceRegistry } from './interfaces/i-cloud-file-source-registry';

export class CloudFileSourceRegistry implements ICloudFileSourceRegistry {
  private readonly sources: ReadonlyMap<string, ICloudFileSource>;

  public constructor(sources: readonly ICloudFileSource[]) {
    this.sources = new Map(sources.map((source) => [source.provider, source]));
  }

  public get(provider: string): ICloudFileSource {
    const source = this.sources.get(provider);
    if (!source) {
      throw new CloudFileError(
        CloudFileErrorCode.PROVIDER_UNSUPPORTED,
        `Files from ${provider} are not supported.`,
      );
    }
    return source;
  }

  public providers(): readonly string[] {
    return [...this.sources.keys()];
  }
}
