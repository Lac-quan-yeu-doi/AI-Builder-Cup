import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateChartCollectionDto {
  @ApiProperty() @IsString() @MaxLength(255) public readonly name!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() public readonly parent_id?:
    string | null;
}

export class MoveChartCollectionDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() public readonly parent_id?:
    string | null;
}

export class UpdateChartCollectionDto {
  @ApiProperty() @IsString() @MaxLength(255) public readonly name!: string;
}
