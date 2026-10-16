import type { CreateNamespaceUseCase } from '@/src/application/use-cases/catalog/create-namespace.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentNamespace } from '@/src/interface-adapters/presenters/catalog.presenter';
import { z } from 'zod';

const inputSchema = z.object({
  catalog: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9_]+$/u),
  description: z.string().trim().max(1000).optional(),
});

export type CreateNamespaceController = ReturnType<typeof createCreateNamespaceController>;

export const createCreateNamespaceController =
  (useCase: CreateNamespaceUseCase) =>
  async (catalog: string, name: string, description?: string) => {
    const parsed = inputSchema.safeParse({ catalog, name, description });
    if (!parsed.success) {
      throw new InputParseError('Invalid database name', { cause: parsed.error });
    }
    return presentNamespace(
      await useCase(
        parsed.data.catalog,
        parsed.data.name,
        parsed.data.description === '' ? undefined : parsed.data.description,
      ),
    );
  };
