// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { NativeQueryEditor } from '@/app/(workspace)/charts/_components/native-query/native-query-editor';
import type { DataSourceBrowserControllers } from '@/app/(workspace)/charts/_components/data-source-picker/data-source-picker.types';
import { makeNativeQuery, makeBuilderControllers } from './chart-builder-test-fixtures';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (value: string) => void }) => (
    <textarea
      aria-label="SQL statement editor"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

afterEach(cleanup);

describe('NativeQueryEditor', () => {
  it('shows the catalog/schema browser and keeps parameter values separate from SQL', async () => {
    const query = makeNativeQuery({
      sql: 'SELECT * FROM orders WHERE created_at >= {{start_date}}',
      parameters: [{ name: 'start_date', type: 'DATE', required: true }],
    });
    const onQueryContextChange = vi.fn();
    const onChange = vi.fn();

    renderUi(
      <NativeQueryEditor
        query={query}
        values={{ start_date: '2026-08-01' }}
        controllers={makeBuilderControllers() as unknown as DataSourceBrowserControllers}
        onChange={onChange}
        onQueryContextChange={onQueryContextChange}
        onParameters={vi.fn()}
        onValues={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Data source picker' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'SQL editor' })).toBeTruthy();
    expect(screen.getByLabelText('Value for start_date')).toHaveProperty('value', '2026-08-01');

    await waitFor(() => expect(screen.getByRole('button', { name: 'iceberg' })).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'iceberg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'analytics' })).toBeTruthy());
    await fireEvent.click(screen.getByRole('button', { name: 'analytics' }));
    expect(onQueryContextChange).toHaveBeenCalledWith({ catalog: 'iceberg', schema: 'analytics' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
