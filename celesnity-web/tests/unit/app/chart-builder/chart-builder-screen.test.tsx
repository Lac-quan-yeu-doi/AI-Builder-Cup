// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultVisualization } from '@/src/entities/models/canonical-chart';

import {
  renderChartBuilder,
  chooseQuestionSource,
  resetChartBuilderRecents,
  addVisualFilter,
  makeChartDraft,
  makePreview,
  makeQueryPreview,
  makeVisualQuery,
} from './chart-builder-test-fixtures';

afterEach(cleanup);
afterEach(resetChartBuilderRecents);

describe('ChartBuilderScreen integration', () => {
  it('saves the latest visualization draft without rerunning preview', async () => {
    let previewedDraft = '';
    const preview = vi.fn().mockImplementation(async (draft) => {
      previewedDraft = JSON.stringify({
        queryDefinition: draft.queryDefinition,
        visualizationDefinition: draft.visualizationDefinition,
        outputSchema: draft.outputSchema,
        parameterValues: draft.parameterValues ?? {},
      });
      return makePreview({ proof: { token: 'vertical-proof', queryFingerprint: 'fingerprint' } });
    });
    const update = vi.fn().mockImplementation(async (draft) => {
      const savedDraft = JSON.stringify({
        queryDefinition: draft.queryDefinition,
        visualizationDefinition: draft.visualizationDefinition,
        outputSchema: draft.outputSchema,
        parameterValues: draft.parameterValues ?? {},
      });
      if (savedDraft !== previewedDraft) throw new Error('CHART_PREVIEW_MISMATCH');
      return { id: 'chart-1' };
    });
    const initialDraft = makeChartDraft({
      visualizationDefinition: {
        ...createDefaultVisualization('BAR'),
        roles: { category: 'region', measures: ['revenue'] },
        display: {
          ...createDefaultVisualization('BAR').display,
          orientation: 'HORIZONTAL',
        },
      },
    });
    const { user } = renderChartBuilder({
      initialDraft,
      chartId: 'chart-1',
      expectedRevision: 1,
      controllers: { preview, update },
    });

    await waitFor(() => expect(preview).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('tab', { name: 'Display' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Orientation' }), 'VERTICAL');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0]?.[0].visualizationDefinition.display.orientation).toBe('VERTICAL');
  });

  it('keeps query-result preview separate from the full chart preview', async () => {
    const { user, controllers } = renderChartBuilder();
    await user.click(screen.getByRole('button', { name: /new question/i }));
    // Nothing to save until there is a source. Asserted here rather than after
    // the pick: the browse columns resolve the table's metadata before the
    // helper returns, so "still disabled" afterwards was only ever timing.
    expect(screen.getByRole('button', { name: /^save$/i }).hasAttribute('disabled')).toBe(true);

    await chooseQuestionSource(user, 'iceberg', 'analytics', 'orders');
    await waitFor(() => expect(screen.getByRole('button', { name: /preview data/i })).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^save$/i }).hasAttribute('disabled')).toBe(false),
    );
    // One header, not two. The surface used to stack its own eyebrow and `<h1>`
    // under the builder's header; the source path took their place.
    expect(screen.queryByRole('heading', { name: 'Orders', exact: true })).toBeNull();
    expect(screen.queryByRole('heading', { name: /pick your starting data/i })).toBeNull();
    expect(screen.getByText('iceberg / analytics / orders')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /preview data/i }));
    await waitFor(() => expect(screen.getByText(/preview succeeded/i)).toBeTruthy());
    expect(screen.getByRole('region', { name: /query result preview/i })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(controllers.renderer.compile).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^save$/i }).hasAttribute('disabled')).toBe(false);

    await user.click(screen.getByRole('button', { name: /run preview/i }));
    await waitFor(() => expect(controllers.queryPreview).toHaveBeenCalledTimes(2));
    expect(controllers.preview).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^save$/i }).hasAttribute('disabled')).toBe(false);

    await user.click(screen.getByRole('button', { name: /^visualize$/i }));
    await waitFor(() => expect(controllers.preview).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: /^save$/i }).hasAttribute('disabled')).toBe(false);

    await user.click(screen.getByRole('button', { name: /editor/i }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /add filters to narrow your answer/i }),
      ).toBeTruthy(),
    );
    await addVisualFilter(user, 'orders.region', 'EQ', { type: 'STRING', value: 'west' });
    expect(screen.getByRole('button', { name: /^save$/i }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps the last successful rows visible as stale after a failed refresh', async () => {
    const queryPreview = vi
      .fn()
      .mockResolvedValueOnce(makeQueryPreview())
      .mockRejectedValueOnce(new Error('Timed out'));
    const { user } = renderChartBuilder({ controllers: { queryPreview } });
    await user.click(screen.getByRole('button', { name: /new question/i }));
    await chooseQuestionSource(user, 'iceberg', 'analytics', 'orders');
    await waitFor(() => expect(screen.getByRole('button', { name: /preview data/i })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /run preview/i }));
    await waitFor(() => expect(screen.getByText('west')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /run preview/i }));

    await waitFor(() => expect(screen.getByText(/stale/i)).toBeTruthy());
    expect(screen.getByText('west')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^save$/i }).hasAttribute('disabled')).toBe(false);
  });

  it('saves the current chart draft without rerunning a failed preview', async () => {
    const preview = vi.fn().mockRejectedValue(new Error('Preview service unavailable'));
    const update = vi.fn().mockResolvedValue({ id: 'chart-1' });
    const { user, controllers } = renderChartBuilder({
      initialDraft: makeChartDraft(),
      chartId: 'chart-1',
      expectedRevision: 2,
      controllers: { preview, update },
    });

    await waitFor(() => expect(preview).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: /^save$/i }).hasAttribute('disabled')).toBe(false);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(controllers.queryPreview).not.toHaveBeenCalled();
    expect(preview).toHaveBeenCalledOnce();
  });

  it('shows query-result columns when the preview returns zero rows', async () => {
    const queryPreview = vi.fn().mockResolvedValue(makeQueryPreview({ rows: [], rowCount: 0 }));
    const { user } = renderChartBuilder({ controllers: { queryPreview } });
    await user.click(screen.getByRole('button', { name: /new question/i }));
    await chooseQuestionSource(user, 'iceberg', 'analytics', 'orders');
    await waitFor(() => expect(screen.getByRole('button', { name: /preview data/i })).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /run preview/i }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: /query result preview/i })).toBeTruthy(),
    );
    expect(screen.getByRole('columnheader', { name: 'region' })).toBeTruthy();
  });

  it('does not accept a preview completed after the query changed', async () => {
    let resolvePreview: ((value: ReturnType<typeof makeQueryPreview>) => void) | undefined;
    const queryPreview = vi.fn().mockReturnValue(
      new Promise<ReturnType<typeof makeQueryPreview>>((resolve) => {
        resolvePreview = resolve;
      }),
    );
    const { user } = renderChartBuilder({ controllers: { queryPreview } });
    await user.click(screen.getByRole('button', { name: /new question/i }));
    await chooseQuestionSource(user, 'iceberg', 'analytics', 'orders');

    const previewButton = await screen.findByRole('button', { name: /run preview/i });
    await user.click(previewButton);
    expect(previewButton.hasAttribute('disabled')).toBe(true);
    await addVisualFilter(user, 'orders.status', 'EQ', { type: 'STRING', value: 'PAID' });
    resolvePreview?.(makeQueryPreview());

    await waitFor(() => expect(queryPreview).toHaveBeenCalledOnce());
    expect(screen.getByRole('region', { name: /query result preview/i })).toBeTruthy();
    expect(screen.queryByText('west')).toBeNull();
    expect(screen.getByRole('button', { name: /^save$/i }).hasAttribute('disabled')).toBe(false);
  });

  it('previews native SQL as a table and visualizes it only on demand', async () => {
    const queryPreview = vi.fn().mockResolvedValue(makeQueryPreview({ rows: [], rowCount: 0 }));
    const { user, controllers } = renderChartBuilder({ controllers: { queryPreview } });
    await user.click(screen.getByRole('button', { name: /new sql query/i }));

    await user.click(screen.getByRole('button', { name: /run preview/i }));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /query result preview/i })).toBeTruthy(),
    );
    expect(screen.getByRole('columnheader', { name: 'region' })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(controllers.renderer.compile).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^visualize$/i }));
    await waitFor(() =>
      expect(screen.getByRole('main', { name: /visualization result/i })).toBeTruthy(),
    );
    expect(queryPreview).toHaveBeenCalledTimes(2);
    expect(controllers.preview).toHaveBeenCalledOnce();
  });

  it('opens the collection picker without running a preview when saving from the editor', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'chart-1' });
    const { user, controllers } = renderChartBuilder({ controllers: { create } });
    await user.click(screen.getByRole('button', { name: /new question/i }));
    await chooseQuestionSource(user, 'iceberg', 'analytics', 'orders');
    await waitFor(() => expect(screen.getByRole('button', { name: /run preview/i })).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Save chart' })).toBeTruthy());
    expect(controllers.queryPreview).not.toHaveBeenCalled();
    expect(controllers.preview).not.toHaveBeenCalled();
    expect(screen.queryByText('west')).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Destination collection' }));
    expect(screen.getByRole('option', { name: /Personal/i })).toBeTruthy();
    await user.click(screen.getByRole('option', { name: /Personal/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const payload = create.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty('previewToken');
    expect(JSON.stringify(payload)).not.toMatch(/"rows"|"data"|"vl_spec"/u);
  });

  it('switches between the progressive question and results surfaces', async () => {
    const preview = vi.fn().mockResolvedValue(makePreview());
    const queryPreview = vi.fn().mockResolvedValue(makeQueryPreview());
    const { user } = renderChartBuilder({ controllers: { preview, queryPreview } });
    await user.click(screen.getByRole('button', { name: /new question/i }));
    await chooseQuestionSource(user, 'iceberg', 'analytics', 'orders');
    await waitFor(() => expect(screen.getByRole('button', { name: /change data/i })).toBeTruthy());

    expect(screen.getByRole('region', { name: /visual query notebook/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^visualize$/i }));
    await waitFor(() =>
      expect(screen.getByRole('main', { name: /visualization result/i })).toBeTruthy(),
    );
    expect(queryPreview).toHaveBeenCalledOnce();
    expect(preview).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: /editor/i }));
    expect(screen.getByRole('region', { name: /visual query notebook/i })).toBeTruthy();
  });

  it('keeps the question surface within the route viewport boundary', async () => {
    const { user } = renderChartBuilder();
    await user.click(screen.getByRole('button', { name: /new question/i }));

    const question = screen.getByRole('main', { name: 'Chart question' });
    expect(question.className).toContain('h-full');
    expect(question.className).toContain('min-h-0');
    expect(question.className).not.toContain('min-h-screen');
  });

  it('restores source and joined-table metadata when returning from visualization', async () => {
    const query = makeVisualQuery({
      source: {
        table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' },
        alias: 'orders',
      },
      joins: [
        {
          type: 'LEFT',
          table: { catalog: 'iceberg', schema: 'analytics', table: 'order_items' },
          alias: 'order_items',
          conditions: [
            {
              left: { kind: 'FIELD', relation: 'orders', field: 'id' },
              operator: 'EQ',
              right: { kind: 'FIELD', relation: 'order_items', field: 'order_id' },
            },
          ],
        },
      ],
      aggregations: [
        {
          alias: 'order_count',
          function: 'COUNT',
          expression: { kind: 'FIELD', relation: 'order_items', field: 'order_id' },
        },
      ],
      breakouts: [{ kind: 'FIELD', relation: 'orders', field: 'name' }],
    });
    const loadTableMetadata = vi.fn().mockImplementation(async (ref) => ({
      catalog: ref.catalog,
      schema: ref.schema,
      name: ref.table,
      columns:
        ref.table === 'orders'
          ? [
              { name: 'id', dataType: 'BIGINT', nullable: false, ordinalPosition: 1 },
              { name: 'name', dataType: 'VARCHAR', nullable: false, ordinalPosition: 2 },
            ]
          : [
              { name: 'order_id', dataType: 'BIGINT', nullable: false, ordinalPosition: 1 },
              { name: 'quantity', dataType: 'BIGINT', nullable: false, ordinalPosition: 2 },
            ],
    }));
    const { user } = renderChartBuilder({
      initialDraft: makeChartDraft({
        queryDefinition: query,
        outputSchema: [
          { name: 'order_count', type: 'BIGINT', family: 'NUMBER' },
          { name: 'name', type: 'VARCHAR', family: 'STRING' },
        ],
      }),
      controllers: { loadTableMetadata },
    });

    await user.click(screen.getByRole('button', { name: /editor/i }));
    await waitFor(() => expect(loadTableMetadata).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: 'Join 1 left field 1' }));
    expect(screen.getByRole('button', { name: 'Orders fields' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'ID' })).toBeTruthy();
    await user.click(screen.getByRole('option', { name: 'ID' }));

    await user.click(screen.getByRole('button', { name: 'Join 1 right field 1' }));
    expect(screen.getByRole('button', { name: 'Order Items fields' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Order ID' })).toBeTruthy();
  });
});
