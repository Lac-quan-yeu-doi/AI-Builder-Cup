import { z } from 'zod';
import type { PlantWalkthroughUseCases } from '@/src/application/use-cases/plant-model/plant-walkthrough.use-cases';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { validatePlantDraft } from '@/src/entities/models/plant-draft-validator';
import type { PlantModelDraft } from '@/src/entities/models/plant-model';

const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
const create = z.object({
  name: z.string().trim().min(1).max(160),
  code: z
    .string()
    .regex(/^[A-Za-z0-9_]+$/u)
    .max(120),
});

export const createPlantWalkthroughController = (useCases: PlantWalkthroughUseCases) => ({
  extract: (video: unknown, signal?: AbortSignal) => {
    if (!(video instanceof File)) throw new InputParseError('Choose a video file.');
    if (!video.type.startsWith('video/')) throw new InputParseError('The file is not a video.');
    if (video.size > MAX_VIDEO_BYTES) throw new InputParseError('The video is larger than 2 GB.');
    return useCases.extract(video, video.name, signal);
  },
  createPlant: (input: unknown, draft: PlantModelDraft) => {
    const parsed = create.safeParse(input);
    if (!parsed.success) throw new InputParseError(parsed.error.message, { cause: parsed.error });
    validatePlantDraft(draft);
    return useCases.createPlant(parsed.data, draft);
  },
});
export type PlantWalkthroughController = ReturnType<typeof createPlantWalkthroughController>;
