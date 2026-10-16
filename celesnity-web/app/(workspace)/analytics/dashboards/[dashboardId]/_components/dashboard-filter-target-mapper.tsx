'use client';

import type { DashboardFilterTargetOption } from '@/src/entities/models/dashboard-runtime';
import type {
  DashboardCard,
  DashboardFilter,
  DashboardFilterMapping,
  DashboardFilterTarget,
} from '@/src/entities/models/dashboard';
import { Button } from '@/app/_components/ui/button';

export function DashboardFilterTargetMapper({
  filter,
  cards,
  options,
  mappings,
  onChange,
}: {
  readonly filter: DashboardFilter;
  readonly cards: readonly DashboardCard[];
  readonly options: readonly DashboardFilterTargetOption[];
  readonly mappings: readonly DashboardFilterMapping[];
  readonly onChange: (mappings: readonly DashboardFilterMapping[]) => void;
}) {
  const compatible = cards
    .map((card) => ({
      card,
      targets:
        options
          .find((option) => option.cardId === card.id)
          ?.targets.filter(
            (target) =>
              target.semanticType === filter.semanticType ||
              (filter.semanticType === 'TIME_GROUPING' && target.semanticType === 'DATE_PICKER'),
          ) ?? [],
    }))
    .filter(({ targets }) => targets.length > 0);

  function setCardTarget(cardId: string, key: string): void {
    const retained = mappings.filter((mapping) => mapping.cardId !== cardId);
    if (!key) return onChange(retained);
    const option = compatible
      .find(({ card }) => card.id === cardId)
      ?.targets.find((target) => targetKey(target) === key);
    if (option)
      onChange([...retained, { filterId: filter.id, cardId, target: stripSemanticType(option) }]);
  }

  function connectAll(): void {
    onChange(
      compatible.map(({ card, targets }) => ({
        filterId: filter.id,
        cardId: card.id,
        target: stripSemanticType(targets[0]!),
      })),
    );
  }

  return (
    <section className="grid gap-3" aria-label="Filter connections">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-body-sm font-semibold">Connected cards</h3>
          <p className="text-caption text-muted-foreground">
            Choose the exact field this filter controls.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={connectAll}
          disabled={compatible.length === 0}
        >
          Connect all
        </Button>
      </div>
      {compatible.map(({ card, targets }) => {
        const mapping = mappings.find((item) => item.cardId === card.id);
        return (
          <label
            key={card.id}
            className="grid gap-1 rounded-lg border border-border p-3 text-body-sm"
          >
            <span className="font-medium">{cardLabel(card)}</span>
            <span className="text-caption text-muted-foreground">Column to filter on</span>
            <select
              aria-label={`Column to filter on ${cardLabel(card)}`}
              className="h-9 rounded-md border border-input bg-background px-2"
              value={mapping ? targetKey(mapping.target) : ''}
              onChange={(event) => setCardTarget(card.id, event.target.value)}
            >
              <option value="">Not connected</option>
              {targets.map((target) => (
                <option key={targetKey(target)} value={targetKey(target)}>
                  {targetLabel(target)}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {compatible.length === 0 ? (
        <p className="rounded-lg bg-muted p-3 text-body-sm text-muted-foreground">
          No compatible fields are available for this filter type.
        </p>
      ) : null}
    </section>
  );
}

function cardLabel(card: DashboardCard): string {
  if (card.kind === 'CHART') return `Chart · ${card.chartId}`;
  if (card.kind === 'HEADING') return `Heading · ${card.content.text}`;
  if (card.kind === 'LINK') return `Link · ${card.content.label}`;
  return 'Text card';
}

function targetKey(target: DashboardFilterTarget): string {
  if (target.kind === 'FIELD') return `FIELD:${target.fieldId}`;
  if (target.kind === 'NATIVE_QUERY_VARIABLE') return `NATIVE_QUERY_VARIABLE:${target.variableKey}`;
  return `CONTENT_VARIABLE:${target.variableName}`;
}

function targetLabel(target: DashboardFilterTarget): string {
  if (target.kind === 'FIELD') return target.fieldId;
  if (target.kind === 'NATIVE_QUERY_VARIABLE') return target.variableKey;
  return `{{${target.variableName}}}`;
}

function stripSemanticType(
  target: DashboardFilterTargetOption['targets'][number],
): DashboardFilterTarget {
  if (target.kind === 'FIELD') return { kind: 'FIELD', fieldId: target.fieldId };
  if (target.kind === 'NATIVE_QUERY_VARIABLE')
    return { kind: 'NATIVE_QUERY_VARIABLE', variableKey: target.variableKey };
  return { kind: 'CONTENT_VARIABLE', variableName: target.variableName };
}
