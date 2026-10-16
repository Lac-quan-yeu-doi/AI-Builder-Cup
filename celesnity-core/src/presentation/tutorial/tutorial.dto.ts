import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { WORKSPACE_FEATURES } from '@application/administration/workspace-feature';
import { TUTORIAL_PROGRESS_STATUSES } from '@domain/tutorial/models/tutorial';

export class TutorialMetadataDto {
  @IsString() @IsNotEmpty() @MaxLength(200) public title!: string;
  @IsString() @IsNotEmpty() @MaxLength(1_000) public summary!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) public category!: string;
  @IsArray() @ArrayUnique() @IsString({ each: true }) public learningOutcomes!: string[];
  @IsInt() @Min(1) @Max(1_440) public estimatedMinutes!: number;
  @IsInt() @Min(1) @Max(200) public stepCount!: number;
}

export class TutorialActionDto {
  @IsString() @IsNotEmpty() @MaxLength(120) public id!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) public accessibleName!: string;
}

export class TutorialTargetDto extends TutorialActionDto {
  @IsString() @IsNotEmpty() @MaxLength(500) public selector!: string;
}

export class TutorialStepDto {
  @IsString() @IsNotEmpty() @MaxLength(120) public id!: string;
  @IsInt() @Min(1) @Max(200) public order!: number;
  @IsString() @IsNotEmpty() @MaxLength(200) public title!: string;
  @IsString() @IsNotEmpty() @MaxLength(10_000) public instructionalContent!: string;
  @IsIn(WORKSPACE_FEATURES) public destinationFeature!: (typeof WORKSPACE_FEATURES)[number];
  @IsString() @IsNotEmpty() @MaxLength(500) public destinationHref!: string;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TutorialActionDto)
  public requiredAction?: TutorialActionDto;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TutorialTargetDto)
  public targetControl?: TutorialTargetDto;
}

export class TutorialPrerequisiteDto {
  @IsString() @IsNotEmpty() @MaxLength(120) public id!: string;
  @IsString() @IsNotEmpty() @MaxLength(1_000) public description!: string;
  @IsOptional() @IsBoolean() public informational?: boolean;
}

export class TutorialContextRequirementDto {
  @IsString() @IsNotEmpty() @MaxLength(120) public id!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) public resourceType!: string;
  @IsInt() @Min(1) @Max(20) public selectionCount!: number;
}

export class TutorialExperienceDto {
  @IsIn(['WORKSPACE', 'SIMULATED_CHAT']) public mode!: 'WORKSPACE' | 'SIMULATED_CHAT';
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) public scenarioId?: string;
  @IsOptional() @IsInt() @IsIn([1]) public scenarioVersion?: 1;
  @IsOptional() @IsIn(['RESTART']) public resumePolicy?: 'RESTART';
}

export class PublishTutorialDto {
  @IsString() @IsNotEmpty() @MaxLength(120) public id!: string;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TutorialExperienceDto)
  public experience?: TutorialExperienceDto;
  @IsObject()
  @ValidateNested()
  @Type(() => TutorialMetadataDto)
  public metadata!: TutorialMetadataDto;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TutorialStepDto)
  public steps!: TutorialStepDto[];
  @IsArray()
  @ArrayUnique()
  @IsIn(WORKSPACE_FEATURES, { each: true })
  public requiredFeatures!: (typeof WORKSPACE_FEATURES)[number][];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TutorialPrerequisiteDto)
  public prerequisites!: TutorialPrerequisiteDto[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TutorialContextRequirementDto)
  public contextRequirements!: TutorialContextRequirementDto[];
}

export class TutorialContextSelectionDto {
  @IsString() @IsNotEmpty() @MaxLength(120) public requirementId!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) public resourceType!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) public resourceId!: string;
}

export class SaveTutorialProgressDto {
  @IsIn(TUTORIAL_PROGRESS_STATUSES)
  public status!: (typeof TUTORIAL_PROGRESS_STATUSES)[number];
  @IsString() @IsNotEmpty() @MaxLength(120) public currentStepId!: string;
  @IsArray() @ArrayUnique() @IsString({ each: true }) public completedStepIds!: string[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TutorialContextSelectionDto)
  public contextSelections!: TutorialContextSelectionDto[];
  @IsString() public updatedAt!: string;
}

export class SaveTutorialOnboardingDecisionDto {
  @IsIn(['ACCEPTED', 'DISMISSED']) public decision!: 'ACCEPTED' | 'DISMISSED';
}
