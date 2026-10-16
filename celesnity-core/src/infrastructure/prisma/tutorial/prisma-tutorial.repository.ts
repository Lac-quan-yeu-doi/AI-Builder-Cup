import { Injectable } from '@nestjs/common';

import type { TutorialRepository } from '@application/tutorial/tutorial.repository';
import { TutorialError } from '@domain/tutorial/errors/tutorial.errors';
import type { TutorialDefinition } from '@domain/tutorial/models/tutorial';
import type { Prisma } from '@generated/prisma/client';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaTutorialRepository implements TutorialRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async list(): Promise<readonly TutorialDefinition[]> {
    const rows = await this.prisma.client.tutorialDefinition.findMany({
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDefinition);
  }

  public async findById(id: string): Promise<TutorialDefinition | null> {
    const row = await this.prisma.client.tutorialDefinition.findUnique({ where: { id } });
    return row === null ? null : toDefinition(row);
  }

  public async publish(definition: TutorialDefinition): Promise<void> {
    const data = toPersistence(definition);
    await this.prisma.client.tutorialDefinition.upsert({
      where: { id: definition.id },
      create: data,
      update: {
        ...data,
        revision: { increment: 1 },
        publishedAt: new Date(),
      },
    });
  }
}

type TutorialRow = Prisma.TutorialDefinitionGetPayload<Record<string, never>>;

function toDefinition(row: TutorialRow): TutorialDefinition {
  const candidate: TutorialDefinition = {
    id: row.id,
    experience: decodeExperience(isRecord(row.metadata) ? row.metadata.experience : undefined),
    metadata: decodeMetadata(row.metadata),
    steps: decodeSteps(row.steps),
    requiredFeatures: decodeFeatures(row.requiredFeatures),
    prerequisites: decodePrerequisites(row.prerequisites),
    contextRequirements: decodeContextRequirements(row.contextRequirements),
  };
  return candidate;
}

function toPersistence(definition: TutorialDefinition): Prisma.TutorialDefinitionCreateInput {
  return {
    id: definition.id,
    metadata: cloneJson({
      ...definition.metadata,
      experience: definition.experience ?? { mode: 'WORKSPACE' },
    }),
    steps: cloneJson(definition.steps),
    requiredFeatures: [...definition.requiredFeatures],
    prerequisites: cloneJson(definition.prerequisites),
    contextRequirements: cloneJson(definition.contextRequirements),
  };
}

function decodeExperience(
  value: Prisma.JsonValue | undefined,
): NonNullable<TutorialDefinition['experience']> {
  if (value === undefined) return { mode: 'WORKSPACE' };
  if (!isRecord(value) || (value.mode !== 'WORKSPACE' && value.mode !== 'SIMULATED_CHAT')) {
    throw TutorialError.invalid('Stored tutorial experience is invalid.');
  }
  if (value.mode === 'WORKSPACE') return { mode: 'WORKSPACE' };
  if (
    typeof value.scenarioId !== 'string' ||
    value.scenarioVersion !== 1 ||
    value.resumePolicy !== 'RESTART'
  ) {
    throw TutorialError.invalid('Stored simulated tutorial experience is invalid.');
  }
  return {
    mode: 'SIMULATED_CHAT',
    scenarioId: value.scenarioId,
    scenarioVersion: 1,
    resumePolicy: 'RESTART',
  };
}

function decodeMetadata(value: Prisma.JsonValue): TutorialDefinition['metadata'] {
  if (!isRecord(value)) throw TutorialError.invalid('Stored tutorial metadata is invalid.');
  const learningOutcomes = stringArray(value.learningOutcomes);
  if (
    typeof value.title !== 'string' ||
    typeof value.summary !== 'string' ||
    typeof value.category !== 'string' ||
    learningOutcomes === null ||
    typeof value.estimatedMinutes !== 'number' ||
    typeof value.stepCount !== 'number'
  ) {
    throw TutorialError.invalid('Stored tutorial metadata is invalid.');
  }
  return {
    title: value.title,
    summary: value.summary,
    category: value.category,
    learningOutcomes,
    estimatedMinutes: value.estimatedMinutes,
    stepCount: value.stepCount,
  };
}

function decodeSteps(value: Prisma.JsonValue): TutorialDefinition['steps'] {
  if (!Array.isArray(value)) throw TutorialError.invalid('Stored tutorial steps are invalid.');
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.order !== 'number' ||
      typeof item.title !== 'string' ||
      typeof item.instructionalContent !== 'string' ||
      typeof item.destinationFeature !== 'string' ||
      typeof item.destinationHref !== 'string'
    ) {
      throw TutorialError.invalid('Stored tutorial step is invalid.');
    }
    const features = decodeFeatures([item.destinationFeature]);
    const destinationFeature = features[0];
    if (destinationFeature === undefined) {
      throw TutorialError.invalid('Stored tutorial destination feature is invalid.');
    }
    return {
      id: item.id,
      order: item.order,
      title: item.title,
      instructionalContent: item.instructionalContent,
      destinationFeature,
      destinationHref: item.destinationHref,
      ...(item.requiredAction === undefined
        ? {}
        : { requiredAction: decodeAction(item.requiredAction) }),
      ...(item.targetControl === undefined
        ? {}
        : { targetControl: decodeTarget(item.targetControl) }),
    };
  });
}

function decodeFeatures(values: readonly string[]): TutorialDefinition['requiredFeatures'] {
  const valid = values.filter((value): value is TutorialDefinition['requiredFeatures'][number] =>
    [
      'HOME',
      'CONNECTIONS',
      'STREAMING',
      'DEVICES',
      'SOURCE_SCHEMA',
      'CRAWLER',
      'PIPELINES',
      'EXECUTIONS',
      'AUTOMATIONS',
      'CATALOG_DATABASES',
      'CATALOG_TABLES',
      'PLANT_MODEL',
      'QUERY',
      'ANALYTICS',
      'DOCUMENTS',
      'GUIDE',
      'ADMINISTRATION',
    ].includes(value),
  );
  if (valid.length !== values.length) {
    throw TutorialError.invalid('Stored tutorial features are invalid.');
  }
  return valid;
}

function decodePrerequisites(value: Prisma.JsonValue): TutorialDefinition['prerequisites'] {
  if (!Array.isArray(value)) {
    throw TutorialError.invalid('Stored tutorial prerequisites are invalid.');
  }
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.description !== 'string' ||
      (item.informational !== undefined && typeof item.informational !== 'boolean')
    ) {
      throw TutorialError.invalid('Stored tutorial prerequisites are invalid.');
    }
    return {
      id: item.id,
      description: item.description,
      ...(item.informational === true ? { informational: true } : {}),
    };
  });
}

function decodeContextRequirements(
  value: Prisma.JsonValue,
): TutorialDefinition['contextRequirements'] {
  if (!Array.isArray(value)) {
    throw TutorialError.invalid('Stored tutorial context requirements are invalid.');
  }
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.resourceType !== 'string' ||
      typeof item.selectionCount !== 'number'
    ) {
      throw TutorialError.invalid('Stored tutorial context requirement is invalid.');
    }
    return {
      id: item.id,
      resourceType: item.resourceType,
      selectionCount: item.selectionCount,
    };
  });
}

function decodeAction(value: Prisma.JsonValue): {
  readonly id: string;
  readonly accessibleName: string;
} {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.accessibleName !== 'string'
  ) {
    throw TutorialError.invalid('Stored tutorial required action is invalid.');
  }
  return { id: value.id, accessibleName: value.accessibleName };
}

function decodeTarget(value: Prisma.JsonValue): {
  readonly id: string;
  readonly accessibleName: string;
  readonly selector: string;
} {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.accessibleName !== 'string' ||
    typeof value.selector !== 'string'
  ) {
    throw TutorialError.invalid('Stored tutorial target control is invalid.');
  }
  return { id: value.id, accessibleName: value.accessibleName, selector: value.selector };
}

function cloneJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function isRecord(value: unknown): value is Record<string, Prisma.JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
