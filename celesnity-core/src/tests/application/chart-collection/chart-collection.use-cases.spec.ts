import { ChartCollectionUseCases } from '@application/chart-collection/chart-collection.use-cases';
import { CollectionAuthorizationService } from '@application/chart-collection/collection-authorization.service';
import type { AuditWriter } from '@application/administration/audit-writer';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';

const principal = {
  organizationId: 'org-1',
  identityId: 'user-1',
  isOrganizationAdmin: false,
};

function authorizationFor(
  repository: ConstructorParameters<typeof CollectionAuthorizationService>[0],
): CollectionAuthorizationService {
  const audit = { write: jest.fn().mockResolvedValue(undefined) } as AuditWriter;
  const contexts = {
    require: () => ({
      organizationId: principal.organizationId,
      identityId: principal.identityId,
      role: 'ORG_ADMIN',
      requestId: 'request-test',
    }),
  } as unknown as AuthenticatedContextStore;
  return new CollectionAuthorizationService(repository, audit, contexts);
}

describe('ChartCollectionUseCases', () => {
  it('ensures the signed-in user has a personal collection before listing collections', async () => {
    const personalCollection = {
      id: 'personal-1',
      organizationId: 'org-1',
      parentId: 'root-1',
      ownerIdentityId: 'user-1',
      type: 'PERSONAL' as const,
      name: 'Personal',
      archivedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const repository = {
      create: jest.fn(),
      ensurePersonalCollection: jest.fn().mockResolvedValue(personalCollection),
      effectiveAccess: jest.fn(),
      findById: jest.fn(),
      list: jest.fn().mockResolvedValue([personalCollection]),
      move: jest.fn(),
      rename: jest.fn(),
      archive: jest.fn(),
      setGrant: jest.fn(),
    };
    const authorization = authorizationFor(repository);
    jest.spyOn(authorization, 'requireAccess').mockResolvedValue('CURATE');
    const useCases = new ChartCollectionUseCases(repository, authorization);

    await expect(useCases.listCollections(principal)).resolves.toEqual([personalCollection]);

    expect(repository.ensurePersonalCollection).toHaveBeenCalledWith(principal);
    expect(repository.list).toHaveBeenCalledWith('org-1');
    expect(repository.ensurePersonalCollection.mock.invocationCallOrder[0]).toBeLessThan(
      repository.list.mock.invocationCallOrder[0]!,
    );
  });

  it('does not hide an audit failure as an empty collection list', async () => {
    const collection = {
      id: 'personal-1',
      organizationId: 'org-1',
      parentId: null,
      ownerIdentityId: 'user-1',
      type: 'PERSONAL' as const,
      name: 'Personal',
      archivedAt: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    };
    const repository = {
      ensurePersonalCollection: jest.fn().mockResolvedValue(collection),
      list: jest.fn().mockResolvedValue([collection]),
    } as unknown as ConstructorParameters<typeof ChartCollectionUseCases>[0];
    const authorization = authorizationFor(repository);
    jest.spyOn(authorization, 'requireAccess').mockRejectedValue(new Error('audit unavailable'));

    await expect(
      new ChartCollectionUseCases(repository, authorization).listCollections(principal),
    ).rejects.toThrow('audit unavailable');
  });

  it('rejects an unverified collection actor before listing or creating personal data', async () => {
    const list = jest.fn();
    const repository = {
      ensurePersonalCollection: jest.fn(),
      list,
    } as unknown as ConstructorParameters<typeof ChartCollectionUseCases>[0];
    const authorization = authorizationFor(repository);
    jest.spyOn(authorization, 'requireActor').mockRejectedValue(new Error('actor mismatch'));

    await expect(
      new ChartCollectionUseCases(repository, authorization).listCollections(principal),
    ).rejects.toThrow('actor mismatch');
    expect(repository.ensurePersonalCollection).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("filters another user's personal collection from an administrator's list", async () => {
    const ownPersonal = {
      id: 'personal-1',
      organizationId: 'org-1',
      parentId: null,
      ownerIdentityId: 'user-1',
      type: 'PERSONAL' as const,
      name: 'Personal',
      archivedAt: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    };
    const otherPersonal = {
      ...ownPersonal,
      id: 'personal-2',
      ownerIdentityId: 'user-2',
    };
    const repository = {
      create: jest.fn(),
      ensurePersonalCollection: jest.fn().mockResolvedValue(ownPersonal),
      effectiveAccess: jest.fn(),
      findById: jest
        .fn()
        .mockImplementation((_organizationId: string, collectionId: string) =>
          Promise.resolve(collectionId === ownPersonal.id ? ownPersonal : otherPersonal),
        ),
      list: jest.fn().mockResolvedValue([ownPersonal, otherPersonal]),
      move: jest.fn(),
      rename: jest.fn(),
      archive: jest.fn(),
      setGrant: jest.fn(),
    };
    const authorization = authorizationFor(repository);
    const useCases = new ChartCollectionUseCases(repository, authorization);

    await expect(
      useCases.listCollections({ ...principal, isOrganizationAdmin: true }),
    ).resolves.toEqual([ownPersonal]);
  });

  it('requires curate access on a parent before creating a shared collection', async () => {
    const repository = {
      create: jest.fn(),
      ensurePersonalCollection: jest.fn(),
      effectiveAccess: jest.fn(),
      findById: jest.fn(),
      move: jest.fn(),
      rename: jest.fn(),
      archive: jest.fn(),
      setGrant: jest.fn(),
    };
    const authorization = authorizationFor(repository);
    jest.spyOn(authorization, 'requireAccess').mockRejectedValue(new Error('denied'));
    const useCases = new ChartCollectionUseCases(repository, authorization);

    await expect(
      useCases.createCollection(
        {
          organizationId: 'org-1',
          parentId: 'root-1',
          ownerIdentityId: null,
          type: 'COLLECTION',
          name: 'Shared',
        },
        principal,
      ),
    ).rejects.toThrow('denied');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('does not allow a non-admin to create a top-level shared collection', async () => {
    const repository = {
      create: jest.fn(),
      ensurePersonalCollection: jest.fn(),
      effectiveAccess: jest.fn(),
      findById: jest.fn(),
      move: jest.fn(),
      rename: jest.fn(),
      archive: jest.fn(),
      setGrant: jest.fn(),
    };
    const authorization = authorizationFor(repository);
    const useCases = new ChartCollectionUseCases(repository, authorization);

    await expect(
      useCases.createCollection(
        {
          organizationId: 'org-1',
          parentId: null,
          ownerIdentityId: null,
          type: 'COLLECTION',
          name: 'Shared',
        },
        principal,
      ),
    ).rejects.toMatchObject({ code: 'COLLECTION_ACCESS_DENIED' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('renames a curated shared collection', async () => {
    const repository = {
      create: jest.fn(),
      ensurePersonalCollection: jest.fn(),
      effectiveAccess: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'collection-1',
        organizationId: 'org-1',
        parentId: null,
        ownerIdentityId: null,
        type: 'COLLECTION',
        name: 'Old name',
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      move: jest.fn(),
      rename: jest.fn().mockResolvedValue({ id: 'collection-1', name: 'New name' }),
      archive: jest.fn(),
      setGrant: jest.fn(),
    };
    const authorization = authorizationFor(repository);
    jest.spyOn(authorization, 'requireAccess').mockResolvedValue('CURATE');
    const useCases = new ChartCollectionUseCases(repository, authorization);

    await useCases.renameCollection(
      { collectionId: 'collection-1', organizationId: 'org-1', name: '  New name  ' },
      principal,
    );

    expect(repository.rename).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: 'collection-1', name: 'New name' }),
    );
  });

  it('archives only curated shared collections', async () => {
    const repository = {
      create: jest.fn(),
      ensurePersonalCollection: jest.fn(),
      effectiveAccess: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'collection-1',
        organizationId: 'org-1',
        parentId: null,
        ownerIdentityId: null,
        type: 'COLLECTION',
        name: 'Shared',
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      move: jest.fn(),
      rename: jest.fn(),
      archive: jest.fn(),
      setGrant: jest.fn(),
    };
    const authorization = authorizationFor(repository);
    jest.spyOn(authorization, 'requireAccess').mockResolvedValue('CURATE');
    const useCases = new ChartCollectionUseCases(repository, authorization);

    await useCases.archiveCollection(
      { collectionId: 'collection-1', organizationId: 'org-1' },
      principal,
    );

    expect(repository.archive).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: 'collection-1', archivedAt: expect.any(String) }),
    );
  });
});
