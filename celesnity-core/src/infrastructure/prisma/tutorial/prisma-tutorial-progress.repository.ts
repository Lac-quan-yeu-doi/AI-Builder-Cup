import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { TutorialProgressRepository } from '@application/tutorial/tutorial.repository';
import { TutorialError } from '@domain/tutorial/errors/tutorial.errors';
import type {
  TutorialContextSelection,
  TutorialOnboardingDecision,
  TutorialProgress,
} from '@domain/tutorial/models/tutorial';
import type { Prisma } from '@generated/prisma/client';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaTutorialProgressRepository implements TutorialProgressRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async list(
    organizationId: string,
    identityId: string,
  ): Promise<readonly TutorialProgress[]> {
    const rows = await this.prisma.client.tutorialProgress.findMany({
      where: { organizationId, identityId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toProgress);
  }

  public async save(progress: TutorialProgress): Promise<TutorialProgress> {
    const existing = await this.prisma.client.tutorialProgress.findFirst({
      where: {
        organizationId: progress.organizationId,
        identityId: progress.memberId,
        tutorialId: progress.tutorialId,
      },
      select: { id: true },
    });
    try {
      const row =
        existing === null
          ? await this.prisma.client.tutorialProgress.create({
              data: {
                id: randomUUID(),
                organizationId: progress.organizationId,
                identityId: progress.memberId,
                tutorialId: progress.tutorialId,
                status: progress.status,
                currentStepId: progress.currentStepId,
                completedStepIds: [...progress.completedStepIds],
                contextSelections: cloneJson(progress.contextSelections),
                updatedAt: new Date(progress.updatedAt),
              },
            })
          : await this.prisma.client.tutorialProgress.update({
              where: { id: existing.id },
              data: {
                status: progress.status,
                currentStepId: progress.currentStepId,
                completedStepIds: [...progress.completedStepIds],
                contextSelections: cloneJson(progress.contextSelections),
                updatedAt: new Date(progress.updatedAt),
              },
            });
      return toProgress(row);
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw TutorialError.runConflict();
      }
      throw error;
    }
  }

  public async getOnboardingDecision(
    organizationId: string,
    identityId: string,
  ): Promise<TutorialOnboardingDecision | null> {
    const row = await this.prisma.client.tutorialOnboardingDecision.findFirst({
      where: { organizationId, identityId },
      select: { decision: true },
    });
    return row?.decision ?? null;
  }

  public async saveOnboardingDecision(
    organizationId: string,
    identityId: string,
    decision: TutorialOnboardingDecision,
  ): Promise<TutorialOnboardingDecision> {
    const existing = await this.prisma.client.tutorialOnboardingDecision.findFirst({
      where: { organizationId, identityId },
      select: { id: true },
    });
    const row =
      existing === null
        ? await this.prisma.client.tutorialOnboardingDecision.create({
            data: { id: randomUUID(), organizationId, identityId, decision },
          })
        : await this.prisma.client.tutorialOnboardingDecision.update({
            where: { id: existing.id },
            data: { decision },
          });
    return row.decision;
  }

  public async saveCompletion(
    organizationId: string,
    identityId: string,
    runId: string,
  ): Promise<{ readonly runId: string; readonly completedAt: string }> {
    const existing = await this.findCompletion(organizationId, identityId, runId);
    if (existing !== null) return existing;
    try {
      const row = await this.prisma.client.tutorialCompletion.create({
        data: { id: randomUUID(), organizationId, identityId, runId },
      });
      return { runId: row.runId, completedAt: row.completedAt.toISOString() };
    } catch (error) {
      if (!hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) throw error;
      const raced = await this.findCompletion(organizationId, identityId, runId);
      if (raced === null) throw error;
      return raced;
    }
  }

  private async findCompletion(
    organizationId: string,
    identityId: string,
    runId: string,
  ): Promise<{ readonly runId: string; readonly completedAt: string } | null> {
    const row = await this.prisma.client.tutorialCompletion.findFirst({
      where: { organizationId, identityId, runId },
    });
    return row === null ? null : { runId: row.runId, completedAt: row.completedAt.toISOString() };
  }
}

type TutorialProgressRow = Prisma.TutorialProgressGetPayload<Record<string, never>>;

function toProgress(row: TutorialProgressRow): TutorialProgress {
  return {
    tutorialId: row.tutorialId,
    memberId: row.identityId,
    organizationId: row.organizationId,
    status: row.status,
    currentStepId: row.currentStepId,
    completedStepIds: [...row.completedStepIds],
    contextSelections: decodeContextSelections(row.contextSelections),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function decodeContextSelections(value: Prisma.JsonValue): readonly TutorialContextSelection[] {
  if (!Array.isArray(value)) {
    throw TutorialError.invalid('Stored tutorial context selections are invalid.');
  }
  return value.map((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      Array.isArray(item) ||
      typeof item.requirementId !== 'string' ||
      typeof item.resourceType !== 'string' ||
      typeof item.resourceId !== 'string'
    ) {
      throw TutorialError.invalid('Stored tutorial context selection is invalid.');
    }
    return {
      requirementId: item.requirementId,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
    };
  });
}

function cloneJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
