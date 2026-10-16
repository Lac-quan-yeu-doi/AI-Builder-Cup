import type { PlantModelRepository } from '@/src/application/repositories/plant-model.repository.interface';
import type { PlantWalkthroughService } from '@/src/application/services/plant-walkthrough.service.interface';
import type { PlantModelDraft, PlantSite } from '@/src/entities/models/plant-model';

export const createPlantWalkthroughUseCases = (
  service: PlantWalkthroughService,
  repository: PlantModelRepository,
) => ({
  extract: (video: Blob, fileName: string, signal?: AbortSignal) =>
    service.extract(video, fileName, signal),
  /**
   * Core creates a site empty and takes its model separately, so a plant built
   * from a walkthrough is two calls: create, then save at the new revision.
   */
  createPlant: async (
    input: { readonly name: string; readonly code: string },
    draft: PlantModelDraft,
  ): Promise<PlantSite> => {
    const site = await repository.createSite(input);
    return repository.save(site.id, draft, site.revision);
  },
});
export type PlantWalkthroughUseCases = ReturnType<typeof createPlantWalkthroughUseCases>;
