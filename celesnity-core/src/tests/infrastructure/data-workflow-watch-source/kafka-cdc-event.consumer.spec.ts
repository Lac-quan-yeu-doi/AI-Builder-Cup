import { createHash } from 'node:crypto';

import { parseCdcMetadataValue } from '@infrastructure/data-workflow-watch-source/kafka-cdc-event.consumer';

const metadata = {
  connectorId: 'celesnity-cdc-source-1',
  organizationId: '11111111-1111-4111-8111-111111111111',
  databaseServiceId: '22222222-2222-4222-8222-222222222222',
  schema: 'public',
  table: 'orders',
  operation: 'u',
  ts_ms: 1_758_160_800_000,
};

describe('parseCdcMetadataValue', () => {
  it('accepts a flat metadata record and fingerprints the transient Kafka position', () => {
    const event = parseCdcMetadataValue(
      'celesnity.data-workflow.cdc.v1',
      3,
      '41',
      JSON.stringify(metadata),
    );

    expect(event).toMatchObject({
      connectorId: metadata.connectorId,
      organizationId: metadata.organizationId,
      databaseServiceId: metadata.databaseServiceId,
      relation: { schema: 'public', table: 'orders' },
      operation: 'UPDATE',
      committedAt: new Date(metadata.ts_ms),
      topic: 'celesnity.data-workflow.cdc.v1',
      partition: 3,
      offset: '41',
    });
    expect(event?.positionFingerprint).toBe(
      `sha256:${createHash('sha256')
        .update('celesnity.data-workflow.cdc.v1\u00003\u000041')
        .digest('hex')}`,
    );
  });

  it('unwraps the schemaless JSON converter envelope used by Kafka Connect', () => {
    const event = parseCdcMetadataValue(
      'celesnity.data-workflow.cdc.v1',
      0,
      '42',
      JSON.stringify({ schema: null, payload: metadata }),
    );

    expect(event).toMatchObject({
      connectorId: metadata.connectorId,
      relation: { schema: 'public', table: 'orders' },
      operation: 'UPDATE',
    });
  });

  it.each(['before', 'after', 'key', 'payload', 'row', 'data', 'values'])(
    'rejects records containing %s payload fields',
    (field) => {
      expect(
        parseCdcMetadataValue(
          'cdc',
          0,
          '1',
          JSON.stringify({ ...metadata, [field]: { customer_id: 'secret' } }),
        ),
      ).toBeUndefined();
    },
  );

  it('rejects malformed, tombstone, and unsupported operation messages', () => {
    expect(parseCdcMetadataValue('cdc', 0, '1', null)).toBeUndefined();
    expect(parseCdcMetadataValue('cdc', 0, '1', '{')).toBeUndefined();
    expect(
      parseCdcMetadataValue('cdc', 0, '1', JSON.stringify({ ...metadata, operation: 'r' })),
    ).toBeUndefined();
  });

  it('accepts a nested relation and ISO committedAt', () => {
    const event = parseCdcMetadataValue(
      'cdc',
      0,
      '2',
      JSON.stringify({
        connectorId: 'connector',
        organizationId: 'org',
        databaseServiceId: 'source',
        relation: { schema: 'analytics', table: 'customers' },
        operation: 'DELETE',
        committedAt: '2026-09-18T09:00:00.000Z',
      }),
    );

    expect(event).toMatchObject({
      relation: { schema: 'analytics', table: 'customers' },
      operation: 'DELETE',
      committedAt: new Date('2026-09-18T09:00:00.000Z'),
    });
  });
});
