import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import { CredentialReference } from '@domain/database-service/value-objects/connection-value-objects';

const ALGORITHM = 'aes-256-gcm';
const INITIALIZATION_VECTOR_BYTES = 12;

@Injectable()
export class Aes256GcmCredentialVault implements ICredentialVault {
  private readonly activeKeyVersion: string;
  private readonly keys: ReadonlyMap<string, Buffer>;

  public constructor(config: ConfigService) {
    this.activeKeyVersion = config.getOrThrow<string>('CONNECTION_CREDENTIAL_ACTIVE_KEY_VERSION');
    this.keys = parseKeyring(config.getOrThrow<string>('CONNECTION_CREDENTIAL_KEYS'));
    if (!this.keys.has(this.activeKeyVersion)) {
      throw new Error(
        'The active connection credential key version is not present in the keyring.',
      );
    }
  }

  public encrypt(plaintext: string): Promise<CredentialReference> {
    const key = this.requireKey(this.activeKeyVersion);
    const initializationVector = randomBytes(INITIALIZATION_VECTOR_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, initializationVector);
    cipher.setAAD(this.additionalAuthenticatedData(this.activeKeyVersion));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return Promise.resolve(
      CredentialReference.create({
        ciphertext: ciphertext.toString('base64'),
        initializationVector: initializationVector.toString('base64'),
        authenticationTag: cipher.getAuthTag().toString('base64'),
        keyVersion: this.activeKeyVersion,
      }),
    );
  }

  public decrypt(reference: CredentialReference): Promise<string> {
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.requireKey(reference.keyVersion),
        Buffer.from(reference.initializationVector, 'base64'),
      );
      decipher.setAAD(this.additionalAuthenticatedData(reference.keyVersion));
      decipher.setAuthTag(Buffer.from(reference.authenticationTag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(reference.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      return Promise.resolve(plaintext);
    } catch {
      throw new Error('Stored connection credential could not be decrypted.');
    }
  }

  private requireKey(version: string): Buffer {
    const key = this.keys.get(version);
    if (key === undefined) {
      throw new Error('Stored connection credential uses an unavailable key version.');
    }
    return key;
  }

  private additionalAuthenticatedData(version: string): Buffer {
    return Buffer.from(`celesnity:data-connection:${version}`, 'utf8');
  }
}

function parseKeyring(value: string): ReadonlyMap<string, Buffer> {
  const entries = value.split(',').map((entry) => entry.trim());
  const keys = new Map<string, Buffer>();
  for (const entry of entries) {
    const separator = entry.indexOf(':');
    if (separator < 1) {
      throw new Error('CONNECTION_CREDENTIAL_KEYS contains an invalid key entry.');
    }
    const version = entry.slice(0, separator);
    const key = Buffer.from(entry.slice(separator + 1), 'base64');
    if (key.length !== 32) {
      throw new Error(`Connection credential key ${version} must decode to exactly 32 bytes.`);
    }
    keys.set(version, key);
  }
  return keys;
}
