import type { StoredDeviceCredentials } from '@domain/device-management/models/device';

export interface IDeviceCredentialVault {
  encrypt(credentials: Readonly<Record<string, string>>): Promise<StoredDeviceCredentials>;
  decrypt(reference: StoredDeviceCredentials): Promise<Readonly<Record<string, string>>>;
}
