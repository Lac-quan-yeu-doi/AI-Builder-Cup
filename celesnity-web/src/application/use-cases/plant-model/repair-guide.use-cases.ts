import type { RepairGuideRepository } from '@/src/application/repositories/repair-guide.repository.interface';
import type { SkillRepository } from '@/src/application/repositories/skill.repository.interface';
import type { RepairCaptureService } from '@/src/application/services/repair-capture.service.interface';
import { NotFoundError, RepairGuideNotReadyError } from '@/src/entities/errors/application-errors';
import {
  approvalIssues,
  normalizeProcedureTimes,
  reviseStep,
  skillFromGuide,
  type RepairGuide,
  type RepairRun,
} from '@/src/entities/models/repair-guide';

export interface CaptureRepairInput {
  readonly siteId: string;
  readonly machineId?: string;
  readonly machineName: string;
  readonly faultName: string;
  readonly expert: string;
  readonly video: Blob;
  readonly fileName: string;
  /** Length of the video as the browser read it, to catch times Gemini wrote as m:ss digits. */
  readonly videoSeconds?: number;
}

const now = () => new Date().toISOString();
const comparisonVideo = (id: string) => `${id}:compare`;

export const createRepairGuideUseCases = (
  repository: RepairGuideRepository,
  capture: RepairCaptureService,
  skills: SkillRepository,
) => {
  const load = async (id: string) => {
    const guide = await repository.get(id);
    if (guide === undefined) throw new NotFoundError('The repair guide was not found.');
    return guide;
  };

  return {
    list: (siteId: string) => repository.list(siteId),
    get: load,
    video: (id: string) => repository.getVideo(id),
    comparisonVideo: (id: string) => repository.getVideo(comparisonVideo(id)),

    /** Watches the repair, then keeps the procedure and the video it replays clips from. */
    capture: async (input: CaptureRepairInput, signal?: AbortSignal): Promise<RepairGuide> => {
      const result = await capture.capture(
        input.video,
        input.fileName,
        { machineName: input.machineName, faultName: input.faultName, expert: input.expert },
        signal,
      );
      const at = now();
      const guide: RepairGuide = {
        id: crypto.randomUUID(),
        siteId: input.siteId,
        machineId: input.machineId,
        machineName: input.machineName,
        faultName: input.faultName,
        expert: input.expert,
        status: 'draft',
        revision: 1,
        createdAt: at,
        updatedAt: at,
        model: result.model,
        videoName: input.fileName,
        procedure: normalizeProcedureTimes(result.procedure, input.videoSeconds),
        confirmations: {},
        answers: {},
        history: [{ revision: 1, at, note: `Captured from ${input.fileName}` }],
        runs: [],
      };
      await repository.saveVideo(guide.id, input.video);
      return repository.save(guide);
    },

    save: (guide: RepairGuide) => repository.save({ ...guide, updatedAt: now() }),
    remove: (id: string) => repository.remove(id),

    /**
     * A guide teaches only once every heard value and safety step has been
     * confirmed by a person. Approval also publishes it as an agent skill, so
     * the assistant answers from the same know-how; a skill that already exists
     * is updated to this revision.
     */
    approve: async (id: string): Promise<RepairGuide> => {
      const guide = await load(id);
      const issues = approvalIssues(guide);
      if (issues.length > 0) {
        throw new RepairGuideNotReadyError(`${issues.length} item(s) still need confirming.`);
      }
      const skill = skillFromGuide(guide);
      const existing = guide.skillName ?? skill.name;
      try {
        await skills.update({ ...skill, name: existing });
      } catch {
        await skills.create(skill);
      }
      return repository.save({
        ...guide,
        status: 'approved',
        skillName: existing,
        updatedAt: now(),
      });
    },

    /** Records a second technician doing the same repair and where they differ. */
    compare: async (
      id: string,
      input: { readonly expert: string; readonly video: Blob; readonly fileName: string },
      signal?: AbortSignal,
    ): Promise<RepairGuide> => {
      const guide = await load(id);
      const other = await capture.capture(
        input.video,
        input.fileName,
        { machineName: guide.machineName, faultName: guide.faultName, expert: input.expert },
        signal,
      );
      const result = await capture.compare(
        { expert: guide.expert, procedure: guide.procedure },
        { expert: input.expert, procedure: other.procedure },
        signal,
      );
      await repository.saveVideo(comparisonVideo(id), input.video);
      return repository.save({
        ...guide,
        comparison: { expert: input.expert, result },
        updatedAt: now(),
      });
    },

    verifyStep: async (id: string, step: number, photo: Blob, signal?: AbortSignal) => {
      const guide = await load(id);
      const target = guide.procedure.steps[step];
      if (target === undefined) throw new NotFoundError('That step does not exist.');
      return capture.verify(photo, target, signal);
    },

    ask: async (id: string, step: number, question: string, signal?: AbortSignal) => {
      const guide = await load(id);
      return capture.ask(guide.procedure, step, question, signal);
    },

    recordRun: async (id: string, run: RepairRun): Promise<RepairGuide> => {
      const guide = await load(id);
      return repository.save({ ...guide, runs: [...guide.runs, run], updatedAt: now() });
    },

    /** Teaches a better way a technician found; the guide goes back to draft for approval. */
    reviseStep: async (id: string, step: number, instruction: string, note: string) => {
      const guide = await load(id);
      return repository.save(reviseStep(guide, step, instruction, note, now()));
    },
  };
};
export type RepairGuideUseCases = ReturnType<typeof createRepairGuideUseCases>;
