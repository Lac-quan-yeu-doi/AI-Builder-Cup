export interface ManagedFirmwareSignature {
  readonly algorithm: 'ED25519';
  readonly signingKeyId: string;
  readonly signature: string;
}

export interface IFirmwareSigner {
  sign(payload: Uint8Array): Promise<ManagedFirmwareSignature>;
}
