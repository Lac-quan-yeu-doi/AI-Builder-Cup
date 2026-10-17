import { describe, expect, it, vi } from 'vitest';

import type { RepairGuideRepository } from '@/src/application/repositories/repair-guide.repository.interface';
import type { SkillRepository } from '@/src/application/repositories/skill.repository.interface';
import type { RepairCaptureService } from '@/src/application/services/repair-capture.service.interface';
import { createRepairGuideUseCases } from '@/src/application/use-cases/plant-model/repair-guide.use-cases';
import { RepairGuideNotReadyError } from '@/src/entities/errors/application-errors';
import { parameterKey, safetyKey, type RepairGuide } from '@/src/entities/models/repair-guide';

import { BELT_PROCEDURE, guide } from '../../../entities/fixtures/repair-guide';

function setup(stored?: RepairGuide) {
  const repository = {
    list: vi.fn(),
    get: vi.fn().mockResolvedValue(stored),
    save: vi.fn(async (value: RepairGuide) => value),
    remove: vi.fn(),
    saveVideo: vi.fn().mockResolvedValue(undefined),
    getVideo: vi.fn(),
  } satisfies RepairGuideRepository;
  const capture = {
    capture: vi
      .fn()
      .mockResolvedValue({ procedure: BELT_PROCEDURE, model: 'gemini', elapsedMs: 1 }),
    compare: vi.fn().mockResolvedValue({
      summary: 's',
      sharedSteps: 1,
      differences: [],
      recommendation: 'r',
    }),
    verify: vi.fn(),
    ask: vi.fn(),
  } satisfies RepairCaptureService;
  const skills = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockRejectedValue(new Error('not found')),
    delete: vi.fn(),
  } as unknown as SkillRepository;
  return {
    repository,
    capture,
    skills,
    useCases: createRepairGuideUseCases(repository, capture, skills),
  };
}

describe('repair guide use cases', () => {
  it('captures a draft guide and keeps its video', async () => {
    const { repository, useCases } = setup();
    const video = new Blob(['x'], { type: 'video/mp4' });
    const saved = await useCases.capture({
      siteId: 'site-1',
      machineName: 'Washer W1',
      faultName: 'Belt slipping',
      expert: 'Anh Tuấn',
      video,
      fileName: 'belt.mp4',
    });
    expect(saved).toMatchObject({ status: 'draft', revision: 1, procedure: BELT_PROCEDURE });
    expect(repository.saveVideo).toHaveBeenCalledWith(saved.id, video);
  });

  it('refuses to approve while values or safety steps are unconfirmed', async () => {
    const { useCases, skills } = setup(guide());
    await expect(useCases.approve('guide-1')).rejects.toBeInstanceOf(RepairGuideNotReadyError);
    expect(skills.create).not.toHaveBeenCalled();
  });

  it('approves and publishes the skill, creating it when it does not exist yet', async () => {
    const ready = guide({ confirmations: { [safetyKey(0)]: true, [parameterKey(1, 0)]: true } });
    const { useCases, skills } = setup(ready);
    const approved = await useCases.approve('guide-1');
    expect(approved).toMatchObject({
      status: 'approved',
      skillName: 'repair-washer-w1-belt-slipping',
    });
    expect(skills.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'repair-washer-w1-belt-slipping', namespace: 'maintenance' }),
    );
  });

  it('compares a second expert and keeps their video', async () => {
    const { useCases, repository, capture } = setup(guide());
    const video = new Blob(['y'], { type: 'video/mp4' });
    const compared = await useCases.compare('guide-1', {
      expert: 'Chị Hoa',
      video,
      fileName: 'b.mp4',
    });
    expect(capture.capture).toHaveBeenCalledWith(
      video,
      'b.mp4',
      expect.objectContaining({ expert: 'Chị Hoa' }),
      undefined,
    );
    expect(repository.saveVideo).toHaveBeenCalledWith('guide-1:compare', video);
    expect(compared.comparison?.expert).toBe('Chị Hoa');
  });
});
