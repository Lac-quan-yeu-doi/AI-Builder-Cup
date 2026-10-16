import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { PrismaDocumentRepository } from '@infrastructure/prisma/document/prisma-document.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import { backgroundPrincipal } from '../../../application/administration/background-principal.fixture';

describe('Document organization boundary', () => {
  const contexts = new AuthenticatedContextStore();
  contexts.configureBackgroundResolver(async (org) => backgroundPrincipal(org));
  function setup() {
    const document = {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    };
    const repository = new PrismaDocumentRepository(
      { client: { document } } as unknown as PrismaService,
      contexts,
    );
    return { document, repository };
  }

  it('requires context even when Prisma has a default organization', async () => {
    const { document, repository } = setup();
    await expect(repository.list()).rejects.toThrow(
      'Authenticated organization context is required',
    );
    await expect(repository.findById('foreign-id')).rejects.toThrow(
      'Authenticated organization context is required',
    );
    expect(document.findFirst).not.toHaveBeenCalled();
    expect(document.findMany).not.toHaveBeenCalled();
  });

  it('scopes IDs and lists to the calling organization, excluding legacy unowned rows', async () => {
    const { document, repository } = setup();
    await contexts.runBackground(
      'org-a',
      async () => {
        await expect(repository.findById('foreign-id')).resolves.toBeNull();
        await repository.list();
      },
      'DOCUMENTS',
    );
    expect(document.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-id', organizationId: 'org-a' },
    });
    expect(document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a' } }),
    );
  });

  it('does not use a foreign cursor for pagination', async () => {
    const { document, repository } = setup();
    await expect(
      contexts.runBackground('org-a', () => repository.list('foreign-id'), 'DOCUMENTS'),
    ).resolves.toEqual([]);
    expect(document.findMany).not.toHaveBeenCalled();
  });
});
