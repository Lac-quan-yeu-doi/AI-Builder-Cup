// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionCatalogPanel } from '@/app/(workspace)/administration/_components/action-catalog-panel';
import { renderUi } from '@/tests/support/render-ui';
import type { ListActionCatalogController } from '@/src/interface-adapters/controllers/action-catalog/list-action-catalog.controller';
import type { ActionCatalogEntryViewModel } from '@/src/interface-adapters/presenters/action-catalog.presenter';

const entry = (
  overrides: Partial<ActionCatalogEntryViewModel> = {},
): ActionCatalogEntryViewModel => ({
  toolName: 'delete_chart',
  actionName: 'chart.delete',
  description: 'Deletes a chart.',
  inputSchema: {},
  permission: 'write',
  auditRequired: true,
  approvalRequired: true,
  ...overrides,
});

afterEach(() => {
  cleanup();
});

describe('ActionCatalogPanel', () => {
  it('loads the chart catalog by default and shows approval-required entries', async () => {
    const listActionCatalog = vi.fn(async (domain: string) =>
      domain === 'chart' ? [entry()] : [],
    ) as unknown as ListActionCatalogController;

    renderUi(createElement(ActionCatalogPanel, { listActionCatalog }));

    await waitFor(() => expect(screen.getByText('chart.delete')).toBeDefined());
    expect(listActionCatalog).toHaveBeenCalledWith('chart');
    expect(screen.getByText('Requires approval')).toBeDefined();
  });

  it('switches to the document tab and fetches that domain lazily', async () => {
    const listActionCatalog = vi.fn(async (domain: string) =>
      domain === 'document'
        ? [entry({ actionName: 'document.getText', toolName: 'get_document_text' })]
        : [],
    ) as unknown as ListActionCatalogController;

    renderUi(createElement(ActionCatalogPanel, { listActionCatalog }));

    // Radix activates a tab on mousedown, not on a bare click event; the
    // panel moved onto the kit's Tabs when the Mantine one went away.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Document actions' }));

    await waitFor(() => expect(screen.getByText('document.getText')).toBeDefined());
    expect(listActionCatalog).toHaveBeenCalledWith('document');
  });

  it('shows an error message when the catalog fails to load', async () => {
    const listActionCatalog = vi
      .fn()
      .mockRejectedValue(new Error('boom')) as unknown as ListActionCatalogController;

    renderUi(createElement(ActionCatalogPanel, { listActionCatalog }));

    expect(await screen.findByText('Could not load the action catalog.')).toBeDefined();
  });
});
