// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AggregationBuilder,
  ColumnMappingBuilder,
  FilterBuilder,
  OrderByBuilder,
  TypedValueEditor,
} from '@/app/(workspace)/databases/[database]/pipelines/[pipelineId]/_components/structured-property-editors';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

describe('structured transform property editors', () => {
  it('builds a typed filter condition', () => {
    const onChange = vi.fn();
    renderUi(createElement(FilterBuilder, { value: [], disabled: false, onChange }));

    fireEvent.change(screen.getByLabelText('Filter field'), { target: { value: 'product_id' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'product_id', operator: 'EQUALS', value: { type: 'STRING', value: '' } },
    ]);
  });

  it('uses resolved upstream fields instead of requiring manual field names', () => {
    const onChange = vi.fn();
    renderUi(
      createElement(FilterBuilder, {
        value: [],
        disabled: false,
        options: [
          { value: 'customer_id', label: 'customer_id · long · required' },
          { value: 'amount', label: 'amount · decimal(12,2)' },
        ],
        onChange,
      }),
    );

    expect(screen.getByRole('option', { name: 'customer_id · long · required' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter field'), { target: { value: 'amount' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'amount', operator: 'EQUALS', value: { type: 'STRING', value: '' } },
    ]);
  });

  it('limits filter operators and aggregate functions to the selected field type', () => {
    const options = [
      { value: 'name', label: 'name · string', dataType: 'string' },
      { value: 'amount', label: 'amount · decimal(12,2)', dataType: 'decimal(12,2)' },
    ];
    const { unmount } = renderUi(
      createElement(FilterBuilder, {
        value: [{ key: 'name', operator: 'EQUALS', value: { type: 'STRING', value: '' } }],
        disabled: false,
        options,
        onChange: vi.fn(),
      }),
    );
    expect(withinSelect('Filter operator', 'CONTAINS')).toBe(true);
    expect(withinSelect('Filter operator', 'GREATER_THAN')).toBe(false);
    unmount();

    renderUi(
      createElement(AggregationBuilder, {
        value: [{ sourceField: 'name', function: 'COUNT', outputField: 'count' }],
        disabled: false,
        options,
        onChange: vi.fn(),
      }),
    );
    expect(withinSelect('Aggregation function', 'COUNT')).toBe(true);
    expect(withinSelect('Aggregation function', 'SUM')).toBe(false);
  });

  it('keeps a stale configured field visible and marks it unavailable', () => {
    renderUi(
      createElement(ColumnMappingBuilder, {
        value: [{ sourceField: 'removed_field', targetField: 'kept', targetType: 'string' }],
        disabled: false,
        options: [{ value: 'id', label: 'id · long' }],
        onChange: vi.fn(),
      }),
    );

    expect(screen.getByRole('option', { name: 'removed_field (unavailable)' })).toBeTruthy();
  });

  it.each([
    [ColumnMappingBuilder, 'Add mapping'],
    [OrderByBuilder, 'Add ordering'],
    [AggregationBuilder, 'Add aggregation'],
  ] as const)('adds structured rows with %s', (Builder, label) => {
    const onChange = vi.fn();
    renderUi(createElement(Builder, { value: [], disabled: false, onChange }));
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([expect.any(Object)]));
  });

  it('preserves the selected literal type in the saved config', () => {
    const onChange = vi.fn();
    renderUi(
      createElement(TypedValueEditor, {
        value: { type: 'STRING', value: '' },
        disabled: false,
        onChange,
      }),
    );
    fireEvent.change(screen.getByLabelText('Value type'), { target: { value: 'INTEGER' } });
    expect(onChange).toHaveBeenCalledWith({ type: 'INTEGER', value: '' });
  });

  it('disables nested controls when pipeline editing is locked', () => {
    renderUi(createElement(FilterBuilder, { value: [], disabled: true, onChange: vi.fn() }));
    expect(
      (screen.getByLabelText('Filter field').closest('fieldset') as HTMLFieldSetElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Add condition' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

function withinSelect(label: string, value: string): boolean {
  const select = screen.getByLabelText(label) as HTMLSelectElement;
  return [...select.options].some((option) => option.value === value);
}
