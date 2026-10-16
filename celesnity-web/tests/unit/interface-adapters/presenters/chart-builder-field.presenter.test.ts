import { describe, expect, it } from 'vitest';

import {
  presentFieldGroups,
  presentResultFieldGroup,
} from '@/src/interface-adapters/presenters/chart-builder-field.presenter';
import type { VisualQueryDefinition } from '@/src/entities/models/canonical-chart';
import type { CatalogColumnViewModel } from '@/src/interface-adapters/presenters/catalog.presenter';

const brands: readonly CatalogColumnViewModel[] = [
  { name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
  { name: 'name', dataType: 'varchar', nullable: false, ordinalPosition: 2 },
];

const orders: readonly CatalogColumnViewModel[] = [
  { name: 'id', dataType: 'bigint', nullable: false, ordinalPosition: 1 },
  { name: 'brand_id', dataType: 'bigint', nullable: false, ordinalPosition: 2 },
];

const query: VisualQueryDefinition = {
  schemaVersion: 1,
  mode: 'VISUAL',
  context: { catalog: 'iceberg', schema: 'analytics' },
  parameters: [],
  source: {
    table: { catalog: 'iceberg', schema: 'analytics', table: 'brands' },
    alias: 'brands',
  },
  joins: [
    {
      type: 'LEFT',
      table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' },
      alias: 'orders',
      conditions: [],
    },
  ],
  projections: [],
  customExpressions: [],
  filters: [],
  aggregations: [],
  breakouts: [],
  postAggregationFilters: [],
  orderBy: [],
};

describe('chart builder field presenter', () => {
  it('presents query-visible tables in source-then-join order with typed fields', () => {
    const groups = presentFieldGroups({
      query,
      relations: { brands, orders },
      scope: { kind: 'QUERY_VISIBLE' },
    });

    expect(groups.map((group) => group.label)).toEqual(['Brands', 'Orders']);
    expect(groups[0]?.fields[0]).toMatchObject({
      id: 'brands.id',
      relation: 'brands',
      name: 'id',
      label: 'ID',
      family: 'NUMBER',
    });
  });

  it('restricts join operands to their asymmetric scopes', () => {
    expect(
      presentFieldGroups({
        query,
        relations: { brands, orders },
        scope: { kind: 'JOIN_LEFT', joinIndex: 0 },
      }).map((group) => group.relation),
    ).toEqual(['brands']);
    expect(
      presentFieldGroups({
        query,
        relations: { brands, orders },
        scope: { kind: 'JOIN_RIGHT', joinIndex: 0 },
      }).map((group) => group.relation),
    ).toEqual(['orders']);
  });

  it('presents result columns as a synthetic non-datasource group', () => {
    const group = presentResultFieldGroup([
      { name: 'order_count', type: 'bigint', family: 'NUMBER' },
    ]);

    expect(group).toMatchObject({
      id: 'query-result',
      relation: 'result',
      label: 'Query result',
      role: 'RESULT',
    });
    expect(group.fields[0]).toMatchObject({ id: 'result.order_count', family: 'NUMBER' });
  });
});
