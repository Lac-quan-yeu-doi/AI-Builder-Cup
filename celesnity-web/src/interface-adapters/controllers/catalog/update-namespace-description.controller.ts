import type { UpdateNamespaceDescriptionUseCase } from '@/src/application/use-cases/catalog/update-namespace-description.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentNamespace } from '@/src/interface-adapters/presenters/catalog.presenter';
import { z } from 'zod';

const inputSchema = z.object({
  catalog: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().trim().max(1000).optional(),
});

export type UpdateNamespaceDescriptionController = ReturnType<
  typeof createUpdateNamespaceDescriptionController
>;

export const createUpdateNamespaceDescriptionController =
  (useCase: UpdateNamespaceDescriptionUseCase) =>
  async (catalog: string, name: string, description?: string) => {
    const parsed = inputSchema.safeParse({ catalog, name, description });
    if (!parsed.success) {
      throw new InputParseError('Invalid database description', { cause: parsed.error });
    }
    return presentNamespace(
      await useCase(
        parsed.data.catalog,
        parsed.data.name,
        parsed.data.description === '' ? undefined : parsed.data.description,
      ),
    );
  };
