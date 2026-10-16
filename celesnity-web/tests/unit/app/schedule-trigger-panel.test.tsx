// @vitest-environment jsdom
import { createElement, useState } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScheduleTriggerPanel } from '@/app/(workspace)/data-workflows/_components/schedule-trigger-panel';
import { renderUi } from '@/tests/support/render-ui';
import type { DataWorkflowTrigger } from '@/src/entities/models/data-workflow-graph';
import type { DataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';

const controller = {
  listWatchSourceCatalog: async () => ({ data: [], page: 1, pageSize: 100, totalItems: 0 }),
  listWatchSourceRelations: async () => ({ data: [], page: 1, pageSize: 100, totalItems: 0 }),
  validateWatchSource: async () => ({
    capabilities: {
      connectorType: 'POSTGRESQL',
      polling: true,
      cdc: false,
      supportedChangeTypes: ['INSERT', 'UPDATE'] as const,
    },
    issues: [],
  }),
} as unknown as DataWorkflowController;

function TriggerHarness() {
  const [trigger, setTrigger] = useState<DataWorkflowTrigger>({ type: 'MANUAL' });
  return <ScheduleTriggerPanel controller={controller} trigger={trigger} onChange={setTrigger} />;
}

describe('ScheduleTriggerPanel', () => {
  afterEach(cleanup);

  it('offers trigger kinds and exposes calendar time, days, and timezone fields', () => {
    renderUi(createElement(TriggerHarness));

    expect(screen.getByRole('option', { name: 'Watch source' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Trigger type'), { target: { value: 'CALENDAR' } });
    expect(screen.getByLabelText('Time')).toBeTruthy();
    expect(screen.getByLabelText('Timezone')).toBeTruthy();
    expect(screen.getByLabelText('Monday')).toBeTruthy();
    expect(screen.getByLabelText('Sunday')).toBeTruthy();
  });

  it('keeps interval validation local and switches Watch Source modes', () => {
    renderUi(createElement(TriggerHarness));

    fireEvent.change(screen.getByLabelText('Trigger type'), { target: { value: 'INTERVAL' } });
    fireEvent.change(screen.getByLabelText('UTC anchor'), {
      target: { value: '2026-02-30T00:00' },
    });
    expect(screen.getAllByText(/valid UTC timestamp/i)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Trigger type'), { target: { value: 'WATCH_SOURCE' } });
    expect(screen.getByLabelText('Watch mode')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Watch mode'), { target: { value: 'CDC' } });
    expect(screen.getByLabelText('Trigger at most once every (seconds)')).toBeTruthy();
    expect(screen.getByText('CDC events')).toBeTruthy();
  });

  it('adds and removes tables from the selected datasource metadata', async () => {
    const metadataController = {
      listWatchSourceCatalog: async () => ({
        data: [
          {
            id: 'service-1',
            name: 'Orders DB',
            connectorType: 'POSTGRESQL',
            verificationStatus: 'SUCCEEDED' as const,
            metadataAvailable: true,
          },
        ],
        page: 1,
        pageSize: 100,
        totalItems: 1,
      }),
      listWatchSourceRelations: async () => ({
        data: [
          {
            schema: 'public',
            table: 'orders',
            relationType: 'TABLE',
            columns: [
              { name: 'id', nativeType: 'uuid', nullable: false },
              { name: 'updated_at', nativeType: 'timestamp', nullable: false },
            ],
          },
        ],
        page: 1,
        pageSize: 100,
        totalItems: 1,
      }),
      validateWatchSource: controller.validateWatchSource,
    } as unknown as DataWorkflowController;
    renderUi(
      createElement(() => {
        const [trigger, setTrigger] = useState<DataWorkflowTrigger>({ type: 'MANUAL' });
        return (
          <ScheduleTriggerPanel
            controller={metadataController}
            trigger={trigger}
            onChange={setTrigger}
          />
        );
      }),
    );

    fireEvent.change(screen.getByLabelText('Trigger type'), { target: { value: 'WATCH_SOURCE' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /Orders DB/ })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Datasource'), { target: { value: 'service-1' } });
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Add table' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add table' }));
    fireEvent.change(screen.getByLabelText('Table from datasource metadata'), {
      target: { value: 'public.orders' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add selected table' }));

    expect(screen.getByText('public.orders')).toBeTruthy();
    expect(screen.queryByLabelText('Schema 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('public.orders')).toBeNull();
  });

  it('links a missing CDC profile to datasource setup without changing the workflow draft', async () => {
    const cdcController = {
      listWatchSourceCatalog: async () => ({
        data: [
          {
            id: 'service-1',
            name: 'Orders DB',
            databaseName: 'sales_catalog',
            connectorType: 'POSTGRESQL',
            verificationStatus: 'SUCCEEDED' as const,
            metadataAvailable: true,
          },
        ],
        page: 1,
        pageSize: 100,
        totalItems: 1,
      }),
      listWatchSourceRelations: async () => ({
        data: [
          {
            schema: 'public',
            table: 'orders',
            relationType: 'TABLE',
            columns: [],
          },
        ],
        page: 1,
        pageSize: 100,
        totalItems: 1,
      }),
      validateWatchSource: async () => ({
        capabilities: {
          connectorType: 'POSTGRESQL',
          polling: true,
          cdc: true,
          supportedChangeTypes: ['INSERT', 'UPDATE', 'DELETE'] as const,
        },
        issues: [],
        cdcPreflight: {
          available: false,
          code: 'CDC_CONNECTION_REQUIRED' as const,
          message: 'Configure a dedicated CDC connection for this datasource.',
          remediation: 'Open the datasource CDC connection settings and complete validation.',
        },
      }),
    } as unknown as DataWorkflowController;

    renderUi(
      createElement(() => {
        const [trigger, setTrigger] = useState<DataWorkflowTrigger>({
          type: 'WATCH_SOURCE',
          mode: 'CDC',
          databaseServiceId: 'service-1',
          aggregationWindowSeconds: 5,
          relations: [{ schema: 'public', table: 'orders' }],
          changeTypes: ['INSERT'],
        });
        return (
          <ScheduleTriggerPanel
            controller={cdcController}
            trigger={trigger}
            onChange={setTrigger}
          />
        );
      }),
    );

    expect(await screen.findByText('public.orders')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Validate source configuration' }));
    const setupLink = await screen.findByRole('link', { name: 'Configure CDC connection' });
    expect(setupLink.getAttribute('href')).toBe('/databases/sales_catalog/sources/service-1');
    expect(screen.getByText('public.orders')).toBeTruthy();
    expect((screen.getByLabelText('Datasource') as HTMLSelectElement).value).toBe('service-1');
  });
});
