import { ReconcileCdcConnectorUseCase } from '@application/data-workflow-watch-source/reconcile-cdc-connector.use-case';
import type { ICdcConnectorManager } from '@application/data-workflow-watch-source/interfaces/i-cdc-connector-manager';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type { ICdcConnectionRuntimeProvider } from '@application/database-service/interfaces/i-cdc-connection-runtime-provider';
import type { CdcConnectionRuntimeProfile } from '@application/database-service/read-models/cdc-connection-runtime-profile';

const trigger = {
  type: 'WATCH_SOURCE' as const,
  mode: 'CDC' as const,
  databaseServiceId: 'source-1',
  aggregationWindowSeconds: 10,
  relations: [{ schema: 'public', table: 'orders' }],
  changeTypes: ['DELETE'] as const,
};

describe('ReconcileCdcConnectorUseCase', () => {
  it('resolves only a verified runtime profile and delegates reconciliation', async () => {
    const profile = { id: 'source-1' } as CdcConnectionRuntimeProfile;
    const runtimeProvider = {
      requireVerified: jest.fn().mockResolvedValue(profile),
    } as unknown as ICdcConnectionRuntimeProvider;
    const manager = {
      reconcile: jest.fn().mockResolvedValue({
        name: 'celesnity-cdc-hash',
        lifecycle: 'RUNNING',
        preflight: { available: true, code: 'READY', message: 'ready' },
      }),
    } as unknown as ICdcConnectorManager;
    const useCase = new ReconcileCdcConnectorUseCase(runtimeProvider, manager);

    await expect(
      useCase.execute({ organizationId: 'org-1', databaseServiceId: 'source-1', trigger }),
    ).resolves.toMatchObject({ lifecycle: 'RUNNING' });
    expect(runtimeProvider.requireVerified).toHaveBeenCalledWith('source-1');
    expect(manager.reconcile).toHaveBeenCalledWith({
      organizationId: 'org-1',
      databaseServiceId: 'source-1',
      trigger,
      profile,
    });
  });

  it('unions active table selections before building the connector include list', async () => {
    const profile = { id: 'source-1' } as CdcConnectionRuntimeProfile;
    const runtimeProvider = {
      requireVerified: jest.fn().mockResolvedValue(profile),
    } as unknown as ICdcConnectionRuntimeProvider;
    const manager = {
      reconcile: jest.fn().mockResolvedValue({
        name: 'celesnity-cdc-hash',
        lifecycle: 'RUNNING',
        preflight: { available: true, code: 'READY', message: 'ready' },
      }),
    } as unknown as ICdcConnectorManager;
    const watchSources = {
      listActiveCdcRelations: jest
        .fn()
        .mockResolvedValue([{ schema: 'public', table: 'customers' }]),
    } as unknown as IWatchSourceRepository;
    const useCase = new ReconcileCdcConnectorUseCase(runtimeProvider, manager, watchSources);

    await useCase.execute({ organizationId: 'org-1', databaseServiceId: 'source-1', trigger });

    expect(manager.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({
          relations: [
            { schema: 'public', table: 'customers' },
            { schema: 'public', table: 'orders' },
          ],
        }),
      }),
    );
  });

  it('delegates connector pause by organization and database service identity', async () => {
    const manager = {
      pause: jest.fn().mockResolvedValue(undefined),
    } as unknown as ICdcConnectorManager;
    const useCase = new ReconcileCdcConnectorUseCase(
      {} as ICdcConnectionRuntimeProvider,
      manager,
    );

    await useCase.pause('org-1', 'source-1');

    expect(manager.pause).toHaveBeenCalledWith('org-1', 'source-1');
  });
});
