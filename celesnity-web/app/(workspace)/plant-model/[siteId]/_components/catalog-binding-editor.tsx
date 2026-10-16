'use client';

import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { Label } from '@/app/_components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/app/_components/ui/native-select';
import { SelectField, TextField, type SelectOption } from '@/app/_components/ui/fields';
import type {
  PlantCatalogBinding,
  PlantPropertyDefinition,
} from '@/src/entities/models/plant-model';
import type { ListCatalogsController } from '@/src/interface-adapters/controllers/catalog/list-catalogs.controller';
import type { ListNamespacesController } from '@/src/interface-adapters/controllers/catalog/list-namespaces.controller';
import type { ListTablesController } from '@/src/interface-adapters/controllers/catalog/list-tables.controller';
import type { LoadTableMetadataController } from '@/src/interface-adapters/controllers/catalog/load-table-metadata.controller';
import type { CatalogColumnViewModel } from '@/src/interface-adapters/presenters/catalog.presenter';

export interface CatalogMetadataControllers {
  readonly listCatalogs: ListCatalogsController;
  readonly listNamespaces: ListNamespacesController;
  readonly listTables: ListTablesController;
  readonly loadTableMetadata: LoadTableMetadataController;
}

interface CatalogBindingEditorProps {
  readonly property: PlantPropertyDefinition;
  readonly availableProperties: readonly PlantPropertyDefinition[];
  readonly metadata: CatalogMetadataControllers;
  readonly update: (property: PlantPropertyDefinition) => void;
}

export function CatalogBindingEditor({
  property,
  availableProperties,
  metadata,
  update,
}: CatalogBindingEditorProps) {
  const { t } = useTranslation();
  const binding = property.catalogBinding;
  const [catalogs, setCatalogs] = useState<readonly string[]>();
  const [schemas, setSchemas] = useState<readonly string[]>();
  const [tables, setTables] = useState<readonly string[]>();
  const [columns, setColumns] = useState<readonly CatalogColumnViewModel[]>();
  const [metadataError, setMetadataError] = useState(false);

  useEffect(() => {
    let active = true;
    void metadata.listCatalogs().then(
      (items) => {
        if (active) {
          setCatalogs(items.map((item) => item.name));
          setMetadataError(false);
        }
      },
      () => {
        if (active) setMetadataError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [metadata]);

  useEffect(() => {
    if (!binding?.catalog) return;
    let active = true;
    void metadata.listNamespaces(binding.catalog, 'readable').then(
      (items) => {
        if (active) {
          setSchemas(items.map((item) => item.name));
          setMetadataError(false);
        }
      },
      () => {
        if (active) setMetadataError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [binding?.catalog, metadata]);

  useEffect(() => {
    if (!binding?.catalog || !binding.schema) return;
    let active = true;
    void metadata.listTables(binding.catalog, binding.schema).then(
      (items) => {
        if (active) {
          setTables(items.map((item) => item.name));
          setMetadataError(false);
        }
      },
      () => {
        if (active) setMetadataError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [binding?.catalog, binding?.schema, metadata]);

  useEffect(() => {
    if (!binding?.catalog || !binding.schema || !binding.table) return;
    let active = true;
    void metadata
      .loadTableMetadata({
        catalog: binding.catalog,
        schema: binding.schema,
        table: binding.table,
      })
      .then(
        (value) => {
          if (active) {
            setColumns(value.columns);
            setMetadataError(false);
          }
        },
        () => {
          if (active) setMetadataError(true);
        },
      );
    return () => {
      active = false;
    };
  }, [binding?.catalog, binding?.schema, binding?.table, metadata]);

  if (!binding) return null;
  const updateBinding = (next: typeof binding) => update({ ...property, catalogBinding: next });
  const choices = binding.mode === 'choices';
  const columnNames = columns?.map((column) => column.name) ?? [];
  const identifierOptions = (values: readonly string[] | undefined, current: string) =>
    selectOptions(values, current, t('plantModel.select'));

  return (
    <div className="space-y-4 rounded-md border bg-background p-4">
      <div className="space-y-1">
        <Label>{t('plantModel.catalogBinding')}</Label>
        <p className="text-sm text-muted-foreground">
          {t(
            choices
              ? property.type === 'catalog-multi-select'
                ? 'plantModel.catalogMultiSelectHelp'
                : 'plantModel.catalogSingleSelectHelp'
              : 'plantModel.catalogScalarHelp',
          )}
        </p>
      </div>
      {metadataError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('plantModel.catalogMetadataUnavailable')}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={t('plantModel.catalog')}
          data={identifierOptions(catalogs, binding.catalog)}
          disabled={catalogs === undefined}
          value={binding.catalog}
          onChange={(catalog) => {
            setSchemas(catalog ? undefined : []);
            setTables([]);
            setColumns([]);
            setMetadataError(false);
            updateBinding({
              mode: binding.mode,
              catalog,
              schema: '',
              table: '',
              valueColumn: '',
              filters: [],
              limit: binding.limit,
            });
          }}
        />
        <SelectField
          label={t('plantModel.schema')}
          data={identifierOptions(schemas, binding.schema)}
          disabled={!binding.catalog || schemas === undefined}
          value={binding.schema}
          onChange={(schema) => {
            setTables(schema ? undefined : []);
            setColumns([]);
            setMetadataError(false);
            updateBinding({
              mode: binding.mode,
              catalog: binding.catalog,
              schema,
              table: '',
              valueColumn: '',
              filters: [],
              limit: binding.limit,
            });
          }}
        />
        <SelectField
          label={t('plantModel.table')}
          data={identifierOptions(tables, binding.table)}
          disabled={!binding.schema || tables === undefined}
          value={binding.table}
          onChange={(table) => {
            setColumns(table ? undefined : []);
            setMetadataError(false);
            updateBinding({
              mode: binding.mode,
              catalog: binding.catalog,
              schema: binding.schema,
              table,
              valueColumn: '',
              filters: [],
              limit: binding.limit,
            });
          }}
        />
        <SelectField
          label={t('plantModel.valueColumn')}
          hint={t('plantModel.valueColumnHelp')}
          data={identifierOptions(columnNames, binding.valueColumn)}
          disabled={!binding.table || columns === undefined}
          value={binding.valueColumn}
          onChange={(valueColumn) => updateBinding({ ...binding, valueColumn })}
        />
        <SelectField
          label={t('plantModel.labelColumn')}
          hint={t('plantModel.labelColumnHelp')}
          data={identifierOptions(columnNames, binding.labelColumn ?? '')}
          disabled={!binding.table || columns === undefined}
          value={binding.labelColumn ?? ''}
          onChange={(labelColumn) => {
            if (labelColumn) updateBinding({ ...binding, labelColumn });
            else updateBinding(withoutLabelColumn(binding));
          }}
        />
        {choices ? (
          <TextField
            label={t('plantModel.resultLimit')}
            hint={t('plantModel.resultLimitHelp')}
            type="number"
            min={1}
            max={500}
            value={binding.limit ?? 100}
            onChange={(event) => updateBinding({ ...binding, limit: Number(event.target.value) })}
          />
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>{t('plantModel.filters')}</Label>
        <p className="text-sm text-muted-foreground">{t('plantModel.filtersHelp')}</p>
        {binding.filters.map((filter, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_90px_130px_1fr_auto]">
            <SelectField
              label={t('plantModel.filterColumn')}
              data={identifierOptions(columnNames, filter.column)}
              disabled={columns === undefined || columnNames.length === 0}
              value={filter.column}
              onChange={(column) =>
                updateBinding({
                  ...binding,
                  filters: binding.filters.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, column } : item,
                  ),
                })
              }
            />
            <NativeSelect
              aria-label={t('plantModel.filterOperator')}
              value={filter.operator}
              onChange={(event) =>
                updateBinding({
                  ...binding,
                  filters: binding.filters.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, operator: event.target.value as typeof filter.operator }
                      : item,
                  ),
                })
              }
            >
              {['eq', 'ne', 'lt', 'lte', 'gt', 'gte'].map((operator) => (
                <NativeSelectOption key={operator} value={operator}>
                  {operator}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label={t('plantModel.filterValueSource')}
              value={filter.operand.kind}
              onChange={(event) =>
                updateBinding({
                  ...binding,
                  filters: binding.filters.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          operand:
                            event.target.value === 'property'
                              ? {
                                  kind: 'property',
                                  propertyDefinitionId:
                                    availableProperties.find(
                                      (candidate) => candidate.id !== property.id,
                                    )?.id ?? '',
                                }
                              : { kind: 'literal', value: '' },
                        }
                      : item,
                  ),
                })
              }
            >
              <NativeSelectOption value="literal">{t('plantModel.literal')}</NativeSelectOption>
              <NativeSelectOption value="property">
                {t('plantModel.propertyReference')}
              </NativeSelectOption>
            </NativeSelect>
            {filter.operand.kind === 'literal' ? (
              <Input
                aria-label={t('plantModel.filterValue')}
                value={String(filter.operand.value ?? '')}
                onChange={(event) =>
                  updateBinding({
                    ...binding,
                    filters: binding.filters.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            operand: { kind: 'literal', value: parseLiteral(event.target.value) },
                          }
                        : item,
                    ),
                  })
                }
              />
            ) : (
              <NativeSelect
                aria-label={t('plantModel.propertyReference')}
                value={filter.operand.propertyDefinitionId}
                onChange={(event) =>
                  updateBinding({
                    ...binding,
                    filters: binding.filters.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            operand: {
                              kind: 'property',
                              propertyDefinitionId: event.target.value,
                            },
                          }
                        : item,
                    ),
                  })
                }
              >
                {availableProperties
                  .filter((candidate) => candidate.id !== property.id)
                  .map((candidate) => (
                    <NativeSelectOption key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                updateBinding({
                  ...binding,
                  filters: binding.filters.filter((_item, itemIndex) => itemIndex !== index),
                })
              }
              aria-label={t('plantModel.removeFilter')}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={columnNames.length === 0}
          onClick={() =>
            updateBinding({
              ...binding,
              filters: [
                ...binding.filters,
                {
                  column: columnNames[0] ?? '',
                  operator: 'eq',
                  operand: { kind: 'literal', value: '' },
                },
              ],
            })
          }
        >
          <PlusIcon />
          {t('plantModel.addFilter')}
        </Button>
      </div>
    </div>
  );
}

function withoutLabelColumn(binding: PlantCatalogBinding): PlantCatalogBinding {
  return {
    mode: binding.mode,
    catalog: binding.catalog,
    schema: binding.schema,
    table: binding.table,
    valueColumn: binding.valueColumn,
    filters: binding.filters,
    ...(binding.orderBy === undefined ? {} : { orderBy: binding.orderBy }),
    ...(binding.limit === undefined ? {} : { limit: binding.limit }),
  };
}

function selectOptions(
  values: readonly string[] | undefined,
  current: string,
  placeholder: string,
): readonly SelectOption[] {
  const identifiers = values ?? [];
  const withCurrent =
    current && !identifiers.includes(current) ? [current, ...identifiers] : identifiers;
  return [
    { value: '', label: placeholder },
    ...withCurrent.map((value) => ({ value, label: value })),
  ];
}

function parseLiteral(value: string): string | number | boolean | null {
  if (value === 'true' || value === 'false') return value === 'true';
  if (value === 'null') return null;
  return value !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
}
