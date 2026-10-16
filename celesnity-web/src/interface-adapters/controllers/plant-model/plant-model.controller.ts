import { z } from 'zod';
import type { PlantModelUseCases } from '@/src/application/use-cases/plant-model/manage-plant-model.use-cases';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type {
  PlantCatalogBinding,
  PlantModelDraft,
  PlantPropertyValue,
} from '@/src/entities/models/plant-model';

const id = z.string().uuid();
const create = z.object({
  name: z.string().trim().min(1).max(160),
  code: z
    .string()
    .regex(/^[A-Za-z0-9_]+$/u)
    .max(120),
});
const revision = z.number().int().min(1);
const dashboardAssociation = z.object({
  role: z.enum(['overview', 'operations', 'quality', 'maintenance', 'custom']),
  displayOrder: z.number().int().min(0),
  isDefault: z.boolean(),
});

export const createPlantModelController = (useCases: PlantModelUseCases) => ({
  listSites: () => useCases.listSites(),
  createSite: (input: unknown) => useCases.createSite(parse(create, input)),
  get: (siteId: unknown) => useCases.get(parse(id, siteId)),
  save: (siteId: unknown, draft: PlantModelDraft, expectedRevision: unknown) =>
    useCases.save(parse(id, siteId), draft, parse(revision, expectedRevision)),
  listTemplates: () => useCases.listTemplates(),
  applyTemplate: (siteId: unknown, templateId: unknown, expectedRevision: unknown) =>
    useCases.applyTemplate(
      parse(id, siteId),
      parse(z.string().min(1).max(120), templateId),
      parse(revision, expectedRevision),
    ),
  publish: (siteId: unknown, expectedRevision: unknown, note?: unknown) =>
    useCases.publish(
      parse(id, siteId),
      parse(revision, expectedRevision),
      note === undefined ? undefined : parse(z.string().trim().max(400), note),
    ),
  listVersions: (siteId: unknown) => useCases.listVersions(parse(id, siteId)),
  diffVersions: (siteId: unknown, from: unknown, to: unknown) =>
    useCases.diffVersions(parse(id, siteId), parse(revision, from), parse(revision, to)),
  resolveCatalog: (
    binding: PlantCatalogBinding,
    values: Readonly<Record<string, PlantPropertyValue>>,
  ) => useCases.resolveCatalog(binding, values),
  listDashboards: (siteId: unknown) => useCases.listDashboards(parse(id, siteId)),
  associateDashboard: (siteId: unknown, dashboardId: unknown, input: unknown) =>
    useCases.associateDashboard(
      parse(id, siteId),
      parse(id, dashboardId),
      parse(dashboardAssociation, input),
    ),
  removeDashboard: (siteId: unknown, dashboardId: unknown) =>
    useCases.removeDashboard(parse(id, siteId), parse(id, dashboardId)),
});
export type PlantModelController = ReturnType<typeof createPlantModelController>;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new InputParseError('Invalid plant model input.', { cause: result.error });
  return result.data;
}
