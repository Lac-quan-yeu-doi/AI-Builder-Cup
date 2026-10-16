import type { AdministrationRepository } from '@application/administration/administration.repository';
import {
  AdministrationUseCases,
  ServiceIdentityAdminDeniedError,
} from '@application/administration/administration.use-cases';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IdentityAdministrationService } from '@application/administration/identity-administration.service';

describe('AdministrationUseCases.removeAccount', () => {
  it('stages revocation, deletes the tenant user, and then completes database cleanup', async () => {
    const calls: string[] = [];
    const repository = {
      prepareAccountRemoval: jest.fn(async () => {
        calls.push('prepare');
        return { identityId: 'identity-1', subject: 'firebase-user-1' };
      }),
      completeAccountRemoval: jest.fn(async () => {
        calls.push('complete');
      }),
    } as unknown as AdministrationRepository;
    const identities = {
      deleteUser: jest.fn(async () => {
        calls.push('firebase');
      }),
    } as unknown as IdentityAdministrationService;

    await new AdministrationUseCases(repository, contexts(), identities).removeAccount(
      'membership-1',
    );

    expect(calls).toEqual(['prepare', 'firebase', 'complete']);
    expect(repository.prepareAccountRemoval).toHaveBeenCalledWith('organization-1', 'membership-1');
    expect(repository.completeAccountRemoval).toHaveBeenCalledWith(
      'organization-1',
      'membership-1',
      'identity-1',
    );
  });

  it('leaves the staged revocation available for retry when Firebase deletion fails', async () => {
    const repository = {
      prepareAccountRemoval: jest.fn(async () => ({
        identityId: 'identity-1',
        subject: 'firebase-user-1',
      })),
      completeAccountRemoval: jest.fn(async () => undefined),
    } as unknown as AdministrationRepository;
    const identities = {
      deleteUser: jest.fn(async () => {
        throw new Error('Identity Platform unavailable');
      }),
    } as unknown as IdentityAdministrationService;

    await expect(
      new AdministrationUseCases(repository, contexts(), identities).removeAccount('membership-1'),
    ).rejects.toThrow('Identity Platform unavailable');
    expect(repository.completeAccountRemoval).not.toHaveBeenCalled();
  });
});

function contexts(): AuthenticatedContextStore {
  return {
    require: () => ({
      organizationId: 'organization-1',
      identityTenantId: 'tenant-1',
      organizationStatus: 'ACTIVE',
      role: 'ANALYST',
      mfaRequired: false,
      mfaVerified: false,
    }),
  } as unknown as AuthenticatedContextStore;
}

describe('AdministrationUseCases service identity management', () => {
  const update = {
    enabled: true,
    permissions: ['workspace:read'] as const,
    features: ['QUERY'] as const,
  };

  it.each([
    { role: 'ANALYST', mfaRequired: false, mfaVerified: false },
    { role: 'ORG_ADMIN', mfaRequired: true, mfaVerified: false },
  ])('rejects a non-administrator or missing MFA before repository access', (principal) => {
    const repository = { updateAgentServiceIdentity: jest.fn(), listServiceIdentities: jest.fn() };
    const context = { require: () => principal } as unknown as AuthenticatedContextStore;
    const useCases = new AdministrationUseCases(
      repository as unknown as AdministrationRepository,
      context,
      {} as IdentityAdministrationService,
    );
    expect(() => useCases.updateAgentServiceIdentity(update)).toThrow(
      ServiceIdentityAdminDeniedError,
    );
    expect(() => useCases.listServiceIdentities()).toThrow(ServiceIdentityAdminDeniedError);
    expect(repository.updateAgentServiceIdentity).not.toHaveBeenCalled();
  });

  it('passes the authorized owner identity and request correlation to the transactional repository', async () => {
    const repository = {
      updateAgentServiceIdentity: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const context = {
      require: () => ({
        role: 'ORG_OWNER',
        mfaRequired: true,
        mfaVerified: true,
        organizationId: 'organization-1',
        identityId: 'owner-1',
        requestId: 'request-1',
      }),
    } as unknown as AuthenticatedContextStore;
    await new AdministrationUseCases(
      repository as unknown as AdministrationRepository,
      context,
      {} as IdentityAdministrationService,
    ).updateAgentServiceIdentity(update);
    expect(repository.updateAgentServiceIdentity).toHaveBeenCalledWith(
      'organization-1',
      'owner-1',
      'request-1',
      true,
      ['workspace:read'],
      ['QUERY'],
    );
  });
});

describe('AdministrationUseCases.enableMfa', () => {
  it('enables the configured tenant before persisting the organization requirement', async () => {
    const calls: string[] = [];
    const repository = {
      enableMfa: jest.fn(async () => {
        calls.push('database');
      }),
    } as unknown as AdministrationRepository;
    const identities = {
      enableMfa: jest.fn(async () => {
        calls.push('firebase');
      }),
    } as unknown as IdentityAdministrationService;
    await new AdministrationUseCases(repository, contexts(), identities).enableMfa();
    expect(calls).toEqual(['firebase', 'database']);
    expect(identities.enableMfa).toHaveBeenCalledWith('tenant-1');
    expect(repository.enableMfa).toHaveBeenCalledWith('organization-1', 'tenant-1');
  });

  it('does not enforce MFA when enabling the identity provider fails', async () => {
    const repository = { enableMfa: jest.fn() } as unknown as AdministrationRepository;
    const identities = {
      enableMfa: jest.fn().mockRejectedValue(new Error('Provider unavailable')),
    } as unknown as IdentityAdministrationService;
    await expect(
      new AdministrationUseCases(repository, contexts(), identities).enableMfa(),
    ).rejects.toThrow('Provider unavailable');
    expect(repository.enableMfa).not.toHaveBeenCalled();
  });
});

describe('AdministrationUseCases.authorizeCatalog — demo namespace', () => {
  it('still requires an explicit agent grant for the shared demo namespace', async () => {
    const repository = {
      authorizeCatalog: jest
        .fn()
        .mockResolvedValue({ allowed: false, matchedGrantIds: [], reason: 'DEFAULT_DENY' }),
    } as unknown as AdministrationRepository;
    const context = {
      require: () => ({
        organizationId: 'organization-1',
        identityId: 'identity-1',
        organizationStatus: 'ACTIVE',
        role: 'ANALYST',
        mfaRequired: true,
        mfaVerified: true,
        agentName: 'chat-assistant',
      }),
    } as unknown as AuthenticatedContextStore;
    const hierarchy = [
      { type: 'CATALOG' as const, id: 'iceberg' },
      { type: 'SCHEMA' as const, id: 'iceberg.demo' },
    ];
    await expect(
      new AdministrationUseCases(
        repository,
        context,
        {} as IdentityAdministrationService,
      ).authorizeCatalog('SELECT', hierarchy),
    ).resolves.toMatchObject({ allowed: false });
    expect(repository.authorizeCatalog).toHaveBeenCalledWith(
      'organization-1',
      'identity-1',
      'SELECT',
      hierarchy,
      'chat-assistant',
      true,
    );
  });
  it('does not let the shared demo exception bypass MFA', async () => {
    const repository = { authorizeCatalog: jest.fn() } as unknown as AdministrationRepository;
    const context = {
      require: () => ({
        organizationId: 'organization-1',
        organizationStatus: 'ACTIVE',
        role: 'ANALYST',
        mfaRequired: true,
        mfaVerified: false,
      }),
    } as unknown as AuthenticatedContextStore;
    const useCases = new AdministrationUseCases(
      repository,
      context,
      {} as IdentityAdministrationService,
    );
    await expect(
      useCases.authorizeCatalog('SELECT', [
        { type: 'CATALOG', id: 'iceberg' },
        { type: 'SCHEMA', id: 'iceberg.demo' },
      ]),
    ).resolves.toMatchObject({ allowed: false });
    expect(repository.authorizeCatalog).not.toHaveBeenCalled();
  });
  it('allows SELECT on the demo schema without consulting the grant repository', async () => {
    const repository = {
      authorizeCatalog: jest.fn(),
    } as unknown as AdministrationRepository;

    const decision = await new AdministrationUseCases(
      repository,
      contexts(),
      {} as IdentityAdministrationService,
    ).authorizeCatalog('SELECT', [
      { type: 'CATALOG', id: 'iceberg' },
      { type: 'SCHEMA', id: 'iceberg.demo' },
      { type: 'TABLE', id: 'iceberg.demo.customers' },
    ]);

    expect(decision).toEqual({ allowed: true, matchedGrantIds: [], reason: 'EXPLICIT_ALLOW' });
    expect(repository.authorizeCatalog).not.toHaveBeenCalled();
  });

  it('falls through to the grant repository for a non-demo schema', async () => {
    const repository = {
      authorizeCatalog: jest.fn().mockResolvedValue({
        allowed: false,
        matchedGrantIds: [],
        reason: 'DEFAULT_DENY',
      }),
    } as unknown as AdministrationRepository;

    await new AdministrationUseCases(
      repository,
      contexts(),
      {} as IdentityAdministrationService,
    ).authorizeCatalog('SELECT', [
      { type: 'CATALOG', id: 'iceberg' },
      { type: 'SCHEMA', id: 'iceberg.production' },
    ]);

    expect(repository.authorizeCatalog).toHaveBeenCalledWith(
      'organization-1',
      undefined,
      'SELECT',
      [
        { type: 'CATALOG', id: 'iceberg' },
        { type: 'SCHEMA', id: 'iceberg.production' },
      ],
      undefined,
      false,
    );
  });
});

describe('Core-registered Agent run scope', () => {
  const hierarchy = (schema: string) => [
    { type: 'CATALOG' as const, id: 'iceberg' },
    { type: 'SCHEMA' as const, id: `iceberg.${schema}` },
    { type: 'TABLE' as const, id: `iceberg.${schema}.orders` },
  ];

  it('denies another database before consulting catalog grants', async () => {
    const repository = { authorizeCatalog: jest.fn() } as unknown as AdministrationRepository;
    const context = {
      require: () => ({
        organizationId: 'org-a',
        identityId: 'user-a',
        organizationStatus: 'ACTIVE',
        role: 'ORG_OWNER',
        mfaRequired: false,
        mfaVerified: false,
        agentName: 'chat-assistant',
        agentRunId: 'run-a',
        requestId: 'request-a',
        agentRunScope: { catalog: 'iceberg', schema: 'selected' },
      }),
    } as unknown as AuthenticatedContextStore;
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const useCases = new AdministrationUseCases(
      repository,
      context,
      {} as IdentityAdministrationService,
      audit,
    );
    await expect(useCases.authorizeCatalog('SELECT', hierarchy('other'))).resolves.toMatchObject({
      allowed: false,
      reason: 'RUN_SCOPE_DENIED',
    });
    expect(repository.authorizeCatalog).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-a',
        resourceId: 'iceberg.other.orders',
        outcome: 'FAILED',
        metadata: expect.objectContaining({ reason: 'RUN_SCOPE_DENIED', runId: 'run-a' }),
      }),
    );
  });

  it('allows the selected database to reach the existing user-and-Agent grant intersection', async () => {
    const repository = {
      authorizeCatalog: jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'EXPLICIT_ALLOW',
        matchedGrantIds: ['user', 'agent'],
      }),
    } as unknown as AdministrationRepository;
    const context = {
      require: () => ({
        organizationId: 'org-a',
        identityId: 'user-a',
        organizationStatus: 'ACTIVE',
        role: 'ORG_OWNER',
        mfaRequired: false,
        mfaVerified: false,
        agentName: 'chat-assistant',
        agentRunId: 'run-a',
        requestId: 'request-a',
        agentRunScope: { catalog: 'iceberg', schema: 'selected' },
      }),
    } as unknown as AuthenticatedContextStore;
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const useCases = new AdministrationUseCases(
      repository,
      context,
      {} as IdentityAdministrationService,
      audit,
    );
    await expect(useCases.authorizeCatalog('SELECT', hierarchy('selected'))).resolves.toMatchObject(
      {
        allowed: true,
      },
    );
    expect(repository.authorizeCatalog).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-a',
        resourceId: 'iceberg.selected.orders',
        outcome: 'SUCCEEDED',
        metadata: expect.objectContaining({ reason: 'EXPLICIT_ALLOW', runId: 'run-a' }),
      }),
    );
  });

  it('denies the same schema name in another catalog', async () => {
    const repository = { authorizeCatalog: jest.fn() } as unknown as AdministrationRepository;
    const context = {
      require: () => ({
        organizationId: 'org-a',
        identityId: 'user-a',
        organizationStatus: 'ACTIVE',
        role: 'ORG_OWNER',
        mfaRequired: false,
        mfaVerified: false,
        agentName: 'chat-assistant',
        agentRunId: 'run-a',
        requestId: 'request-a',
        agentRunScope: { catalog: 'iceberg', schema: 'selected' },
      }),
    } as unknown as AuthenticatedContextStore;
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const useCases = new AdministrationUseCases(
      repository,
      context,
      {} as IdentityAdministrationService,
      audit,
    );
    await expect(
      useCases.authorizeCatalog('SELECT', [
        { type: 'CATALOG', id: 'other' },
        { type: 'SCHEMA', id: 'other.selected' },
        { type: 'TABLE', id: 'other.selected.orders' },
      ]),
    ).resolves.toMatchObject({ allowed: false, reason: 'RUN_SCOPE_DENIED' });
    expect(repository.authorizeCatalog).not.toHaveBeenCalled();
  });

  it('fails closed when a delegated catalog decision cannot be audited', async () => {
    const repository = {
      authorizeCatalog: jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'EXPLICIT_ALLOW',
        matchedGrantIds: ['user', 'agent'],
      }),
    } as unknown as AdministrationRepository;
    const context = {
      require: () => ({
        organizationId: 'org-a',
        identityId: 'user-a',
        organizationStatus: 'ACTIVE',
        role: 'ORG_OWNER',
        mfaRequired: false,
        mfaVerified: false,
        agentName: 'chat-assistant',
        agentRunId: 'run-a',
        requestId: 'request-a',
        agentRunScope: { catalog: 'iceberg', schema: 'selected' },
      }),
    } as unknown as AuthenticatedContextStore;
    const audit = { write: jest.fn().mockRejectedValue(new Error('audit unavailable')) };
    const useCases = new AdministrationUseCases(
      repository,
      context,
      {} as IdentityAdministrationService,
      audit,
    );

    await expect(useCases.authorizeCatalog('SELECT', hierarchy('selected'))).rejects.toThrow(
      'audit unavailable',
    );
    expect(audit.write).toHaveBeenCalledTimes(1);
  });
});
