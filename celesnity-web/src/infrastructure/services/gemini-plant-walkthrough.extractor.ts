import 'server-only';

import { PlantDraftValidationError } from '@/src/entities/errors/application-errors';
import {
  walkthroughObservationSchema,
  walkthroughToTwin,
  type PlantWalkthroughResult,
} from '@/src/entities/models/plant-walkthrough';

import { GeminiAnswerError, generateJson, uploadVideo } from './gemini-client';
import { PLANT_WALKTHROUGH_PROMPT } from './gemini-plant-walkthrough.prompt';

/** Watches a walkthrough video and returns a twin whose draft passes Core's rules. */
export async function extractPlantWalkthrough(
  video: Blob,
  signal?: AbortSignal,
): Promise<PlantWalkthroughResult> {
  const file = await uploadVideo(video, signal);
  const answer = await generateJson(
    walkthroughObservationSchema,
    [file, { text: PLANT_WALKTHROUGH_PROMPT }],
    { signal },
  );
  try {
    return {
      twin: walkthroughToTwin(answer.value),
      model: answer.model,
      elapsedMs: answer.elapsedMs,
      inputTokens: answer.inputTokens,
    };
  } catch (error: unknown) {
    if (error instanceof PlantDraftValidationError) {
      throw new GeminiAnswerError(error.message, { cause: error });
    }
    throw error;
  }
}
