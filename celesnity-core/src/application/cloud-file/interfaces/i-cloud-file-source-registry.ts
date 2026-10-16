import type { ICloudFileSource } from './i-cloud-file-source';

export interface ICloudFileSourceRegistry {
  get(provider: string): ICloudFileSource;
  providers(): readonly string[];
}
