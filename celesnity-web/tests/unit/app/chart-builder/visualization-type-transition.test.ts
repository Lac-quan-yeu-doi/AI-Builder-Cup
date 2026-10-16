import { describe, expect, it } from 'vitest';

import { createDefaultVisualization } from '@/src/entities/models/canonical-chart';
import type {
  BarVisualizationDefinition,
  TableVisualizationDefinition,
} from '@/src/entities/models/canonical-chart';
import {
  bindVisualizationToFields,
  transitionVisualizationType,
} from '@/app/(workspace)/charts/_components/visualization/visualization-type-transition';

describe('transitionVisualizationType', () => {
  it('binds a new table visualization to the query-preview columns', () => {
    const current = createDefaultVisualization('TABLE');

    const next = bindVisualizationToFields(current, ['region', 'revenue']);

    expect(next).toMatchObject({
      type: 'TABLE',
      roles: { columns: ['region', 'revenue'] },
    });
  });

  it('preserves compatible cartesian roles when switching chart type', () => {
    const current: BarVisualizationDefinition = {
      ...createDefaultVisualization('BAR'),
      roles: { category: 'region', measures: ['revenue'], breakout: 'segment' },
    } as BarVisualizationDefinition;

    const next = transitionVisualizationType(current, 'LINE', ['region', 'revenue', 'segment']);

    expect(next).toMatchObject({
      type: 'LINE',
      roles: { x: 'region', measures: ['revenue'], series: 'segment' },
    });
  });

  it('maps a category and measure to pie breakout and measure roles', () => {
    const current: BarVisualizationDefinition = {
      ...createDefaultVisualization('BAR'),
      roles: { category: 'region', measures: ['revenue'] },
    } as BarVisualizationDefinition;

    const next = transitionVisualizationType(current, 'PIE', ['region', 'revenue']);

    expect(next).toMatchObject({
      type: 'PIE',
      roles: { measure: 'revenue', breakout: 'region' },
    });
  });

  it('infers the first category and numeric-looking result column for a table-to-bar switch', () => {
    const current = createDefaultVisualization('TABLE');

    const next = transitionVisualizationType(current, 'BAR', ['order_date', 'order_count']);

    expect(next).toMatchObject({
      type: 'BAR',
      roles: { category: 'order_date', measures: ['order_count'] },
    });
  });

  it('uses query semantics when aggregate columns precede breakout columns', () => {
    const current = createDefaultVisualization('BAR');

    const next = bindVisualizationToFields(current, ['order_count', 'name'], {
      categories: ['name'],
      measures: ['order_count'],
    });

    expect(next).toMatchObject({
      type: 'BAR',
      roles: { category: 'name', measures: ['order_count'] },
    });
  });

  it('keeps query semantics when a reversed table result is switched to bar', () => {
    const current: TableVisualizationDefinition = {
      ...createDefaultVisualization('TABLE'),
      roles: { columns: ['order_count', 'name'] },
    } as TableVisualizationDefinition;

    const next = transitionVisualizationType(current, 'BAR', ['order_count', 'name'], {
      categories: ['name'],
      measures: ['order_count'],
    });

    expect(next).toMatchObject({
      type: 'BAR',
      roles: { category: 'name', measures: ['order_count'] },
    });
  });

  it('clears roles that are not present in the preview schema', () => {
    const current: BarVisualizationDefinition = {
      ...createDefaultVisualization('BAR'),
      roles: { category: 'removed', measures: ['revenue'], breakout: 'removed-series' },
    } as BarVisualizationDefinition;

    const next = transitionVisualizationType(current, 'LINE', ['revenue']);

    expect(next).toMatchObject({
      type: 'LINE',
      roles: { x: '', measures: ['revenue'] },
    });
    expect('series' in next.roles ? next.roles.series : undefined).toBeUndefined();
  });
});
