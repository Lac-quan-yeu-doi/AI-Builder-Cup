import { bypassesForDemoNamespace } from '@application/administration/demo-namespace-access';
import type { CatalogResourceRef } from '@application/administration/catalog-authorization';

describe('bypassesForDemoNamespace', () => {
  it('allows SELECT on the demo table itself', () => {
    const hierarchy: CatalogResourceRef[] = [
      { type: 'CATALOG', id: 'iceberg' },
      { type: 'DATABASE', id: 'iceberg.demo' },
      { type: 'SCHEMA', id: 'iceberg.demo' },
      { type: 'TABLE', id: 'iceberg.demo.customers' },
    ];
    expect(bypassesForDemoNamespace('SELECT', hierarchy)).toBe(true);
  });

  it('allows DISCOVER on the demo schema alone', () => {
    const hierarchy: CatalogResourceRef[] = [
      { type: 'CATALOG', id: 'iceberg' },
      { type: 'SCHEMA', id: 'iceberg.demo' },
    ];
    expect(bypassesForDemoNamespace('DISCOVER', hierarchy)).toBe(true);
  });

  it('allows a bare catalog-level DISCOVER, since per-schema filtering still applies afterward', () => {
    const hierarchy: CatalogResourceRef[] = [{ type: 'CATALOG', id: 'iceberg' }];
    expect(bypassesForDemoNamespace('DISCOVER', hierarchy)).toBe(true);
  });

  it('does not allow a bare catalog-level SELECT, since nothing narrows it to demo specifically', () => {
    const hierarchy: CatalogResourceRef[] = [{ type: 'CATALOG', id: 'iceberg' }];
    expect(bypassesForDemoNamespace('SELECT', hierarchy)).toBe(false);
  });

  it('does not allow a different schema in the same catalog', () => {
    const hierarchy: CatalogResourceRef[] = [
      { type: 'CATALOG', id: 'iceberg' },
      { type: 'SCHEMA', id: 'iceberg.other_org_schema' },
    ];
    expect(bypassesForDemoNamespace('SELECT', hierarchy)).toBe(false);
  });

  it('does not allow a write permission even on the demo table', () => {
    const hierarchy: CatalogResourceRef[] = [
      { type: 'CATALOG', id: 'iceberg' },
      { type: 'SCHEMA', id: 'iceberg.demo' },
      { type: 'TABLE', id: 'iceberg.demo.customers' },
    ];
    expect(bypassesForDemoNamespace('INSERT', hierarchy)).toBe(false);
  });

  it('does not allow an empty hierarchy', () => {
    expect(bypassesForDemoNamespace('SELECT', [])).toBe(false);
  });

  it.each(['demo1_home_appliance', 'demo2_coffee_capsules'])(
    'allows SELECT on a column of the %s demo warehouse',
    (schema) => {
      const hierarchy: CatalogResourceRef[] = [
        { type: 'CATALOG', id: 'iceberg' },
        { type: 'SCHEMA', id: `iceberg.${schema}` },
        { type: 'TABLE', id: `iceberg.${schema}.fact_oee_shift` },
        { type: 'COLUMN', id: `iceberg.${schema}.fact_oee_shift.oee` },
      ];
      expect(bypassesForDemoNamespace('SELECT', hierarchy)).toBe(true);
    },
  );

  it('does not allow a write permission on a Demo Data warehouse', () => {
    const hierarchy: CatalogResourceRef[] = [
      { type: 'CATALOG', id: 'iceberg' },
      { type: 'SCHEMA', id: 'iceberg.demo1_home_appliance' },
      { type: 'TABLE', id: 'iceberg.demo1_home_appliance.fact_oee_shift' },
    ];
    expect(bypassesForDemoNamespace('INSERT', hierarchy)).toBe(false);
  });

  it('does not treat a schema that only shares the demo prefix as a demo schema', () => {
    const hierarchy: CatalogResourceRef[] = [
      { type: 'CATALOG', id: 'iceberg' },
      { type: 'SCHEMA', id: 'iceberg.demo1_home_appliance_private' },
    ];
    expect(bypassesForDemoNamespace('SELECT', hierarchy)).toBe(false);
  });
});
