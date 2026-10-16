import { describe, expect, it } from 'vitest';

import { readChartView, readTableContent } from '@/app/_components/chat/artifact-reading';
import type { TableBlockContent } from '@/app/_components/chat/message-block-content';
import { chartSource } from '@/app/_components/chat/artifact-source';
import { readToolName } from '@/app/_components/chat/tool-name';
import { createTranslator } from '@/app/_i18n/translate';
import type { ChartAxisView, ChartViewModel } from '@/src/entities/models/chart-renderer';
import type { QueryDefinition } from '@/src/entities/models/canonical-chart';

const t = createTranslator('en');
const axis = (dataKey?: string): ChartAxisView => ({
  visible: true,
  gridlines: true,
  ...(dataKey === undefined ? {} : { dataKey }),
});

function view(overrides: Partial<ChartViewModel>): ChartViewModel {
  return {
    mark: 'BAR',
    rows: [],
    series: [],
    x: axis('day'),
    y: axis(),
    showLegend: true,
    stacked: false,
    orientation: 'VERTICAL',
    markers: false,
    ...overrides,
  };
}

describe('readChartView', () => {
  it('describes a single series by where it peaked and where it fell', () => {
    const reading = readChartView(
      view({
        series: [{ key: 'units', label: 'Units', color: 'var(--mchart-1)' }],
        rows: [
          { day: 'Mon', units: 410 },
          { day: 'Tue', units: 520 },
          { day: 'Wed', units: 180 },
        ],
      }),
      'en',
      false,
    );

    expect(reading).not.toBeNull();
    expect(t(reading!.key, reading!.params)).toBe('Peaks at 520 on Tue, lowest at 180 on Wed.');
  });

  it('ranks several series by total and names the spread', () => {
    const reading = readChartView(
      view({
        series: [
          { key: 'a', label: 'Line 1', color: 'var(--mchart-1)' },
          { key: 'b', label: 'Line 2', color: 'var(--mchart-2)' },
        ],
        rows: [
          { day: 'Mon', a: 100, b: 50 },
          { day: 'Tue', a: 100, b: 50 },
        ],
      }),
      'en',
      false,
    );

    expect(t(reading!.key, reading!.params)).toBe('Line 1 leads with 200, 50% above Line 2.');
  });

  it('says the reading covers only the rows shown once a result is capped', () => {
    const reading = readChartView(
      view({
        series: [
          { key: 'a', label: 'Line 1', color: 'var(--mchart-1)' },
          { key: 'b', label: 'Line 2', color: 'var(--mchart-2)' },
        ],
        rows: [{ day: 'Mon', a: 100, b: 50 }],
      }),
      'en',
      true,
    );

    expect(t(reading!.key, reading!.params)).toBe(
      'Across the rows shown, Line 1 leads with 100, 50% above Line 2.',
    );
  });

  it('says nothing rather than something false', () => {
    expect(readChartView(view({}), 'en', false)).toBeNull();
    /* A flat single series has no peak worth naming. */
    expect(
      readChartView(
        view({
          series: [{ key: 'units', label: 'Units', color: 'var(--mchart-1)' }],
          rows: [{ day: 'Mon', units: 5 }],
        }),
        'en',
        false,
      ),
    ).toBeNull();
    /* Two series that both total zero have no leader. */
    expect(
      readChartView(
        view({
          series: [
            { key: 'a', label: 'A', color: 'var(--mchart-1)' },
            { key: 'b', label: 'B', color: 'var(--mchart-2)' },
          ],
          rows: [{ day: 'Mon', a: 0, b: 0 }],
        }),
        'en',
        false,
      ),
    ).toBeNull();
  });
});

describe('readTableContent', () => {
  const content = (
    columns: TableBlockContent['columns'],
    rows: TableBlockContent['rows'],
  ): TableBlockContent => ({ title: null, columns, rows, footnote: null });

  it('names the value the rows pile up on', () => {
    const reading = readTableContent(
      content(
        [
          { key: 'order', label: 'Order', numeric: false },
          { key: 'line', label: 'Line', numeric: false },
        ],
        [
          { order: 'SO-1', line: 'Line 2' },
          { order: 'SO-2', line: 'Line 2' },
          { order: 'SO-3', line: 'Line 1' },
        ],
      ),
      'en',
      false,
    );

    expect(t(reading!.key, reading!.params)).toBe('Line 2 holds 2 of 3 rows by line.');
  });

  it('ignores a column that is different on every row', () => {
    expect(
      readTableContent(
        content(
          [{ key: 'order', label: 'Order', numeric: false }],
          [{ order: 'SO-1' }, { order: 'SO-2' }],
        ),
        'en',
        false,
      ),
    ).toBeNull();
  });

  it('ignores numeric columns, which are measured rather than grouped', () => {
    expect(
      readTableContent(
        content(
          [{ key: 'units', label: 'Units', numeric: true }],
          [{ units: 10 }, { units: 10 }, { units: 20 }],
        ),
        'en',
        false,
      ),
    ).toBeNull();
  });

  it('has nothing to say about no rows', () => {
    expect(readTableContent(content([], []), 'en', false)).toBeNull();
  });
});

describe('chartSource', () => {
  it('names the database and keeps the SQL for a written query', () => {
    const definition: QueryDefinition = {
      schemaVersion: 1,
      mode: 'NATIVE',
      context: { catalog: 'iceberg', schema: 'factory' },
      parameters: [],
      sql: 'select 1',
    };
    expect(chartSource(definition, 200, 4812, true)).toEqual({
      label: 'iceberg.factory',
      sql: 'select 1',
      shownRows: 200,
      totalRows: 4812,
      truncated: true,
    });
  });

  it('names the table outright for a built question, with no SQL to fold', () => {
    const definition = {
      schemaVersion: 1,
      mode: 'VISUAL',
      context: { catalog: 'iceberg', schema: 'factory' },
      parameters: [],
      source: {
        table: { catalog: 'iceberg', schema: 'factory', table: 'press_telemetry' },
        alias: 'p',
      },
      joins: [],
      projections: [],
      customExpressions: [],
      filters: [],
      aggregations: [],
      breakouts: [],
      postAggregationFilters: [],
      orderBy: [],
    } as unknown as QueryDefinition;

    const source = chartSource(definition, 12, 12, false);
    expect(source.label).toBe('iceberg.factory.press_telemetry');
    expect(source.sql).toBeNull();
  });
});

describe('readToolName', () => {
  it('splits an MCP tool into its action and the server that answered', () => {
    expect(readToolName('mcp__trino__run_query')).toEqual({
      action: 'Run query',
      server: 'trino',
      raw: 'mcp__trino__run_query',
    });
  });

  it('keeps a multi-word server name readable', () => {
    expect(readToolName('mcp__plant_model__list_sites')).toEqual({
      action: 'List sites',
      server: 'plant model',
      raw: 'mcp__plant_model__list_sites',
    });
  });

  it('leaves a plain tool name alone but still reads it as words', () => {
    expect(readToolName('publish_message_block')).toEqual({
      action: 'Publish message block',
      server: null,
      raw: 'publish_message_block',
    });
  });

  it('never loses the wire name, which is what a debugger needs', () => {
    for (const raw of ['mcp__a__b', 'weird', '', 'mcp__only_server__']) {
      expect(readToolName(raw).raw).toBe(raw);
    }
  });
});
