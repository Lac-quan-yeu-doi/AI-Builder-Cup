import type { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import type { IClock } from '@application/shared/interfaces/i-clock';
import { PlantModelError } from '@domain/plant-model/errors/plant-model.errors';
import type {
  PlantCatalogBinding,
  PlantPropertyValue,
  PlantScalar,
} from '@domain/plant-model/models/plant-model';

export type PlantCatalogLookupResult =
  | { readonly kind: 'scalar'; readonly available: false; readonly resolvedAt: string }
  | {
      readonly kind: 'scalar';
      readonly available: true;
      readonly value: PlantScalar;
      readonly label: string;
      readonly resolvedAt: string;
    }
  | {
      readonly kind: 'choices';
      readonly options: readonly { readonly value: PlantScalar; readonly label: string }[];
      readonly resolvedAt: string;
    };

export class PlantCatalogLookupUseCases {
  public constructor(
    private readonly catalogs: CatalogExplorationUseCases,
    private readonly clock: IClock,
  ) {}

  public async resolve(
    binding: PlantCatalogBinding,
    nodeValues: Readonly<Record<string, PlantPropertyValue>>,
  ): Promise<PlantCatalogLookupResult> {
    assertBinding(binding);
    const filters = binding.filters.map((filter) => {
      const value =
        filter.operand.kind === 'literal'
          ? filter.operand.value
          : nodeValues[filter.operand.propertyDefinitionId];
      if (!isScalar(value)) {
        throw PlantModelError.validation(
          'A catalog filter parameter is unavailable or not scalar.',
        );
      }
      return { column: filter.column, operator: filter.operator, value };
    });
    const result = await this.catalogs.lookupValues(
      binding.catalog,
      binding.schema,
      binding.table,
      {
        valueColumn: binding.valueColumn,
        ...(binding.labelColumn === undefined ? {} : { labelColumn: binding.labelColumn }),
        filters,
        ...(binding.orderBy === undefined ? {} : { orderBy: binding.orderBy }),
        limit: binding.mode === 'scalar' ? 2 : Math.min(binding.limit ?? 100, 500),
      },
    );
    const resolvedAt = this.clock.now().toISOString();
    if (binding.mode === 'choices') return { kind: 'choices', options: result.rows, resolvedAt };
    if (result.rows.length > 1) throw PlantModelError.catalogLookupAmbiguous();
    const row = result.rows[0];
    return row === undefined
      ? { kind: 'scalar', available: false, resolvedAt }
      : { kind: 'scalar', available: true, value: row.value, label: row.label, resolvedAt };
  }
}

function isScalar(value: PlantPropertyValue | undefined): value is PlantScalar {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function assertBinding(binding: PlantCatalogBinding): void {
  const rawBinding: unknown = binding;
  if (
    !record(rawBinding) ||
    typeof binding.mode !== 'string' ||
    !['scalar', 'choices'].includes(binding.mode) ||
    !validFilters(rawBinding.filters) ||
    (binding.limit !== undefined &&
      (!Number.isInteger(binding.limit) || binding.limit < 1 || binding.limit > 500)) ||
    (binding.orderBy !== undefined &&
      (!record(binding.orderBy) || !['asc', 'desc'].includes(binding.orderBy.direction)))
  )
    throw PlantModelError.validation('The catalog lookup definition is invalid.');
  const identifier = /^[A-Za-z0-9_]+$/u;
  const identifiers = [
    binding.catalog,
    binding.schema,
    binding.table,
    binding.valueColumn,
    ...(binding.labelColumn === undefined ? [] : [binding.labelColumn]),
    ...binding.filters.map((filter) => filter.column),
    ...(binding.orderBy === undefined ? [] : [binding.orderBy.column]),
  ];
  if (identifiers.some((value) => !identifier.test(value)))
    throw PlantModelError.validation('The catalog lookup contains an invalid identifier.');
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validFilters(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (filter: unknown) =>
        record(filter) &&
        typeof filter.operator === 'string' &&
        ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'].includes(filter.operator) &&
        record(filter.operand) &&
        typeof filter.operand.kind === 'string' &&
        ['literal', 'property'].includes(filter.operand.kind),
    )
  );
}
