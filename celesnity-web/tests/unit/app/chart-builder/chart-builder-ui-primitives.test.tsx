// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ClauseChip } from '@/app/(workspace)/charts/_components/ui/clause-chip';
import { NotebookStepBand } from '@/app/(workspace)/charts/_components/ui/notebook-step-band';
import { ScrollablePickerList } from '@/app/(workspace)/charts/_components/ui/scrollable-picker-list';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

describe('chart builder UI primitives', () => {
  it('keeps the picker body scrollable and the browse footer outside the list', () => {
    const { container } = renderUi(
      <ScrollablePickerList ariaLabel="Catalogs" footer={<button>Browse all data</button>}>
        <button>iceberg</button>
      </ScrollablePickerList>,
    );

    expect(screen.getByRole('list', { name: 'Catalogs' }).className).toContain('overflow-y-auto');
    expect(screen.getByRole('button', { name: 'Browse all data' }).parentElement).not.toBe(
      screen.getByRole('list', { name: 'Catalogs' }),
    );
    expect(container.querySelector('[data-tone="FILTER"]')).toBeNull();
  });

  it('uses semantic tones for bands and removable chips', () => {
    renderUi(
      <>
        <NotebookStepBand tone="DATA" label="Data">
          <ClauseChip tone="FILTER" ariaLabel="Status filter" onEdit={() => {}} onRemove={() => {}}>
            status = active
          </ClauseChip>
        </NotebookStepBand>
      </>,
    );

    expect(screen.getByRole('region', { name: 'Data' }).getAttribute('data-tone')).toBe('DATA');
    expect(
      screen.getByRole('button', { name: 'Edit Status filter' }).getAttribute('data-tone'),
    ).toBe('FILTER');
    expect(screen.getByRole('button', { name: 'Remove Status filter' })).toBeTruthy();
  });

  it('sizes notebook cells on the spacing scale rather than by hand', () => {
    renderUi(
      <NotebookStepBand tone="DATA" label="Data">
        <ClauseChip tone="DATA" ariaLabel="Source table">
          Orders
        </ClauseChip>
      </NotebookStepBand>,
    );

    const content = screen.getByTestId('notebook-step-content');
    const source = screen.getByRole('group', { name: 'Source table' });

    expect(content.className).toContain('min-h-18');
    expect(content.className).toContain('rounded-md');
    expect(content.className).toContain('p-4');
    expect(source.className).toContain('h-10');
    expect(source.className).toContain('shrink-0');
    expect(source.className).toContain('rounded-sm');
    expect(source.className).toContain('p-2.5');
  });

  it('carries step identity with an icon and a label, not a second palette', () => {
    const { container } = renderUi(
      <NotebookStepBand tone="SUMMARIZE" label="Summarize">
        <ClauseChip tone="SUMMARIZE" ariaLabel="Average of price">
          Average of price
        </ClauseChip>
      </NotebookStepBand>,
    );

    expect(screen.getByRole('heading', { name: 'Summarize' })).toBeTruthy();
    expect(screen.getByTestId('notebook-step-content').className).toContain('bg-muted');
    expect(container.innerHTML).not.toContain('--notebook-');
  });
});
