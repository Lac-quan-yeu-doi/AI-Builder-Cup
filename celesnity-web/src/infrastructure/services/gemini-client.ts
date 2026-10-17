import 'server-only';

import { FileState, GoogleGenAI, type Part } from '@google/genai';
import { z } from 'zod';

/*
 * Shared Gemini access for server routes. The SDK reads its own environment:
 * GEMINI_API_KEY for the Gemini API (video through the Files API), or
 * GOOGLE_GENAI_USE_VERTEXAI with GOOGLE_CLOUD_PROJECT for Vertex AI.
 */

const POLL_MS = 2_000;
const MAX_WAIT_MS = 180_000;

let client: GoogleGenAI | undefined;
export const gemini = () => (client ??= new GoogleGenAI({}));

export class GeminiAnswerError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GeminiAnswerError';
  }
}

export function isGeminiConfigured(): boolean {
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI?.toLowerCase() === 'true') {
    return Boolean(process.env.GOOGLE_CLOUD_PROJECT);
  }
  return Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY);
}

export function geminiModel(): string {
  return process.env.GEMINI_WALKTHROUGH_MODEL ?? 'gemini-flash-latest';
}

/**
 * The Files API needs a few seconds of processing per minute of video before
 * the file can be read. Vertex AI takes a gs:// URI instead, which this
 * prototype does not upload yet.
 */
export async function uploadVideo(video: Blob, signal?: AbortSignal): Promise<Part> {
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI?.toLowerCase() === 'true') {
    throw new GeminiAnswerError('Vertex AI needs the video in Cloud Storage first.');
  }
  const ai = gemini();
  let file = await ai.files.upload({ file: video, config: { mimeType: video.type } });
  const deadline = Date.now() + MAX_WAIT_MS;
  while (file.state === FileState.PROCESSING) {
    if (signal?.aborted === true) throw new GeminiAnswerError('Upload cancelled.');
    if (Date.now() > deadline) {
      throw new GeminiAnswerError('Gemini took too long to process the video.');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    if (file.name === undefined) break;
    file = await ai.files.get({ name: file.name });
  }
  if (file.state !== FileState.ACTIVE || file.uri === undefined) {
    throw new GeminiAnswerError(
      `Gemini could not read the video (${file.state ?? 'unknown state'}).`,
    );
  }
  return { fileData: { fileUri: file.uri, mimeType: file.mimeType ?? video.type } };
}

export async function imagePart(image: Blob): Promise<Part> {
  const data = Buffer.from(await image.arrayBuffer()).toString('base64');
  return { inlineData: { data, mimeType: image.type } };
}

export interface JsonAnswer<T> {
  readonly value: T;
  readonly model: string;
  readonly elapsedMs: number;
  readonly inputTokens?: number;
}

/**
 * Asks Gemini for JSON that must match `schema`. Gemini rejects the
 * `$schema` keyword, so it is dropped from zod's output; the answer is parsed
 * again here because structured output narrows the shape, not the meaning.
 */
export async function generateJson<T>(
  schema: z.ZodType<T>,
  parts: Part[],
  options: { readonly signal?: AbortSignal; readonly temperature?: number } = {},
): Promise<JsonAnswer<T>> {
  const model = geminiModel();
  const started = Date.now();
  const responseJsonSchema: Record<string, unknown> = {
    ...(z.toJSONSchema(schema) as Record<string, unknown>),
  };
  delete responseJsonSchema.$schema;
  const response = await gemini().models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: 16_384,
      abortSignal: options.signal,
    },
  });
  const text = response.text;
  if (text === undefined || text.trim() === '') {
    const reason = response.candidates?.[0]?.finishReason ?? 'no answer';
    throw new GeminiAnswerError(`Gemini returned nothing (${reason}).`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    throw new GeminiAnswerError('Gemini returned text that is not JSON.', { cause: error });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new GeminiAnswerError(
      `Gemini's answer does not match the schema: ${z.prettifyError(parsed.error)}`,
    );
  }
  return {
    value: parsed.data,
    model,
    elapsedMs: Date.now() - started,
    inputTokens: response.usageMetadata?.promptTokenCount,
  };
}
