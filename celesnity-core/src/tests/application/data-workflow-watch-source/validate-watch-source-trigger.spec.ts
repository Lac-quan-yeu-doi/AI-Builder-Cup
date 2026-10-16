import { ValidateWatchSourceTriggerUseCase } from '@application/data-workflow-watch-source/validate-watch-source-trigger.use-case';
import { WatchSourceCapabilityRegistry } from '@infrastructure/data-workflow-watch-source/watch-source-capability.registry';
import { CdcConnectionRuntimeError } from '@application/database-service/interfaces/i-cdc-connection-runtime-provider';

const actor = { organizationId: 'organization-1', identityId: 'identity-1' };
const trigger = {
  type: 'WATCH_SOURCE' as const,
  mode: 'POLLING' as const,
  databaseServiceId: 'source-1',
  everySeconds: 600,
  relations: [
    {
      schema: 'public',
      table: 'orders',
      cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
    },
  ],
};

describe('ValidateWatchSourceTriggerUseCase', () => {
  const registry = new WatchSourceCapabilityRegistry();
  const runtimeProvider = { requireVerified: jest.fn() };
  const access = {
    readVerifiedMetadata: jest.fn(async () => ({
      connectorType: 'POSTGRESQL',
      relations: [
        {
          schema: 'public',
          table: 'orders',
          columns: ['updated_at', 'id'],
        },
      ],
    })),
    listCatalogServices: jest.fn(),
    listCatalogRelations: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('validates selected relations and cursor columns from persisted source metadata', async () => {
    const useCase = new ValidateWatchSourceTriggerUseCase(access, registry);

    await expect(useCase.validate(actor, trigger)).resolves.toMatchObject({ issues: [] });
    await expect(
      useCase.validate(actor, {
        ...trigger,
        relations: [
          {
            schema: 'public',
            table: 'missing',
            cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
          },
        ],
      }),
    ).resolves.toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ code: 'RELATION_NOT_AVAILABLE' })]),
    });
    await expect(
      useCase.validate(actor, {
        ...trigger,
        relations: [
          {
            schema: 'public',
            table: 'orders',
            cursor: { changeColumn: 'changed_elsewhere', tieBreakerColumn: 'id' },
          },
        ],
      }),
    ).resolves.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'CURSOR_COLUMN_NOT_AVAILABLE' }),
      ]),
    });
  });

  it('does not obtain decrypted credentials for capabilities or trigger validation', async () => {
    const useCase = new ValidateWatchSourceTriggerUseCase(access, registry);

    await useCase.capabilities(actor, trigger.databaseServiceId);
    await useCase.validate(actor, trigger);

    expect(runtimeProvider.requireVerified).not.toHaveBeenCalled();
  });

  it('keeps quoted identifier components distinct when their dots would collide in a flat key', async () => {
    access.readVerifiedMetadata.mockResolvedValueOnce({
      connectorType: 'POSTGRESQL',
      relations: [
        // PostgreSQL permits dots inside double-quoted identifiers. Metadata
        // stores the identifier value without its SQL quotes.
        {
          schema: 'customer.reporting',
          table: 'orders',
          columns: ['left_changed', 'id'],
        },
        {
          schema: 'customer',
          table: 'reporting.orders',
          columns: ['right_changed', 'id'],
        },
      ],
    });
    const useCase = new ValidateWatchSourceTriggerUseCase(access, registry);

    await expect(
      useCase.validate(actor, {
        ...trigger,
        relations: [
          {
            schema: 'customer.reporting',
            table: 'orders',
            cursor: { changeColumn: 'left_changed', tieBreakerColumn: 'id' },
          },
        ],
      }),
    ).resolves.toMatchObject({ issues: [] });
  });

  it('runs CDC preflight only after metadata validation succeeds', async () => {
    const manager = {
      preflight: jest.fn().mockResolvedValue({
        available: true,
        code: 'READY',
        message: 'ready',
      }),
    };
    runtimeProvider.requireVerified.mockResolvedValue({ id: 'source-1' });
    const useCase = new ValidateWatchSourceTriggerUseCase(
      access,
      registry,
      runtimeProvider,
      manager,
    );
    const cdcTrigger = {
      type: 'WATCH_SOURCE' as const,
      mode: 'CDC' as const,
      databaseServiceId: 'source-1',
      aggregationWindowSeconds: 10,
      relations: [{ schema: 'public', table: 'orders' }],
      changeTypes: ['INSERT', 'UPDATE', 'DELETE'] as const,
    };

    await expect(useCase.validate(actor, cdcTrigger)).resolves.toMatchObject({
      issues: [],
      cdcPreflight: { available: true, code: 'READY' },
    });
    expect(manager.preflight).toHaveBeenCalledWith({ id: 'source-1' }, cdcTrigger);
    expect(runtimeProvider.requireVerified).toHaveBeenCalledWith('source-1');
  });

  it('returns safe setup remediation when the datasource has no CDC profile', async () => {
    runtimeProvider.requireVerified.mockRejectedValueOnce(
      new CdcConnectionRuntimeError('CDC_CONNECTION_REQUIRED'),
    );
    const manager = { preflight: jest.fn() };
    const useCase = new ValidateWatchSourceTriggerUseCase(
      access,
      registry,
      runtimeProvider,
      manager,
    );

    await expect(
      useCase.validate(actor, {
        type: 'WATCH_SOURCE',
        mode: 'CDC',
        databaseServiceId: 'source-1',
        aggregationWindowSeconds: 10,
        relations: [{ schema: 'public', table: 'orders' }],
        changeTypes: ['INSERT'],
      }),
    ).resolves.toMatchObject({
      cdcPreflight: { available: false, code: 'CDC_CONNECTION_REQUIRED' },
    });
    expect(manager.preflight).not.toHaveBeenCalled();
  });
});
