import type { ConfigService } from '@nestjs/config';

import { InMemoryColumnProfileStore } from '@infrastructure/memory/catalog-exploration/in-memory-column-profile.store';
import { ColumnProfile } from '@domain/catalog-exploration/models/catalog-models';

function configWithTtl(ttlMs: number): ConfigService {
  return { getOrThrow: () => ttlMs } as unknown as ConfigService;
}

function profile(name: string): readonly ColumnProfile[] {
  return [
    ColumnProfile.create({
      name,
      dataType: 'varchar',
      kind: 'string',
      topValues: ['a', 'b'],
      computedAt: '2026-09-02T00:00:00.000Z',
    }),
  ];
}

describe('InMemoryColumnProfileStore', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns undefined for a key that was never set', () => {
    const store = new InMemoryColumnProfileStore(configWithTtl(60_000));
    expect(store.get('iceberg.sales.orders')).toBeUndefined();
  });

  it('returns a previously set value before it expires', () => {
    const store = new InMemoryColumnProfileStore(configWithTtl(60_000));
    store.set('iceberg.sales.orders', profile('status'));
    expect(store.get('iceberg.sales.orders')).toEqual(profile('status'));
  });

  it('expires an entry once its TTL has elapsed', () => {
    jest.useFakeTimers();
    const store = new InMemoryColumnProfileStore(configWithTtl(1_000));
    store.set('iceberg.sales.orders', profile('status'));
    jest.setSystemTime(Date.now() + 1_001);
    expect(store.get('iceberg.sales.orders')).toBeUndefined();
  });

  it('evicts the least-recently-inserted entry once over capacity', () => {
    const store = new InMemoryColumnProfileStore(configWithTtl(60_000));
    for (let index = 0; index < 257; index += 1) {
      store.set(`table-${String(index)}`, profile('status'));
    }
    expect(store.get('table-0')).toBeUndefined();
    expect(store.get('table-256')).toBeDefined();
  });
});
