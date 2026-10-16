import { ApiProperty } from '@nestjs/swagger';

export class PlantModelResponseDto {
  @ApiProperty() public readonly success = true;
  @ApiProperty({ type: 'object', additionalProperties: true }) public readonly data!: unknown;

  public static from<T>(data: T): PlantModelResponseDto {
    return Object.assign(new PlantModelResponseDto(), { data });
  }
}

export class PlantModelCollectionResponseDto {
  @ApiProperty() public readonly success = true;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  public readonly data!: readonly unknown[];

  public static from<T>(data: readonly T[]): PlantModelCollectionResponseDto {
    return Object.assign(new PlantModelCollectionResponseDto(), { data });
  }
}
