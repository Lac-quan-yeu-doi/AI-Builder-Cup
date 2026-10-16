export interface FirmwareSigningManifestInput {
  readonly version: string;
  readonly deviceModel: string;
  readonly hardwareRevision?: string;
  readonly artifactSizeBytes: number;
  readonly sha256: string;
}

export function firmwareSigningPayload(input: FirmwareSigningManifestInput): string {
  return JSON.stringify({
    schemaVersion: 1,
    version: input.version,
    deviceModel: input.deviceModel,
    hardwareRevision: input.hardwareRevision ?? null,
    artifactSizeBytes: input.artifactSizeBytes,
    sha256: input.sha256,
  });
}
