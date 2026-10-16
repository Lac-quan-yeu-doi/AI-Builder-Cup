// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SummarizeStep } from '@/app/(workspace)/charts/_components/notebook/summarize-step';
import type { VisualQueryDefinition } from '@/src/entities/models/canonical-chart';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

const relations = {
  orders: [
    { name: 'id', dataType: 'BIGINT', nullable: false, ordinalPosition: 1 },
    { name: 'status', dataType: 'VARCHAR', nullable: true, ordinalPosition: 2 },
  ],
  brands: [
    { name: 'name', dataType: 'VARCHAR', nullable: true, ordinalPosition: 1 },
    { name: 'revenue', dataType: 'DOUBLE', nullable: true, ordinalPosition: 2 },
  ],
} as const;

function makeQuery(overrides: Partial<VisualQueryDefinition> = {}): VisualQueryDefinition {
  return {
    schemaVersion: 1,
    mode: 'VISUAL',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    source: {
      table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' },
      alias: 'orders',
    },
    joins: [
      {
        type: 'INNER',
        table: { catalog: 'iceberg', schema: 'analytics', table: 'brands' },
        alias: 'brands',
        conditions: [
          {
            left: { kind: 'FIELD', relation: 'orders', field: 'id' },
            operator: 'EQ',
            right: { kind: 'FIELD', relation: 'brands', field: 'name' },
          },
        ],
      },
    ],
    projections: [],
    customExpressions: [],
    filters: [],
    aggregations: [],
    breakouts: [],
    postAggregationFilters: [],
    orderBy: [],
    ...overrides,
  };
}

function Harness({
  initialQuery = makeQuery(),
  onChange = vi.fn(),
}: {
  readonly initialQuery?: VisualQueryDefinition;
  readonly onChange?: (query: VisualQueryDefinition) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  return (
    <SummarizeStep
      query={query}
      relations={relations}
      onChange={(next) => {
        setQuery(next);
        onChange(next);
      }}
    />
  );
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await Promise.resolve();
}

async function chooseField(groupLabel: string, fieldLabel: string): Promise<void> {
  const group = screen.getByRole('button', { name: groupLabel });
  if (group.getAttribute('aria-expanded') !== 'true') await click(group);
  await click(screen.getByRole('option', { name: fieldLabel }));
}

describe('SummarizeStep', () => {
  it('renders two equal measure/breakout bands and uses a function-first editor', async () => {
    const onChange = vi.fn();
    renderUi(<Harness onChange={onChange} />);

    const measureBand = screen.getByTestId('measure-band');
    const breakoutBand = screen.getByTestId('breakout-band');
    const splitRow = measureBand.parentElement;

    expect(splitRow?.children).toHaveLength(3);
    expect(splitRow?.children.item(0)).toBe(measureBand);
    expect(splitRow?.children.item(1)?.textContent).toBe('by');
    expect(splitRow?.children.item(2)).toBe(breakoutBand);
    expect(screen.getByTestId('notebook-step-content').getAttribute('data-surface')).toBe('CLEAR');
    expect(measureBand.className).toContain('min-h-18');
    expect(measureBand.className).toContain('p-4');
    expect(breakoutBand.className).toContain('min-h-18');
    expect(breakoutBand.className).toContain('p-4');

    await click(screen.getByRole('button', { name: 'Pick a function or metric' }));
    expect(screen.getByRole('option', { name: 'Sum' })).toBeTruthy();
    await click(screen.getByRole('option', { name: 'Sum' }));
    expect(screen.getByRole('button', { name: 'Brands fields' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Orders fields' })).toBeTruthy();

    await chooseField('Brands fields', 'Revenue');
    await click(screen.getByRole('button', { name: 'Add measure' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aggregations: [
          expect.objectContaining({
            function: 'SUM',
            expression: { kind: 'FIELD', relation: 'brands', field: 'revenue' },
          }),
        ],
      }),
    );
  });

  it('supports Count rows without showing a field picker', async () => {
    const onChange = vi.fn();
    renderUi(<Harness onChange={onChange} />);

    await click(screen.getByRole('button', { name: 'Pick a function or metric' }));
    await click(screen.getByRole('option', { name: 'Count rows' }));
    expect(screen.queryByRole('button', { name: 'Measure field' })).toBeNull();
    await click(screen.getByRole('button', { name: 'Add measure' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aggregations: [
          expect.objectContaining({
            function: 'COUNT',
            expression: { kind: 'LITERAL', valueType: 'NUMBER', value: 1 },
          }),
        ],
      }),
    );
  });

  it('commits breakouts, edits only the selected chip, rejects duplicates, and cancels cleanly', async () => {
    const onChange = vi.fn();
    renderUi(
      <Harness
        onChange={onChange}
        initialQuery={makeQuery({
          breakouts: [
            { kind: 'FIELD', relation: 'orders', field: 'status' },
            { kind: 'FIELD', relation: 'brands', field: 'name' },
          ],
        })}
      />,
    );

    await click(screen.getByRole('button', { name: 'Edit Breakout 2' }));
    await chooseField('Orders fields', 'ID');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        breakouts: [
          { kind: 'FIELD', relation: 'orders', field: 'status' },
          { kind: 'FIELD', relation: 'orders', field: 'id' },
        ],
      }),
    );

    await click(screen.getByRole('button', { name: 'Add breakout' }));
    await chooseField('Orders fields', 'Status');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        breakouts: [
          { kind: 'FIELD', relation: 'orders', field: 'status' },
          { kind: 'FIELD', relation: 'orders', field: 'id' },
        ],
      }),
    );

    await click(screen.getByRole('button', { name: 'Cancel' }));
    await click(screen.getByRole('button', { name: 'Pick a function or metric' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('option', { name: 'Sum' })).toBeNull();
  });
});
