import type { PlantWalkthroughResult } from '@/src/entities/models/plant-walkthrough';

/** Turns a walkthrough video of a plant floor into a plant model draft. */
export interface PlantWalkthroughService {
  extract(video: Blob, fileName: string, signal?: AbortSignal): Promise<PlantWalkthroughResult>;
}
