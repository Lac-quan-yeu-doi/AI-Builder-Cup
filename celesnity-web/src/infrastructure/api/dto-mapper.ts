export interface DtoMapper<TDto, TDomain> {
  toDomain(dto: TDto): TDomain;
}

export function mapDtos<TDto, TDomain>(
  values: readonly TDto[],
  mapper: DtoMapper<TDto, TDomain>,
): readonly TDomain[] {
  return values.map((value) => mapper.toDomain(value));
}
