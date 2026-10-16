import { createPublicKey, verify } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { CelesnityFirmwareSigner } from '@infrastructure/device-management/celesnity-firmware.signer';

const PUBLIC_KEY_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

describe('CelesnityFirmwareSigner', () => {
  it('signs an exact manifest payload with the configured development key', async () => {
    const signer = new CelesnityFirmwareSigner(
      new ConfigService({
        FIRMWARE_SIGNING_PROVIDER: 'LOCAL_ED25519',
        FIRMWARE_SIGNING_KEY_ID: 'local-dev',
        FIRMWARE_SIGNING_PRIVATE_KEY: 'nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=',
        FIRMWARE_SIGNING_KMS_KEY_VERSION: '',
      }),
    );
    const payload = Buffer.from('{"schemaVersion":1,"sha256":"abc"}');

    const result = await signer.sign(payload);

    const publicKey = createPublicKey({
      key: Buffer.concat([
        PUBLIC_KEY_PREFIX,
        Buffer.from('11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=', 'base64'),
      ]),
      format: 'der',
      type: 'spki',
    });
    expect(result).toMatchObject({ algorithm: 'ED25519', signingKeyId: 'local-dev' });
    expect(verify(null, payload, publicKey, Buffer.from(result.signature, 'base64'))).toBe(true);
  });

  it('rejects a malformed local signing seed', async () => {
    expect(
      () =>
        new CelesnityFirmwareSigner(
          new ConfigService({
            FIRMWARE_SIGNING_PROVIDER: 'LOCAL_ED25519',
            FIRMWARE_SIGNING_KEY_ID: 'local-dev',
            FIRMWARE_SIGNING_PRIVATE_KEY: 'invalid',
            FIRMWARE_SIGNING_KMS_KEY_VERSION: '',
          }),
        ),
    ).toThrow('FIRMWARE_SIGNING_PRIVATE_KEY must contain a 32-byte Ed25519 seed.');
  });
});
