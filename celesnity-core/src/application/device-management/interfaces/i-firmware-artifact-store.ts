import type {
  FirmwareRelease,
  ManagedFirmwareArtifact,
} from '@domain/device-management/models/firmware';

export interface StoreFirmwareArtifactInput {
  readonly organizationId: string;
  readonly releaseId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

export interface IFirmwareArtifactStore {
  put(input: StoreFirmwareArtifactInput): Promise<ManagedFirmwareArtifact>;
  remove(artifact: ManagedFirmwareArtifact): Promise<void>;
  createDownloadUrl(release: FirmwareRelease): Promise<string>;
}
