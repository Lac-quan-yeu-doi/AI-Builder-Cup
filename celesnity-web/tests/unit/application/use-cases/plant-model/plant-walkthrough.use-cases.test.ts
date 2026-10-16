import { describe, expect, it, vi } from 'vitest';

import type { PlantModelRepository } from '@/src/application/repositories/plant-model.repository.interface';
import type { PlantWalkthroughService } from '@/src/application/services/plant-walkthrough.service.interface';
import { createPlantWalkthroughUseCases } from '@/src/application/use-cases/plant-model/plant-walkthrough.use-cases';
import { EMPTY_PLANT_DRAFT, type PlantSite } from '@/src/entities/models/plant-model';

const site = (revision: number): PlantSite => ({
  id: 'site-1',
  name: 'Pellet line',
  code: 'PELLET',
  timezone: 'Asia/Ho_Chi_Minh',
  draft: EMPTY_PLANT_DRAFT,
  revision,
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
});

describe('plant walkthrough use cases', () => {
  it('creates the site, then saves the draft at the revision Core returned', async () => {
    const repository = {
      createSite: vi.fn().mockResolvedValue(site(1)),
      save: vi.fn().mockResolvedValue(site(2)),
    } as unknown as PlantModelRepository;
    const service = { extract: vi.fn() } as unknown as PlantWalkthroughService;
    const useCases = createPlantWalkthroughUseCases(service, repository);

    const saved = await useCases.createPlant(
      { name: 'Pellet line', code: 'PELLET' },
      EMPTY_PLANT_DRAFT,
    );

    expect(repository.createSite).toHaveBeenCalledWith({ name: 'Pellet line', code: 'PELLET' });
    expect(repository.save).toHaveBeenCalledWith('site-1', EMPTY_PLANT_DRAFT, 1);
    expect(saved.revision).toBe(2);
  });

  it('hands the video to the service', async () => {
    const extract = vi.fn().mockResolvedValue({ model: 'm' });
    const useCases = createPlantWalkthroughUseCases(
      { extract } as PlantWalkthroughService,
      {} as PlantModelRepository,
    );
    const video = new Blob(['x'], { type: 'video/mp4' });
    await useCases.extract(video, 'walk.mp4');
    expect(extract).toHaveBeenCalledWith(video, 'walk.mp4', undefined);
  });
});
