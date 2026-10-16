export type DashboardFilterSemanticType =
  'DATE_PICKER' | 'TIME_GROUPING' | 'LOCATION' | 'TEXT_CATEGORY' | 'NUMBER' | 'BOOLEAN' | 'ID';

export type DashboardFilterPlacement =
  Readonly<{ kind: 'TOP_OF_PAGE' }> | Readonly<{ kind: 'INLINE_CARD'; cardId: string }>;

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
  | Readonly<{ kind: 'FIELD'; fieldId: string }>
  | Readonly<{ kind: 'NATIVE_QUERY_VARIABLE'; variableKey: string }>
  | Readonly<{ kind: 'CONTENT_VARIABLE'; variableName: string }>;

export interface DashboardFilterMapping {
  readonly filterId: string;
  readonly cardId: string;
  readonly target: DashboardFilterTarget;
}
