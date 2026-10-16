import 'server-only';

import { FileState, GoogleGenAI } from '@google/genai';
import { z } from 'zod';

import { PlantDraftValidationError } from '@/src/entities/errors/application-errors';
import {
  walkthroughObservationSchema,
  walkthroughToTwin,
  type PlantWalkthroughResult,
} from '@/src/entities/models/plant-walkthrough';

import { PLANT_WALKTHROUGH_PROMPT } from './gemini-plant-walkthrough.prompt';

/*
 * Server side of plant walkthroughs. The SDK reads its own environment:
 * GEMINI_API_KEY for the Gemini API (video through the Files API), or
 * GOOGLE_GENAI_USE_VERTEXAI with GOOGLE_CLOUD_PROJECT for Vertex AI.
 */

const POLL_MS = 2_000;
const MAX_WAIT_MS = 180_000;

let client: GoogleGenAI | undefined;
const gemini = () => (client ??= new GoogleGenAI({}));

export class WalkthroughExtractionError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WalkthroughExtractionError';
  }
}

export function isGeminiConfigured(): boolean {
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI?.toLowerCase() === 'true') {
    return Boolean(process.env.GOOGLE_CLOUD_PROJECT);
  }
  return Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY);
}

// Gemini rejects the `$schema` keyword, so it is dropped from zod's output.
const responseJsonSchema: Record<string, unknown> = {
  ...(z.toJSONSchema(walkthroughObservationSchema) as Record<string, unknown>),
};
delete responseJsonSchema.$schema;

/** Watches a walkthrough video and returns a twin whose draft passes Core's rules. */
export async function extractPlantWalkthrough(
  video: Blob,
  signal?: AbortSignal,
): Promise<PlantWalkthroughResult> {
  const model = process.env.GEMINI_WALKTHROUGH_MODEL ?? 'gemini-flash-latest';
  const started = Date.now();
  const file = await upload(video, signal);
  const response = await gemini().models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [{ fileData: file }, { text: PLANT_WALKTHROUGH_PROMPT }],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature: 0.2,
      maxOutputTokens: 16_384,
      abortSignal: signal,
    },
  });

  const text = response.text;
  if (text === undefined || text.trim() === '') {
    const reason = response.candidates?.[0]?.finishReason ?? 'no answer';
    throw new WalkthroughExtractionError(`Gemini returned nothing (${reason}).`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    throw new WalkthroughExtractionError('Gemini returned text that is not JSON.', {
      cause: error,
    });
  }
  const observation = walkthroughObservationSchema.safeParse(json);
  if (!observation.success) {
    throw new WalkthroughExtractionError(
      `Gemini's answer does not match the schema: ${z.prettifyError(observation.error)}`,
    );
  }
  try {
    return {
      twin: walkthroughToTwin(observation.data),
      model,
      elapsedMs: Date.now() - started,
      inputTokens: response.usageMetadata?.promptTokenCount,
    };
  } catch (error: unknown) {
    if (error instanceof PlantDraftValidationError) {
      throw new WalkthroughExtractionError(error.message, { cause: error });
    }
    throw error;
  }
}

/**
 * The Files API needs a few seconds of processing per minute of video before
 * the file can be read. Vertex AI takes a gs:// URI instead, which this
 * prototype does not upload yet.
 */
async function upload(
  video: Blob,
  signal?: AbortSignal,
): Promise<{ fileUri: string; mimeType: string }> {
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI?.toLowerCase() === 'true') {
    throw new WalkthroughExtractionError('Vertex AI needs the video in Cloud Storage first.');
  }
  const ai = gemini();
  let file = await ai.files.upload({ file: video, config: { mimeType: video.type } });
  const deadline = Date.now() + MAX_WAIT_MS;
  while (file.state === FileState.PROCESSING) {
    if (signal?.aborted === true) throw new WalkthroughExtractionError('Upload cancelled.');
    if (Date.now() > deadline) {
      throw new WalkthroughExtractionError('Gemini took too long to process the video.');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    if (file.name === undefined) break;
    file = await ai.files.get({ name: file.name });
  }
  if (file.state !== FileState.ACTIVE || file.uri === undefined) {
    throw new WalkthroughExtractionError(
      `Gemini could not read the video (${file.state ?? 'unknown state'}).`,
    );
  }
  return { fileUri: file.uri, mimeType: file.mimeType ?? video.type };
}
