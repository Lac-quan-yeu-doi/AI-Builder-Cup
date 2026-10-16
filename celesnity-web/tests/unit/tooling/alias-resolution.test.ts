import { describe, expect, it } from 'vitest';
import packageManifest from '@/package.json';
import { CoreApiClient } from '@/src/infrastructure/api/core-api-client';
import { CoreApiConnectionRepository } from '@/src/infrastructure/repositories/core-api-connection.repository';

describe('Vitest aliases', () => {
  it('loads infrastructure through the final root alias', () => {
    expect(CoreApiClient).toBeDefined();
    expect(CoreApiConnectionRepository).toBeDefined();
    expect(packageManifest.name).toBe('celesnity-web');
  });
});
