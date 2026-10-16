export interface DashboardGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface DashboardCardBase {
  readonly id: string;
  readonly tabId: string;
  readonly geometry: DashboardGeometry;
}

export type DashboardCard =
  | (DashboardCardBase & {
      readonly kind: 'CHART';
      readonly chartId: string;
      readonly chartRevisionNumber: number | null;
      readonly visualizationOverrides: Readonly<Record<string, unknown>>;
    })
  | (DashboardCardBase & { readonly kind: 'HEADING'; readonly content: { readonly text: string } })
  | (DashboardCardBase & { readonly kind: 'TEXT'; readonly content: { readonly markdown: string } })
  | (DashboardCardBase & {
      readonly kind: 'LINK';
      readonly content: { readonly label: string; readonly url: string };
    });

export interface DashboardTab {
  readonly id: string;
  readonly name: string;
  readonly order: number;
}

export type DashboardFilterSemanticType =
  'DATE_PICKER' | 'TIME_GROUPING' | 'LOCATION' | 'TEXT_CATEGORY' | 'NUMBER' | 'BOOLEAN' | 'ID';

export type DashboardFilterPlacement =
  { readonly kind: 'TOP_OF_PAGE' } | { readonly kind: 'INLINE_CARD'; readonly cardId: string };

export interface DashboardFilter {
  readonly id: string;
  readonly slug: string;
  readonly label: string;
  readonly semanticType: DashboardFilterSemanticType;
  readonly operator: string;
  readonly defaultValue: unknown;
  readonly required: boolean;
  readonly multiple: boolean;
  readonly valuesSource: Readonly<Record<string, unknown>> | null;
  readonly placement: DashboardFilterPlacement;
  readonly order: number;
}

export type DashboardFilterTarget =
  | { readonly kind: 'FIELD'; readonly fieldId: string }
  | { readonly kind: 'NATIVE_QUERY_VARIABLE'; readonly variableKey: string }
  | { readonly kind: 'CONTENT_VARIABLE'; readonly variableName: string };

export interface DashboardFilterMapping {
  readonly filterId: string;
  readonly cardId: string;
  readonly target: DashboardFilterTarget;
}

export interface Dashboard {
  readonly id: string;
  readonly collectionId: string;
  readonly name: string;
  readonly description: string | null;
  readonly revision: number;
  readonly tabs: readonly DashboardTab[];
  readonly cards: readonly DashboardCard[];
  readonly filters: readonly DashboardFilter[];
  readonly mappings: readonly DashboardFilterMapping[];
  readonly createdByIdentityId: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DashboardSummary {
  readonly id: string;
  readonly collectionId: string;
  readonly name: string;
  readonly description: string | null;
  readonly revision: number;
  readonly updatedAt: string;
}

export type DashboardCardVisualKind =
  'HEADING' | 'TEXT' | 'TABLE' | 'BAR' | 'LINE' | 'AREA' | 'SCATTER' | 'PIE' | 'NUMBER';

export function dashboardCardGeometry(kind: DashboardCardVisualKind, y: number): DashboardGeometry {
  const size: Readonly<Record<DashboardCardVisualKind, readonly [number, number]>> = {
    HEADING: [24, 1],
    TEXT: [12, 3],
    TABLE: [12, 9],
    BAR: [12, 6],
    LINE: [12, 6],
    AREA: [12, 6],
    SCATTER: [12, 6],
    PIE: [12, 8],
    NUMBER: [6, 3],
  };
  return { x: 0, y, width: size[kind][0], height: size[kind][1] };
}

export function dashboardContentVariables(card: DashboardCard): readonly string[] {
  if (card.kind === 'CHART') return [];
  const content =
    card.kind === 'HEADING'
      ? card.content.text
      : card.kind === 'TEXT'
        ? card.content.markdown
        : `${card.content.label}\n${card.content.url}`;
  return [
    ...new Set(
      [...content.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_-]{0,63})\s*\}\}/g)].map(
        (match) => match[1]!,
      ),
    ),
  ];
}
