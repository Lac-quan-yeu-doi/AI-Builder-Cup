import { z } from 'zod';
import type { RepairGuideUseCases } from '@/src/application/use-cases/plant-model/repair-guide.use-cases';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { RepairGuide, RepairRun } from '@/src/entities/models/repair-guide';

const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
const id = z.string().min(1).max(120);
const name = z.string().trim().min(1).max(160);
const stepIndex = z.number().int().min(0);
const captureInput = z.object({
  siteId: id,
  machineId: id.optional(),
  machineName: name,
  faultName: name,
  expert: name,
  videoSeconds: z.number().positive().optional(),
});
const run = z.object({
  id: id,
  worker: name,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  outcome: z.enum(['fixed', 'not-fixed']),
  steps: z.array(
    z.object({
      index: stepIndex,
      seconds: z.number().min(0),
      deviation: z.string().max(1000),
      verified: z.boolean().optional(),
    }),
  ),
});

export const createRepairGuideController = (useCases: RepairGuideUseCases) => ({
  list: (siteId: unknown) => useCases.list(parse(id, siteId)),
  get: (guideId: unknown) => useCases.get(parse(id, guideId)),
  video: (guideId: unknown) => useCases.video(parse(id, guideId)),
  comparisonVideo: (guideId: unknown) => useCases.comparisonVideo(parse(id, guideId)),
  capture: (input: unknown, video: unknown, signal?: AbortSignal) =>
    useCases.capture(
      { ...parse(captureInput, input), video: videoFile(video), fileName: videoFile(video).name },
      signal,
    ),
  save: (guide: RepairGuide) => useCases.save(guide),
  remove: (guideId: unknown) => useCases.remove(parse(id, guideId)),
  approve: (guideId: unknown) => useCases.approve(parse(id, guideId)),
  compare: (guideId: unknown, expert: unknown, video: unknown, signal?: AbortSignal) =>
    useCases.compare(
      parse(id, guideId),
      { expert: parse(name, expert), video: videoFile(video), fileName: videoFile(video).name },
      signal,
    ),
  verifyStep: (guideId: unknown, step: unknown, photo: unknown, signal?: AbortSignal) => {
    if (!(photo instanceof Blob) || !photo.type.startsWith('image/')) {
      throw new InputParseError('Take or choose a photo.');
    }
    return useCases.verifyStep(parse(id, guideId), parse(stepIndex, step), photo, signal);
  },
  ask: (guideId: unknown, step: unknown, question: unknown, signal?: AbortSignal) =>
    useCases.ask(
      parse(id, guideId),
      parse(stepIndex, step),
      parse(z.string().trim().min(1).max(500), question),
      signal,
    ),
  recordRun: (guideId: unknown, value: unknown) =>
    useCases.recordRun(parse(id, guideId), parse(run, value) as RepairRun),
  reviseStep: (guideId: unknown, step: unknown, instruction: unknown, note: unknown) =>
    useCases.reviseStep(
      parse(id, guideId),
      parse(stepIndex, step),
      parse(z.string().trim().min(1).max(2000), instruction),
      parse(z.string().trim().max(400), note),
    ),
});
export type RepairGuideController = ReturnType<typeof createRepairGuideController>;

function videoFile(value: unknown): File {
  if (!(value instanceof File)) throw new InputParseError('Choose a video file.');
  if (!value.type.startsWith('video/')) throw new InputParseError('The file is not a video.');
  if (value.size > MAX_VIDEO_BYTES) throw new InputParseError('The video is larger than 2 GB.');
  return value;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new InputParseError('Invalid repair guide input.', { cause: result.error });
  return result.data;
}
