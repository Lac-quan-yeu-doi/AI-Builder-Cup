import { createPrivateKey, sign } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';

import type {
  IFirmwareSigner,
  ManagedFirmwareSignature,
} from '@application/device-management/interfaces/i-firmware-signer';

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

@Injectable()
export class CelesnityFirmwareSigner implements IFirmwareSigner {
  private readonly provider: 'LOCAL_ED25519' | 'GCP_KMS';
  private readonly signingKeyId: string;
  private readonly privateKey: string;
  private readonly kmsKeyVersion: string;
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  public constructor(config: ConfigService) {
    this.provider = config.getOrThrow<'LOCAL_ED25519' | 'GCP_KMS'>('FIRMWARE_SIGNING_PROVIDER');
    this.signingKeyId = config.getOrThrow<string>('FIRMWARE_SIGNING_KEY_ID');
    this.privateKey = config.get<string>('FIRMWARE_SIGNING_PRIVATE_KEY') ?? '';
    this.kmsKeyVersion = config.get<string>('FIRMWARE_SIGNING_KMS_KEY_VERSION') ?? '';
    if (this.provider === 'LOCAL_ED25519' && Buffer.from(this.privateKey, 'base64').length !== 32) {
      throw new Error('FIRMWARE_SIGNING_PRIVATE_KEY must contain a 32-byte Ed25519 seed.');
    }
    if (this.provider === 'GCP_KMS' && !isKmsKeyVersion(this.kmsKeyVersion)) {
      throw new Error('FIRMWARE_SIGNING_KMS_KEY_VERSION must identify a Cloud KMS key version.');
    }
  }

  public async sign(payload: Uint8Array): Promise<ManagedFirmwareSignature> {
    const signature =
      this.provider === 'GCP_KMS' ? await this.signWithKms(payload) : this.signLocally(payload);
    if (signature.length !== 64) {
      throw new Error('Managed firmware signer returned an invalid Ed25519 signature.');
    }
    return {
      algorithm: 'ED25519',
      signingKeyId: this.signingKeyId,
      signature: signature.toString('base64'),
    };
  }

  private signLocally(payload: Uint8Array): Buffer {
    const seed = Buffer.from(this.privateKey, 'base64');
    if (seed.length !== 32) {
      throw new Error('FIRMWARE_SIGNING_PRIVATE_KEY must contain a 32-byte Ed25519 seed.');
    }
    const key = createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
      format: 'der',
      type: 'pkcs8',
    });
    return sign(null, Buffer.from(payload), key);
  }

  private async signWithKms(payload: Uint8Array): Promise<Buffer> {
    const data = Buffer.from(payload);
    const response = await this.auth.request<{
      signature?: string;
      verifiedDataCrc32c?: boolean;
      signatureCrc32c?: string;
    }>({
      url: `https://cloudkms.googleapis.com/v1/${this.kmsKeyVersion}:asymmetricSign`,
      method: 'POST',
      data: { data: data.toString('base64'), dataCrc32c: crc32c(data).toString() },
    });
    if (response.data.signature === undefined || response.data.verifiedDataCrc32c !== true) {
      throw new Error('Cloud KMS did not return a firmware signature.');
    }
    const signature = Buffer.from(response.data.signature, 'base64');
    if (response.data.signatureCrc32c !== crc32c(signature).toString()) {
      throw new Error('Cloud KMS firmware signature failed its response integrity check.');
    }
    return signature;
  }
}

function crc32c(value: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0x82f63b78 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isKmsKeyVersion(value: string): boolean {
  return /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+\/cryptoKeyVersions\/\d+$/u.test(
    value,
  );
}
