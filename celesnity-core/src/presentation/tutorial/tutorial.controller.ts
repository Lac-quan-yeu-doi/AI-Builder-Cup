import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { TutorialUseCases } from '@application/tutorial/tutorial.use-cases';
import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import type {
  TutorialDefinition,
  TutorialOnboardingDecision,
  TutorialProgress,
} from '@domain/tutorial/models/tutorial';
import { requireAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { RequirePermission } from '@presentation/http/required-permission.decorator';
import { RequireWorkspaceFeature } from '@presentation/http/required-workspace-feature.decorator';
import {
  PublishTutorialDto,
  SaveTutorialOnboardingDecisionDto,
  SaveTutorialProgressDto,
} from './tutorial.dto';

@ApiTags('tutorials')
@Controller()
@RequireWorkspaceFeature()
export class TutorialController {
  public constructor(private readonly tutorials: TutorialUseCases) {}

  @Get('tutorials')
  @ApiOperation({ summary: 'List published tutorials accessible to the current member' })
  public async list(@Req() request: Request): Promise<readonly unknown[]> {
    const definitions = await this.tutorials.listAccessible(principalOf(request));
    return definitions.map((definition) => ({
      id: definition.id,
      experience: definition.experience ?? { mode: 'WORKSPACE' as const },
      metadata: definition.metadata,
    }));
  }

  @Get('tutorials/context-resources')
  @ApiOperation({ summary: 'List authorized resources for a tutorial context selector' })
  public async contextResources(
    @Query('resourceType') resourceType: string,
  ): Promise<{ readonly items: readonly unknown[] }> {
    return { items: await this.tutorials.listContextResources(resourceType) };
  }

  @Get('tutorials/:tutorialId')
  @ApiOperation({ summary: 'Load one accessible published tutorial definition' })
  public get(
    @Param('tutorialId') tutorialId: string,
    @Req() request: Request,
  ): Promise<TutorialDefinition> {
    return this.tutorials.getAccessible(principalOf(request), tutorialId);
  }

  @Post('tutorials')
  @RequirePermission('support:access')
  @ApiOperation({ summary: 'Publish or revise a global tutorial definition' })
  public publish(
    @Body() dto: PublishTutorialDto,
  ): Promise<
    { readonly ok: true } | { readonly ok: false; readonly violations: readonly string[] }
  > {
    return this.tutorials.publish(toTutorialDefinition(dto));
  }

  @Get('tutorial-progress')
  @ApiOperation({ summary: 'List tutorial progress for the current member and organization' })
  public listProgress(@Req() request: Request): Promise<readonly TutorialProgress[]> {
    return this.tutorials.listProgress(principalOf(request));
  }

  @Put('tutorial-progress/:tutorialId')
  @ApiOperation({ summary: 'Create or update tutorial progress in the current member scope' })
  public saveProgress(
    @Param('tutorialId') tutorialId: string,
    @Body() dto: SaveTutorialProgressDto,
    @Req() request: Request,
  ): Promise<TutorialProgress> {
    return this.tutorials.saveProgress(principalOf(request), tutorialId, dto);
  }

  @Get('tutorial-onboarding-decision')
  @ApiOperation({ summary: 'Read the current member tutorial onboarding decision' })
  public async onboardingDecision(
    @Req() request: Request,
  ): Promise<{ readonly decision: TutorialOnboardingDecision } | null> {
    const decision = await this.tutorials.getOnboardingDecision(principalOf(request));
    return decision === null ? null : { decision };
  }

  @Put('tutorial-onboarding-decision')
  @ApiOperation({ summary: 'Persist the current member tutorial onboarding decision' })
  public async saveOnboardingDecision(
    @Body() dto: SaveTutorialOnboardingDecisionDto,
    @Req() request: Request,
  ): Promise<{ readonly decision: TutorialOnboardingDecision }> {
    return {
      decision: await this.tutorials.saveOnboardingDecision(principalOf(request), dto.decision),
    };
  }

  @Put('tutorial-runs/:runId/completion')
  @ApiOperation({ summary: 'Idempotently record completion of a tutorial run' })
  @ApiOkResponse({
    schema: { properties: { runId: { type: 'string' }, completedAt: { type: 'string' } } },
  })
  public completion(
    @Param('runId') runId: string,
    @Req() request: Request,
  ): Promise<{ readonly runId: string; readonly completedAt: string }> {
    return this.tutorials.saveCompletion(principalOf(request), runId);
  }
}

function toTutorialDefinition(dto: PublishTutorialDto): TutorialDefinition {
  const experience = dto.experience;
  if (experience?.mode === 'SIMULATED_CHAT') {
    if (
      experience.scenarioId === undefined ||
      experience.scenarioVersion !== 1 ||
      experience.resumePolicy !== 'RESTART'
    ) {
      throw new BadRequestException('A simulated tutorial experience is incomplete.');
    }
    return {
      ...dto,
      experience: {
        mode: 'SIMULATED_CHAT',
        scenarioId: experience.scenarioId,
        scenarioVersion: 1,
        resumePolicy: 'RESTART',
      },
    };
  }
  return { ...dto, experience: { mode: 'WORKSPACE' } };
}

function principalOf(request: Request): AuthenticatedContext {
  return requireAuthenticatedPrincipal(request);
}
