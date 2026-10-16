'use client';

import { useMemo, useState } from 'react';
import { ChevronDownIcon, PlusIcon, Table2Icon, XIcon } from 'lucide-react';

import { Button } from '@/app/_components/ui/button';
import type {
  FieldExpression,
  JoinOperator,
  VisualJoin,
  VisualJoinType,
  VisualQueryDefinition,
} from '@/src/entities/models/canonical-chart';
import {
  fieldExpressionFromOption,
  presentFieldGroups,
  type FieldOptionViewModel,
  type RelationMetadataMap,
} from '@/src/interface-adapters/presenters/chart-builder-field.presenter';

import { DataSourcePicker } from '../data-source-picker/data-source-picker';
import type {
  DataSourceBrowserControllers,
  DataSourceSelection,
} from '../data-source-picker/data-source-picker.types';
import { createRelationAlias } from '../relation-alias';
import { ClauseChip } from '../ui/clause-chip';
import { ResponsiveEditor } from '../ui/responsive-editor';
import { NotebookStepBand } from '../ui/notebook-step-band';
import { NotebookPreviewButton } from '../ui/notebook-preview-button';
import { GroupedFieldPicker } from './grouped-field-picker';
import { useNotebookEditor } from './notebook-editor-context';

export interface JoinEditorProps {
  readonly query: VisualQueryDefinition;
  readonly relations: RelationMetadataMap;
  readonly controllers: DataSourceBrowserControllers;
  readonly onChange: (query: VisualQueryDefinition) => void;
  readonly onRelationsChange?: (relations: RelationMetadataMap) => void;
  readonly onPreviewStep?: () => void;
  readonly previewDisabled?: boolean;
}

type JoinConditionDraft = {
  readonly left?: FieldExpression;
  readonly operator: JoinOperator;
  readonly right?: FieldExpression;
};

type PendingJoin = {
  readonly index: number | null;
  readonly type: VisualJoinType;
  readonly table: VisualJoin['table'];
  readonly alias: string;
  readonly conditions: readonly JoinConditionDraft[];
};

type TablePickerTarget = 'ADD' | number | null;

/** Same-catalog joins expressed as direct, separately editable Metabase controls. */
export function JoinEditor({
  query,
  relations,
  controllers,
  onChange,
  onRelationsChange,
  onPreviewStep,
  previewDisabled = false,
}: JoinEditorProps) {
  const [relationMetadata, setRelationMetadata] = useState(relations);
  const [previousRelations, setPreviousRelations] = useState(relations);
  if (previousRelations !== relations) {
    setPreviousRelations(relations);
    setRelationMetadata(relations);
  }
  const [tablePickerTarget, setTablePickerTarget] = useState<TablePickerTarget>(null);
  const [pendingJoin, setPendingJoin] = useState<PendingJoin | null>(null);
  const [conditionDrafts, setConditionDrafts] = useState<
    Readonly<Record<string, readonly JoinConditionDraft[]>>
  >({});

  const hasVisibleJoin =
    query.joins.length > 0 || pendingJoin !== null || tablePickerTarget === 'ADD';

  const displayJoins = useMemo(() => {
    const persisted = query.joins.map((join) => ({ join, pending: false as const }));
    if (!pendingJoin) return persisted;
    if (pendingJoin.index === null) {
      return [...persisted, { join: pendingJoin, pending: true as const }];
    }
    return persisted.map((item, index) =>
      index === pendingJoin.index ? { join: pendingJoin, pending: true as const } : item,
    );
  }, [pendingJoin, query.joins]);

  function startJoin(selection: DataSourceSelection): void {
    if (!selection.table || selection.catalog !== query.context.catalog) return;
    const alias = createRelationAlias(selection.table, 'join', [
      query.source.alias,
      ...query.joins.map((item) => item.alias),
    ]);
    const nextPending: PendingJoin = {
      index: null,
      type: 'LEFT',
      table: { catalog: selection.catalog, schema: selection.schema, table: selection.table },
      alias,
      conditions: [emptyCondition()],
    };
    const nextRelations = { ...relationMetadata, [alias]: selection.columns };
    setRelationMetadata(nextRelations);
    onRelationsChange?.(nextRelations);
    setPendingJoin(nextPending);
    setTablePickerTarget(null);
  }

  function replaceJoinTable(index: number, selection: DataSourceSelection): void {
    if (!selection.table || selection.catalog !== query.context.catalog) return;
    const visible = displayJoins[index];
    if (!visible) return;
    const existingAliases = [
      query.source.alias,
      ...query.joins.filter((_, itemIndex) => itemIndex !== index).map((item) => item.alias),
    ];
    const alias = createRelationAlias(selection.table, 'join', existingAliases);
    const nextPending: PendingJoin = {
      index: visible.pending ? visible.join.index : index,
      type: visible.join.type,
      table: { catalog: selection.catalog, schema: selection.schema, table: selection.table },
      alias,
      conditions: [emptyCondition()],
    };
    const nextRelations = { ...relationMetadata, [alias]: selection.columns };
    setRelationMetadata(nextRelations);
    onRelationsChange?.(nextRelations);
    setPendingJoin(nextPending);
    setTablePickerTarget(null);
  }

  function updateJoinType(index: number, type: VisualJoinType): void {
    const visible = displayJoins[index];
    if (!visible) return;
    if (visible.pending) {
      setPendingJoin((current) => (current ? { ...current, type } : current));
      return;
    }
    updateCanonicalJoin(index, { ...visible.join, type });
  }

  function removeJoin(index: number): void {
    if (
      pendingJoin &&
      ((pendingJoin.index === null && index === query.joins.length) || pendingJoin.index === index)
    ) {
      setPendingJoin(null);
      return;
    }
    onChange({ ...query, joins: query.joins.filter((_, itemIndex) => itemIndex !== index) });
    setConditionDrafts((current) => {
      const next = { ...current };
      const alias = query.joins[index]?.alias;
      if (alias) delete next[alias];
      return next;
    });
  }

  function addCondition(index: number): void {
    const visible = displayJoins[index];
    if (!visible) return;
    if (visible.pending) {
      setPendingJoin((current) =>
        current ? { ...current, conditions: [...current.conditions, emptyCondition()] } : current,
      );
      return;
    }
    const alias = visible.join.alias;
    setConditionDrafts((current) => ({
      ...current,
      [alias]: [...(current[alias] ?? []), emptyCondition()],
    }));
  }

  function updateCondition(
    joinIndex: number,
    conditionIndex: number,
    patch: Partial<JoinConditionDraft>,
  ): void {
    const visible = displayJoins[joinIndex];
    if (!visible) return;
    if (visible.pending) {
      const nextConditions = visible.join.conditions.map((condition, index) =>
        index === conditionIndex ? { ...condition, ...patch } : condition,
      );
      const nextPending: PendingJoin = { ...visible.join, conditions: nextConditions };
      if (nextConditions.every(isCompleteCondition)) {
        commitPendingJoin(nextPending);
      } else {
        setPendingJoin(nextPending);
      }
      return;
    }

    const persistedCount = visible.join.conditions.length;
    if (conditionIndex < persistedCount) {
      const current = visible.join.conditions[conditionIndex];
      if (!current) return;
      updateCanonicalJoin(joinIndex, {
        ...visible.join,
        conditions: visible.join.conditions.map((condition, index) =>
          index === conditionIndex ? { ...condition, ...patch } : condition,
        ),
      });
      return;
    }

    const alias = visible.join.alias;
    const draftIndex = conditionIndex - persistedCount;
    const drafts = conditionDrafts[alias] ?? [];
    const draft = drafts[draftIndex];
    if (!draft) return;
    const nextDraft = { ...draft, ...patch };
    const nextDrafts = drafts.map((item, index) => (index === draftIndex ? nextDraft : item));
    if (isCompleteCondition(nextDraft)) {
      updateCanonicalJoin(joinIndex, {
        ...visible.join,
        conditions: [...visible.join.conditions, toCanonicalCondition(nextDraft)],
      });
      setConditionDrafts((current) => ({
        ...current,
        [alias]: nextDrafts.slice(0, draftIndex).concat(nextDrafts.slice(draftIndex + 1)),
      }));
    } else {
      setConditionDrafts((current) => ({ ...current, [alias]: nextDrafts }));
    }
  }

  function commitPendingJoin(nextPending: PendingJoin): void {
    const conditions = nextPending.conditions.map(toCanonicalCondition);
    const nextJoin: VisualJoin = {
      type: nextPending.type,
      table: nextPending.table,
      alias: nextPending.alias,
      conditions,
    };
    const joins = [...query.joins];
    if (nextPending.index === null) joins.push(nextJoin);
    else joins[nextPending.index] = nextJoin;
    onChange({
      ...query,
      joins,
    });
    setPendingJoin(null);
  }

  function updateCanonicalJoin(index: number, nextJoin: VisualJoin): void {
    const joins = [...query.joins];
    joins[index] = nextJoin;
    onChange({ ...query, joins });
  }

  function toggleProjectedField(
    pickerQuery: VisualQueryDefinition,
    field: FieldOptionViewModel,
  ): void {
    const projections = explicitProjections(pickerQuery, relationMetadata);
    const selectedIndex = projections.findIndex(
      (projection) =>
        projection.expression.kind === 'FIELD' &&
        projection.expression.relation === field.relation &&
        projection.expression.field === field.name,
    );
    onChange({
      ...query,
      projections:
        selectedIndex >= 0
          ? projections.filter((_, projectionIndex) => projectionIndex !== selectedIndex)
          : [...projections, projectionFromField(field)],
    });
  }

  function toggleProjectedGroup(
    pickerQuery: VisualQueryDefinition,
    fields: readonly FieldOptionViewModel[],
    selected: boolean,
  ): void {
    const projections = explicitProjections(pickerQuery, relationMetadata);
    const fieldIds = new Set(fields.map((field) => field.id));
    const withoutGroup = projections.filter(
      (projection) =>
        projection.expression.kind !== 'FIELD' ||
        !fieldIds.has(`${projection.expression.relation}.${projection.expression.field}`),
    );
    onChange({
      ...query,
      projections: selected ? [...withoutGroup, ...fields.map(projectionFromField)] : withoutGroup,
    });
  }

  if (!hasVisibleJoin) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setTablePickerTarget('ADD')}>
        <PlusIcon aria-hidden="true" /> Add join
      </Button>
    );
  }

  return (
    <div className="space-y-3" aria-label="Join data">
      <NotebookStepBand
        tone="DATA"
        label="Join data"
        surface="CLEAR"
        action={
          <div className="flex items-center gap-1">
            {onPreviewStep ? (
              <NotebookPreviewButton
                label="Join data"
                onClick={onPreviewStep}
                disabled={previewDisabled}
              />
            ) : null}
            {tablePickerTarget === 'ADD' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTablePickerTarget(null)}
              >
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTablePickerTarget('ADD')}
              >
                <PlusIcon aria-hidden="true" /> Add join
              </Button>
            )}
          </div>
        }
      >
        {tablePickerTarget === 'ADD' ? (
          <div className="mb-3 max-w-xl">
            <DataSourcePicker
              mode="TABLE"
              catalogLock={query.context.catalog}
              controllers={controllers}
              onSelect={startJoin}
            />
          </div>
        ) : null}

        <div className="grid gap-3">
          {displayJoins.map(({ join, pending }, index) => {
            const persistedConditions = pending ? [] : join.conditions;
            const drafts = pending ? join.conditions : (conditionDrafts[join.alias] ?? []);
            const conditionRows: readonly JoinConditionDraft[] = [
              ...persistedConditions.map((condition) => ({
                left: condition.left.kind === 'FIELD' ? condition.left : undefined,
                operator: condition.operator,
                right: condition.right.kind === 'FIELD' ? condition.right : undefined,
              })),
              ...drafts,
            ];
            const pickerQuery = pending
              ? {
                  ...query,
                  joins:
                    join.index === null
                      ? [...query.joins, { ...join, conditions: [] }]
                      : query.joins.map((item, itemIndex) =>
                          itemIndex === join.index ? { ...join, conditions: [] } : item,
                        ),
                }
              : query;
            const visibleFieldGroups = presentFieldGroups({
              query: pickerQuery,
              relations: relationMetadata,
              scope: { kind: 'QUERY_VISIBLE' },
            });
            const rightFieldGroups = presentFieldGroups({
              query: pickerQuery,
              relations: relationMetadata,
              scope: { kind: 'JOIN_RIGHT', joinIndex: index },
            });
            const rightFields = rightFieldGroups.flatMap((group) => group.fields);
            const selectedProjectionIds =
              pickerQuery.projections.length === 0
                ? visibleFieldGroups.flatMap((group) => group.fields.map((field) => field.id))
                : pickerQuery.projections.flatMap((projection) =>
                    projection.expression.kind === 'FIELD'
                      ? [`${projection.expression.relation}.${projection.expression.field}`]
                      : [],
                  );

            return (
              <div key={`${join.alias}-${index}`} className="relative space-y-2">
                <div className="grid items-stretch gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <div
                    data-testid="join-table-band"
                    className="flex min-h-18 flex-wrap items-center gap-2 rounded-md bg-muted p-4"
                  >
                    <ClauseChip tone="DATA" ariaLabel="Source table chip">
                      <Table2Icon aria-hidden="true" className="mr-1 inline size-3.5" />
                      {humanize(query.source.table.table)}
                    </ClauseChip>
                    <JoinTypeControl
                      editorId={`join-${index}-type`}
                      ariaLabel={`Join ${index + 1} type`}
                      value={join.type}
                      onChange={(type) => updateJoinType(index, type)}
                    />
                    <JoinTableChip
                      index={index}
                      label={humanize(join.table.table)}
                      groups={rightFieldGroups}
                      selectedIds={selectedProjectionIds}
                      disabled={pending}
                      onEdit={() => setTablePickerTarget(index)}
                      onToggle={(field) => toggleProjectedField(pickerQuery, field)}
                      onToggleAll={(selected) =>
                        toggleProjectedGroup(pickerQuery, rightFields, selected)
                      }
                    />
                  </div>
                  <span className="flex items-center justify-center px-1 text-body-sm font-semibold text-foreground">
                    on
                  </span>
                  <div
                    data-testid="join-condition-band"
                    className="flex min-h-18 flex-wrap items-center gap-2 rounded-md bg-muted p-2.5"
                  >
                    {conditionRows.map((condition, conditionIndex) => (
                      <ConditionRow
                        key={`${join.alias}-condition-${conditionIndex}`}
                        editorPrefix={`join-${index}-condition-${conditionIndex}`}
                        labelPrefix={`Join ${index + 1}`}
                        conditionIndex={conditionIndex}
                        condition={condition}
                        leftGroups={presentFieldGroups({
                          query: pickerQuery,
                          relations: relationMetadata,
                          scope: { kind: 'JOIN_LEFT', joinIndex: index },
                        })}
                        rightGroups={presentFieldGroups({
                          query: pickerQuery,
                          relations: relationMetadata,
                          scope: { kind: 'JOIN_RIGHT', joinIndex: index },
                        })}
                        onChange={(patch) => updateCondition(index, conditionIndex, patch)}
                      />
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="bg-sidebar-selected text-foreground ring-1 ring-ring/15 ring-inset hover:bg-sidebar-selected hover:text-foreground"
                      aria-label={`Add AND condition to Join ${index + 1}`}
                      onClick={() => addCondition(index)}
                    >
                      <PlusIcon aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute -top-9 right-0 text-muted-foreground"
                  aria-label={`Remove Join ${index + 1}`}
                  onClick={() => removeJoin(index)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
                {tablePickerTarget === index ? (
                  <div className="max-w-xl">
                    <DataSourcePicker
                      mode="TABLE"
                      catalogLock={query.context.catalog}
                      controllers={controllers}
                      onSelect={(selection) => replaceJoinTable(index, selection)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </NotebookStepBand>
    </div>
  );
}

function JoinTableChip({
  index,
  label,
  groups,
  selectedIds,
  disabled,
  onEdit,
  onToggle,
  onToggleAll,
}: {
  readonly index: number;
  readonly label: string;
  readonly groups: ReturnType<typeof presentFieldGroups>;
  readonly selectedIds: readonly string[];
  readonly disabled: boolean;
  readonly onEdit: () => void;
  readonly onToggle: (field: FieldOptionViewModel) => void;
  readonly onToggleAll: (selected: boolean) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Join ${index + 1} table chip`}
      className="inline-flex h-10 shrink-0 items-stretch overflow-hidden rounded-sm bg-sidebar-selected text-body-sm font-medium text-foreground ring-1 ring-ring/15 ring-inset"
    >
      <Button
        type="button"
        variant="ghost"
        className="h-10 min-w-0 gap-1.5 rounded-none px-3 text-current hover:bg-black/10 hover:text-current"
        aria-label={`Join ${index + 1} table`}
        onClick={onEdit}
      >
        <Table2Icon aria-hidden="true" className="size-3.5" />
        <span className="truncate">{label}</span>
      </Button>
      <GroupedFieldPicker
        editorId={`join-${index}-columns`}
        ariaLabel={`Join ${index + 1} columns`}
        groups={groups}
        mode="MULTIPLE"
        selectedIds={selectedIds}
        flattenSingleGroup
        showSearch={false}
        showTypeIcons
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-10 rounded-none border-l border-white/35 text-current hover:bg-black/10 hover:text-current"
            aria-label={`Join ${index + 1} columns`}
            disabled={disabled}
          >
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          </Button>
        }
        onSelect={onToggle}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
      />
    </div>
  );
}

function ConditionRow({
  editorPrefix,
  labelPrefix,
  conditionIndex,
  condition,
  leftGroups,
  rightGroups,
  onChange,
}: {
  readonly editorPrefix: string;
  readonly labelPrefix: string;
  readonly conditionIndex: number;
  readonly condition: JoinConditionDraft;
  readonly leftGroups: ReturnType<typeof presentFieldGroups>;
  readonly rightGroups: ReturnType<typeof presentFieldGroups>;
  readonly onChange: (patch: Partial<JoinConditionDraft>) => void;
}) {
  const leftLabel = selectedFieldLabel(leftGroups, condition.left);
  const rightLabel = selectedFieldLabel(rightGroups, condition.right);
  const leftRelationLabel = selectedRelationLabel(leftGroups, condition.left);
  const rightRelationLabel = selectedRelationLabel(rightGroups, condition.right);
  return (
    <div
      data-testid="join-condition-chip"
      className="flex min-h-10 flex-wrap items-center gap-1 rounded-sm bg-sidebar-selected px-1.5 py-1 text-foreground ring-1 ring-ring/15 ring-inset"
    >
      <GroupedFieldPicker
        editorId={`${editorPrefix}-left`}
        ariaLabel={`${labelPrefix} left field ${conditionIndex + 1}`}
        groups={leftGroups}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto min-h-8 flex-col items-start gap-0 rounded px-2 py-1 text-current hover:bg-black/10 hover:text-current"
            aria-label={`${labelPrefix} left field ${conditionIndex + 1}`}
          >
            <span className="text-micro leading-none opacity-80">
              {leftRelationLabel ?? 'Left table'}
            </span>
            <span className="flex items-center gap-1 leading-tight">
              {leftLabel ?? 'Pick a field'}{' '}
              <ChevronDownIcon aria-hidden="true" className="size-3" />
            </span>
          </Button>
        }
        onSelect={(field) => onChange({ left: fieldExpressionFromOption(field) })}
      />
      <OperatorControl
        editorId={`${editorPrefix}-operator`}
        ariaLabel={`${labelPrefix} operator ${conditionIndex + 1}`}
        value={condition.operator}
        className="text-current hover:bg-black/10 hover:text-current"
        onChange={(operator) => onChange({ operator })}
      />
      <GroupedFieldPicker
        editorId={`${editorPrefix}-right`}
        ariaLabel={`${labelPrefix} right field ${conditionIndex + 1}`}
        groups={rightGroups}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto min-h-8 flex-col items-start gap-0 rounded px-2 py-1 text-current hover:bg-black/10 hover:text-current"
            aria-label={`${labelPrefix} right field ${conditionIndex + 1}`}
          >
            <span className="text-micro leading-none opacity-80">
              {rightRelationLabel ?? 'Right table'}
            </span>
            <span className="flex items-center gap-1 leading-tight">
              {rightLabel ?? 'Pick a field'}{' '}
              <ChevronDownIcon aria-hidden="true" className="size-3" />
            </span>
          </Button>
        }
        onSelect={(field) => onChange({ right: fieldExpressionFromOption(field) })}
      />
    </div>
  );
}

function JoinTypeControl({
  editorId,
  ariaLabel,
  value,
  onChange,
}: {
  readonly editorId: string;
  readonly ariaLabel: string;
  readonly value: VisualJoinType;
  readonly onChange: (value: VisualJoinType) => void;
}) {
  const { setOpen } = useNotebookEditor(editorId);
  const options: readonly { readonly value: VisualJoinType; readonly label: string }[] = [
    { value: 'LEFT', label: 'Left outer join' },
    { value: 'RIGHT', label: 'Right outer join' },
    { value: 'INNER', label: 'Inner join' },
    { value: 'FULL', label: 'Full outer join' },
  ];
  return (
    <ResponsiveEditor
      editorId={editorId}
      ariaLabel={ariaLabel}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-foreground hover:bg-accent hover:text-foreground"
          aria-label={ariaLabel}
          title="Change join type"
        >
          <JoinVennIcon type={value} />
        </Button>
      }
    >
      <div className="grid gap-1 p-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            className={`justify-start gap-2 ${
              option.value === value
                ? 'bg-sidebar-selected text-foreground ring-1 ring-ring/15 ring-inset hover:bg-sidebar-selected hover:text-foreground'
                : 'text-foreground'
            }`}
            aria-pressed={option.value === value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            <JoinVennIcon type={option.value} />
            {option.label}
          </Button>
        ))}
      </div>
    </ResponsiveEditor>
  );
}

function JoinVennIcon({ type }: { readonly type: VisualJoinType }) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-8 shrink-0"
      viewBox="0 0 32 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {type === 'LEFT' || type === 'FULL' ? (
        <circle cx="11" cy="10" r="7.5" fill="currentColor" fillOpacity="0.28" />
      ) : null}
      {type === 'RIGHT' || type === 'FULL' ? (
        <circle cx="21" cy="10" r="7.5" fill="currentColor" fillOpacity="0.28" />
      ) : null}
      {type === 'INNER' ? (
        <path
          d="M16 3.36a7.5 7.5 0 0 1 0 13.28 7.5 7.5 0 0 1 0-13.28Z"
          fill="currentColor"
          fillOpacity="0.4"
        />
      ) : null}
      <circle cx="11" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="21" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function OperatorControl({
  editorId,
  ariaLabel,
  value,
  className,
  onChange,
}: {
  readonly editorId: string;
  readonly ariaLabel: string;
  readonly value: JoinOperator;
  readonly className?: string;
  readonly onChange: (value: JoinOperator) => void;
}) {
  return (
    <OperatorMenu
      editorId={editorId}
      ariaLabel={ariaLabel}
      value={value}
      values={['EQ', 'NOT_EQ', 'GT', 'GTE', 'LT', 'LTE']}
      labels={{ EQ: '=', NOT_EQ: '≠', GT: '>', GTE: '≥', LT: '<', LTE: '≤' }}
      className={className}
      onChange={onChange}
    />
  );
}

function OperatorMenu<T extends string>({
  editorId,
  ariaLabel,
  value,
  values,
  labels,
  className,
  onChange,
}: {
  readonly editorId: string;
  readonly ariaLabel: string;
  readonly value: T;
  readonly values: readonly T[];
  readonly labels?: Partial<Record<T, string>>;
  readonly className?: string;
  readonly onChange: (value: T) => void;
}) {
  const { setOpen } = useNotebookEditor(editorId);
  return (
    <ResponsiveEditor
      editorId={editorId}
      ariaLabel={ariaLabel}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={className}
          aria-label={ariaLabel}
        >
          {labels?.[value] ?? value} <ChevronDownIcon aria-hidden="true" />
        </Button>
      }
    >
      <div className="grid gap-1 p-2">
        {values.map((item) => (
          <Button
            key={item}
            type="button"
            variant={item === value ? 'secondary' : 'ghost'}
            className="justify-start"
            onClick={() => {
              onChange(item);
              setOpen(false);
            }}
          >
            {labels?.[item] ?? item}
          </Button>
        ))}
      </div>
    </ResponsiveEditor>
  );
}

function selectedFieldLabel(
  groups: readonly { readonly fields: readonly FieldOptionViewModel[] }[],
  expression?: FieldExpression,
): string | undefined {
  if (!expression) return undefined;
  return groups
    .flatMap((group) => group.fields)
    .find((field) => field.relation === expression.relation && field.name === expression.field)
    ?.label;
}

function selectedRelationLabel(
  groups: readonly {
    readonly relation: string;
    readonly label: string;
  }[],
  expression?: FieldExpression,
): string | undefined {
  if (!expression) return groups.length === 1 ? groups[0]?.label : undefined;
  return groups.find((group) => group.relation === expression.relation)?.label;
}

function explicitProjections(
  query: VisualQueryDefinition,
  relations: RelationMetadataMap,
): VisualQueryDefinition['projections'] {
  if (query.projections.length > 0) return query.projections;
  return presentFieldGroups({ query, relations, scope: { kind: 'QUERY_VISIBLE' } })
    .flatMap((group) => group.fields)
    .map(projectionFromField);
}

function projectionFromField(
  field: FieldOptionViewModel,
): VisualQueryDefinition['projections'][number] {
  return {
    alias: field.name,
    expression: fieldExpressionFromOption(field),
  };
}

function emptyCondition(): JoinConditionDraft {
  return { operator: 'EQ' };
}

function isCompleteCondition(condition: JoinConditionDraft): condition is {
  readonly left: FieldExpression;
  readonly operator: JoinOperator;
  readonly right: FieldExpression;
} {
  return Boolean(condition.left && condition.right);
}

function toCanonicalCondition(condition: JoinConditionDraft): VisualJoin['conditions'][number] {
  if (!isCompleteCondition(condition)) throw new Error('Join condition is incomplete');
  return { left: condition.left, operator: condition.operator, right: condition.right };
}

function humanize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .map((word) =>
      word.toLowerCase() === 'id'
        ? 'ID'
        : word
          ? `${word[0]!.toUpperCase()}${word.slice(1)}`
          : word,
    )
    .join(' ');
}
