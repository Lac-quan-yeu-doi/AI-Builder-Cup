// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import {
  ChartSaveDialog,
  type ChartSaveValues,
} from '@/app/(workspace)/charts/_components/chart-save-dialog';

afterEach(cleanup);

const values: ChartSaveValues = {
  title: 'Revenue by region',
  collectionId: 'collection-1',
  description: null,
};

describe('ChartSaveDialog', () => {
  it('collects metadata without rendering or accepting preview rows', () => {
    const onSubmit = vi.fn();
    renderUi(
      <ChartSaveDialog
        open
        values={values}
        collections={[
          {
            id: 'collection-1',
            organizationId: 'org-1',
            parentId: null,
            name: 'Our Analytics',
            description: null,
            kind: 'ROOT',
            access: 'CURATE',
            chartCount: 0,
            archivedAt: null,
            children: [],
          },
        ]}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Save chart' })).toBeTruthy();
    expect(screen.getByLabelText('Destination collection')).toBeTruthy();
    expect(screen.getByLabelText('Description')).toBeTruthy();
    expect(screen.queryByText('west')).toBeNull();

    fireEvent.submit(screen.getByRole('dialog', { name: 'Save chart' }).querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledWith(values);
  });
});
