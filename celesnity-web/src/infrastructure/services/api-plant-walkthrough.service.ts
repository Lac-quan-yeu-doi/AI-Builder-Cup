import type { PlantWalkthroughService } from '@/src/application/services/plant-walkthrough.service.interface';
import type { PlantWalkthroughResult } from '@/src/entities/models/plant-walkthrough';
import { CoreApiClient } from '@/src/infrastructure/api/core-api-client';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

/**
 * Sends the video to this app's own `/api/plant-walkthroughs` route, which
 * holds the Gemini credentials. The shared client adds the CSRF header and
 * leaves the multipart boundary to the browser.
 */
export class ApiPlantWalkthroughService implements PlantWalkthroughService {
  public constructor(
    private readonly transport: CoreApiClient = new CoreApiClient({ baseUrl: '/api' }),
  ) {}

  public async extract(
    video: Blob,
    fileName: string,
    signal?: AbortSignal,
  ): Promise<PlantWalkthroughResult> {
    const body = new FormData();
    body.set('video', video, fileName);
    try {
      return await this.transport.request<PlantWalkthroughResult>('/plant-walkthroughs', {
        method: 'POST',
        body,
        signal,
      });
    } catch (error: unknown) {
      throw translateCoreApiError(error);
    }
  }
}
