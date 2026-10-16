import { describe, expect, it, vi } from 'vitest';

import type { PlantWalkthroughUseCases } from '@/src/application/use-cases/plant-model/plant-walkthrough.use-cases';
import {
  InputParseError,
  PlantDraftValidationError,
} from '@/src/entities/errors/application-errors';
import { EMPTY_PLANT_DRAFT, type PlantModelDraft } from '@/src/entities/models/plant-model';
import { createPlantWalkthroughController } from '@/src/interface-adapters/controllers/plant-model/plant-walkthrough.controller';

const useCases = () =>
  ({ extract: vi.fn(), createPlant: vi.fn() }) as unknown as PlantWalkthroughUseCases;

describe('plant walkthrough controller', () => {
  it('only accepts a video file', () => {
    const controller = createPlantWalkthroughController(useCases());
    expect(() => controller.extract('walk.mp4')).toThrow(InputParseError);
    expect(() => controller.extract(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toThrow(
      InputParseError,
    );
  });

  it('passes a video through with its name', () => {
    const cases = useCases();
    const video = new File(['x'], 'walk.mp4', { type: 'video/mp4' });
    createPlantWalkthroughController(cases).extract(video);
    expect(cases.extract).toHaveBeenCalledWith(video, 'walk.mp4', undefined);
  });

  it('rejects a bad plant code and a draft Core would refuse', () => {
    const cases = useCases();
    const controller = createPlantWalkthroughController(cases);
    expect(() =>
      controller.createPlant({ name: 'Line', code: 'has space' }, EMPTY_PLANT_DRAFT),
    ).toThrow(InputParseError);
    const broken: PlantModelDraft = {
      nodeTypes: [],
      nodes: [
        {
          id: 'a',
          name: 'A',
          nodeTypeId: 'missing',
          routingRole: 'none',
          position: { x: 0, y: 0 },
          values: {},
          localProperties: [],
        },
      ],
      relationships: [],
    };
    expect(() => controller.createPlant({ name: 'Line', code: 'LINE' }, broken)).toThrow(
      PlantDraftValidationError,
    );
    expect(cases.createPlant).not.toHaveBeenCalled();
  });
});
