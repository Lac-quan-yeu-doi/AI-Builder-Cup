import { CollectionAuthorizationService } from '@application/chart-collection/collection-authorization.service';
import type { IChartCollectionRepository } from '@application/chart-collection/interfaces/i-chart-collection.repository';
import type { AuditWriter } from '@application/administration/audit-writer';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';

describe('CollectionAuthorizationService', () => {
  it('records versioned allow and deny decisions with the same request ID', async () => {
    const collection = {
      id: 'shared-id',
      organizationId: 'organization-id',
      parentId: null,
      ownerIdentityId: null,
      type: 'COLLECTION' as const,
      name: 'Shared',
      archivedAt: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    };
    const repository = {
      findById: jest.fn().mockResolvedValue(collection),
      effectiveAccess: jest.fn().mockResolvedValue('VIEW'),
    } as unknown as IChartCollectionRepository;
    const write = jest.fn().mockResolvedValue(undefined);
    const audit = { write } as AuditWriter;
    const contexts = {
      require: () => ({
        organizationId: 'organization-id',
        identityId: 'identity-id',
        requestId: 'request-1',
        sessionId: 'session-1',
      }),
    } as unknown as AuthenticatedContextStore;
    const service = new CollectionAuthorizationService(repository, audit, contexts);
    const principal = {
      organizationId: 'organization-id',
      identityId: 'identity-id',
      isOrganizationAdmin: false,
    };

    await expect(service.requireAccess('shared-id', principal, 'VIEW')).resolves.toBe('VIEW');
    await expect(service.requireAccess('shared-id', principal, 'CURATE')).rejects.toMatchObject({
      code: 'COLLECTION_ACCESS_DENIED',
    });
    expect(write).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        requestId: 'request-1',
        actorIdentityId: 'identity-id',
        eventType: 'AUTHORIZATION_DECISION',
        action: 'collection:VIEW',
        outcome: 'SUCCEEDED',
        metadata: expect.objectContaining({ contractVersion: 1, allowed: true }),
      }),
    );
    expect(write).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        requestId: 'request-1',
        eventType: 'AUTHORIZATION_DECISION',
        action: 'collection:CURATE',
        outcome: 'FAILED',
        metadata: expect.objectContaining({
          contractVersion: 1,
          allowed: false,
          reason: 'COLLECTION_ACCESS_DENIED',
        }),
      }),
    );
  });

  it('fails closed when an allowed collection decision cannot be audited', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({
        id: 'personal-id',
        organizationId: 'organization-id',
        ownerIdentityId: 'identity-id',
        type: 'PERSONAL',
      }),
      effectiveAccess: jest.fn(),
    } as unknown as IChartCollectionRepository;
    const auditError = new Error('audit unavailable');
    const audit = { write: jest.fn().mockRejectedValue(auditError) } as AuditWriter;
    const contexts = {
      require: () => ({
        organizationId: 'organization-id',
        identityId: 'identity-id',
        requestId: 'request-2',
      }),
    } as unknown as AuthenticatedContextStore;
    const service = new CollectionAuthorizationService(repository, audit, contexts);

    await expect(
      service.requireAccess(
        'personal-id',
        {
          organizationId: 'organization-id',
          identityId: 'identity-id',
          isOrganizationAdmin: false,
        },
        'VIEW',
      ),
    ).rejects.toBe(auditError);
    expect(repository.effectiveAccess).not.toHaveBeenCalled();
  });

  it('denies a principal that does not match the verified request actor before repository access', async () => {
    const repository = { findById: jest.fn() } as unknown as IChartCollectionRepository;
    const write = jest.fn().mockResolvedValue(undefined);
    const contexts = {
      require: () => ({
        organizationId: 'organization-id',
        identityId: 'real-user',
        requestId: 'request-3',
      }),
    } as unknown as AuthenticatedContextStore;
    const service = new CollectionAuthorizationService(repository, { write }, contexts);

    await expect(
      service.requireAccess(
        'collection-id',
        {
          organizationId: 'organization-id',
          identityId: 'other-user',
          isOrganizationAdmin: true,
        },
        'CURATE',
      ),
    ).rejects.toMatchObject({ code: 'COLLECTION_ACCESS_DENIED' });
    expect(repository.findById).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-3',
        metadata: expect.objectContaining({ reason: 'ACTOR_MISMATCH' }),
      }),
    );
  });

  it('audits top-level collection creation without granting it to a non-admin', async () => {
    const repository = { findById: jest.fn() } as unknown as IChartCollectionRepository;
    const write = jest.fn().mockResolvedValue(undefined);
    const contexts = {
      require: () => ({
        organizationId: 'organization-id',
        identityId: 'identity-id',
        role: 'ORG_ADMIN',
        requestId: 'request-4',
      }),
    } as unknown as AuthenticatedContextStore;
    const service = new CollectionAuthorizationService(repository, { write }, contexts);
    const principal = {
      organizationId: 'organization-id',
      identityId: 'identity-id',
      isOrganizationAdmin: false,
    };

    await expect(service.requireTopLevelCreate(principal)).rejects.toMatchObject({
      code: 'COLLECTION_ACCESS_DENIED',
    });
    await expect(
      service.requireTopLevelCreate({ ...principal, isOrganizationAdmin: true }),
    ).resolves.toBeUndefined();
    expect(write).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'collection:CREATE_ROOT',
        outcome: 'FAILED',
        requestId: 'request-4',
      }),
    );
    expect(write).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: 'collection:CREATE_ROOT',
        outcome: 'SUCCEEDED',
        requestId: 'request-4',
      }),
    );
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('does not trust an admin flag that disagrees with the verified role', async () => {
    const repository = { findById: jest.fn() } as unknown as IChartCollectionRepository;
    const write = jest.fn().mockResolvedValue(undefined);
    const contexts = {
      require: () => ({
        organizationId: 'organization-id',
        identityId: 'identity-id',
        role: 'VIEWER',
        requestId: 'request-5',
      }),
    } as unknown as AuthenticatedContextStore;
    const service = new CollectionAuthorizationService(repository, { write }, contexts);

    await expect(
      service.requireAccess(
        'shared-id',
        {
          organizationId: 'organization-id',
          identityId: 'identity-id',
          isOrganizationAdmin: true,
        },
        'CURATE',
      ),
    ).rejects.toMatchObject({ code: 'COLLECTION_ACCESS_DENIED' });
    expect(repository.findById).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: 'ACTOR_MISMATCH' }),
      }),
    );
  });

  it('gives a personal collection owner curate access without a group lookup', async () => {
    const repository: IChartCollectionRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'personal-id',
        organizationId: 'organization-id',
        parentId: null,
        ownerIdentityId: 'identity-id',
        type: 'PERSONAL',
        name: 'Personal',
        archivedAt: null,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      }),
      ensurePersonalCollection: jest.fn(),
      effectiveAccess: jest.fn(),
      create: jest.fn(),
      move: jest.fn(),
      rename: jest.fn(),
      archive: jest.fn(),
      setGrant: jest.fn(),
    };
    const service = serviceFor(repository, 'identity-id');

    await expect(
      service.requireAccess(
        'personal-id',
        {
          organizationId: 'organization-id',
          identityId: 'identity-id',
          isOrganizationAdmin: false,
        },
        'CURATE',
      ),
    ).resolves.toBe('CURATE');
  });

  it("does not expose another user's personal collection to an organization administrator", async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({
        id: 'other-personal-id',
        organizationId: 'organization-id',
        parentId: null,
        ownerIdentityId: 'other-identity-id',
        type: 'PERSONAL' as const,
        name: 'Personal',
        archivedAt: null,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      }),
      ensurePersonalCollection: jest.fn(),
      effectiveAccess: jest.fn(),
      create: jest.fn(),
      move: jest.fn(),
      rename: jest.fn(),
      archive: jest.fn(),
      setGrant: jest.fn(),
    };
    const service = serviceFor(repository, 'admin-identity-id');

    await expect(
      service.requireAccess(
        'other-personal-id',
        {
          organizationId: 'organization-id',
          identityId: 'admin-identity-id',
          isOrganizationAdmin: true,
        },
        'VIEW',
      ),
    ).rejects.toMatchObject({ code: 'COLLECTION_ACCESS_DENIED' });
    expect(repository.effectiveAccess).not.toHaveBeenCalled();
  });

  it('keeps organization administrator curate access to shared collections', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({
        id: 'shared-id',
        organizationId: 'organization-id',
        parentId: null,
        ownerIdentityId: null,
        type: 'COLLECTION' as const,
        name: 'Shared',
        archivedAt: null,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      }),
      ensurePersonalCollection: jest.fn(),
      effectiveAccess: jest.fn(),
      create: jest.fn(),
      move: jest.fn(),
      rename: jest.fn(),
      archive: jest.fn(),
      setGrant: jest.fn(),
    };
    const service = serviceFor(repository, 'admin-identity-id');

    await expect(
      service.requireAccess(
        'shared-id',
        {
          organizationId: 'organization-id',
          identityId: 'admin-identity-id',
          isOrganizationAdmin: true,
        },
        'CURATE',
      ),
    ).resolves.toBe('CURATE');
  });
});

function serviceFor(
  repository: IChartCollectionRepository,
  identityId: string,
): CollectionAuthorizationService {
  const audit = { write: jest.fn().mockResolvedValue(undefined) } as AuditWriter;
  const contexts = {
    require: () => ({
      organizationId: 'organization-id',
      identityId,
      role: 'ORG_ADMIN',
      requestId: 'request-test',
    }),
  } as unknown as AuthenticatedContextStore;
  return new CollectionAuthorizationService(repository, audit, contexts);
}
