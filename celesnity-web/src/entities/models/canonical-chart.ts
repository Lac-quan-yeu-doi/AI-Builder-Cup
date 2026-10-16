export type OutputColumnFamily = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP' | 'UNKNOWN';

export interface OutputColumn {
  readonly name: string;
  readonly type: string;
  readonly family: OutputColumnFamily;
}

export type ParameterValue = string | number | boolean | null;
export type QueryParameterType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP';

export interface QueryParameter {
  readonly name: string;
  readonly type: QueryParameterType;
  readonly required: boolean;
  readonly defaultValue?: ParameterValue | null;
}

export interface QueryContext {
  readonly catalog: string;
  readonly schema: string;
}

export interface NativeQueryDefinition {
  readonly schemaVersion: 1;
  readonly mode: 'NATIVE';
  readonly context: QueryContext;
  readonly parameters: readonly QueryParameter[];
  readonly sql: string;
}

export interface FieldExpression {
  readonly kind: 'FIELD';
  readonly relation: string;
  readonly field: string;
}

export interface LiteralExpression {
  readonly kind: 'LITERAL';
  readonly valueType: 'NULL' | 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE';
  readonly value: string | number | boolean | null;
}

export interface BinaryExpression {
  readonly kind: 'BINARY';
  readonly operator: string;
  readonly left: QueryExpression;
  readonly right: QueryExpression;
}

export interface UnaryExpression {
  readonly kind: 'UNARY';
  readonly operator: string;
  readonly operand: QueryExpression;
}

export interface CallExpression {
  readonly kind: 'CALL';
  readonly function: string;
  readonly arguments: readonly QueryExpression[];
}

export interface CaseExpression {
  readonly kind: 'CASE';
  readonly branches: readonly { readonly when: QueryExpression; readonly then: QueryExpression }[];
  readonly otherwise: QueryExpression;
}

export type QueryExpression =
  | FieldExpression
  | LiteralExpression
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | CaseExpression;

export type VisualJoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
export type JoinOperator = 'EQ' | 'NOT_EQ' | 'GT' | 'GTE' | 'LT' | 'LTE';

export interface TableReference {
  readonly catalog: string;
  readonly schema: string;
  readonly table: string;
}

export interface VisualJoin {
  readonly type: VisualJoinType;
  readonly table: TableReference;
  readonly alias: string;
  readonly conditions: readonly {
    readonly left: QueryExpression;
    readonly operator: JoinOperator;
    readonly right: QueryExpression;
  }[];
}

export interface NamedQueryExpression {
  readonly alias: string;
  readonly expression: QueryExpression;
}

export interface VisualQueryDefinition {
  readonly schemaVersion: 1;
  readonly mode: 'VISUAL';
  readonly context: QueryContext;
  readonly parameters: readonly QueryParameter[];
  readonly source: { readonly table: TableReference; readonly alias: string };
  readonly joins: readonly VisualJoin[];
  readonly projections: readonly NamedQueryExpression[];
  readonly customExpressions: readonly NamedQueryExpression[];
  readonly filters: readonly QueryExpression[];
  readonly aggregations: readonly (NamedQueryExpression & { readonly function: string })[];
  readonly breakouts: readonly QueryExpression[];
  readonly postAggregationFilters: readonly QueryExpression[];
  readonly orderBy: readonly {
    readonly expression: QueryExpression;
    readonly direction: 'ASC' | 'DESC';
  }[];
  readonly limit?: number;
}

/** Notebook clause boundary used when projecting a visual question for preview. */
export type VisualQueryPreviewStage = 'DATA' | 'JOIN' | 'FILTER' | 'SUMMARIZE' | 'SORT_LIMIT';

export type QueryDefinition = NativeQueryDefinition | VisualQueryDefinition;

export interface CompiledChartQuery {
  readonly mode: QueryDefinition['mode'];
  readonly context: QueryContext;
  readonly sql: string;
}

export interface AxisSettings {
  readonly title?: string;
  readonly visible?: boolean;
  readonly gridlines?: boolean;
  readonly scale?: 'LINEAR' | 'LOG' | 'POW';
  readonly min?: number;
  readonly max?: number;
}

export interface ValueFormattingSettings {
  readonly style?: 'AUTO' | 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'SCIENTIFIC';
  readonly currency?: string;
  readonly decimalPlaces?: number;
  readonly compact?: boolean;
  readonly prefix?: string;
  readonly suffix?: string;
}

export interface ColorSettings {
  readonly palette?: string;
  readonly byField?: Readonly<Record<string, string>>;
}

export interface ColumnFormattingSettings {
  readonly style?: ValueFormattingSettings['style'];
  readonly decimalPlaces?: number;
  readonly prefix?: string;
  readonly suffix?: string;
}

export interface ComparisonSettings {
  readonly type?: 'NONE' | 'PREVIOUS_VALUE' | 'PERCENT_CHANGE' | 'ABSOLUTE_CHANGE';
  readonly field?: string;
  readonly label?: string;
}

export interface TableVisualizationDefinition {
  readonly schemaVersion: 1;
  readonly type: 'TABLE';
  readonly roles: { readonly columns: readonly string[] };
  readonly display: {
    readonly columnOrder?: readonly string[];
    readonly columnVisibility?: Readonly<Record<string, boolean>>;
    readonly columnLabels?: Readonly<Record<string, string>>;
    readonly rowDensity?: 'COMPACT' | 'DEFAULT' | 'SPACIOUS';
    readonly showRowIndex?: boolean;
    readonly columnFormatting?: Readonly<Record<string, ColumnFormattingSettings>>;
    readonly enableSearch?: boolean;
    readonly pageSize?: number;
  };
}

export interface NumberVisualizationDefinition {
  readonly schemaVersion: 1;
  readonly type: 'NUMBER';
  readonly roles: { readonly measure: string };
  readonly display: {
    readonly comparison?: ComparisonSettings;
    readonly showTitle?: boolean;
    readonly showValue?: boolean;
    readonly valueFormatting?: ValueFormattingSettings;
    readonly decimalPlaces?: number;
    readonly compact?: boolean;
    readonly prefix?: string;
    readonly suffix?: string;
    readonly comparisonStyle?: 'DELTA' | 'PERCENT' | 'ICON';
    readonly colors?: ColorSettings;
  };
}

export interface CartesianBaseDisplay {
  readonly showLegend?: boolean;
  readonly showLabels?: boolean;
  readonly axes?: { readonly x?: AxisSettings; readonly y?: AxisSettings };
  readonly colors?: ColorSettings;
  readonly valueFormatting?: ValueFormattingSettings;
  readonly gridlines?: boolean;
  readonly opacity?: number;
  readonly pointSize?: number;
}

export interface BarVisualizationDefinition {
  readonly schemaVersion: 1;
  readonly type: 'BAR';
  readonly roles: {
    readonly category: string;
    readonly measures: readonly string[];
    readonly breakout?: string;
  };
  readonly display: CartesianBaseDisplay & {
    readonly orientation?: 'VERTICAL' | 'HORIZONTAL';
    readonly stacking?: 'NONE' | 'STACKED' | 'PERCENT';
  };
}

export interface LineVisualizationDefinition {
  readonly schemaVersion: 1;
  readonly type: 'LINE';
  readonly roles: {
    readonly x: string;
    readonly measures: readonly string[];
    readonly series?: string;
  };
  readonly display: CartesianBaseDisplay & {
    readonly interpolation?: 'LINEAR' | 'STEP' | 'SMOOTH';
    readonly markers?: boolean;
    readonly lineStyle?: 'SOLID' | 'DASHED' | 'DOTTED';
    readonly missingValueHandling?: 'LINE' | 'ZERO' | 'GAP';
  };
}

export interface AreaVisualizationDefinition {
  readonly schemaVersion: 1;
  readonly type: 'AREA';
  readonly roles: {
    readonly x: string;
    readonly measures: readonly string[];
    readonly series?: string;
  };
  readonly display: CartesianBaseDisplay & {
    readonly stacking?: 'NONE' | 'STACKED' | 'PERCENT';
    readonly missingValueHandling?: 'LINE' | 'ZERO' | 'GAP';
  };
}

export interface PieVisualizationDefinition {
  readonly schemaVersion: 1;
  readonly type: 'PIE';
  readonly roles: { readonly measure: string; readonly breakout: string };
  readonly display: {
    readonly variant?: 'PIE' | 'DONUT';
    readonly showLegend?: boolean;
    readonly showTotal?: boolean;
    readonly showLabels?: boolean;
    readonly percentagePlacement?: 'OFF' | 'IN_LEGEND' | 'ON_CHART' | 'BOTH';
    readonly decimalPlaces?: number;
    readonly minimumSlicePercentage?: number;
    readonly donutRadius?: number;
    readonly colors?: ColorSettings;
  };
}

export interface ScatterVisualizationDefinition {
  readonly schemaVersion: 1;
  readonly type: 'SCATTER';
  readonly roles: {
    readonly x: string;
    readonly y: string;
    readonly series?: string;
    readonly size?: string;
  };
  readonly display: CartesianBaseDisplay;
}

export type VisualizationDefinition =
  | TableVisualizationDefinition
  | NumberVisualizationDefinition
  | BarVisualizationDefinition
  | LineVisualizationDefinition
  | AreaVisualizationDefinition
  | PieVisualizationDefinition
  | ScatterVisualizationDefinition;

export type VisualizationType = VisualizationDefinition['type'];

export interface ChartDraft {
  readonly title: string;
  readonly description: string | null;
  readonly collectionId: string;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly outputSchema: readonly OutputColumn[];
  readonly parameterValues: Readonly<Record<string, ParameterValue>>;
}

export interface ActiveChartResult {
  readonly columns: readonly OutputColumn[];
  readonly rows: readonly (readonly ParameterValue[])[];
  readonly rowCount: number;
  readonly byteCount: number;
  readonly truncated: boolean;
}

export interface CanonicalChart {
  readonly id: string;
  readonly organizationId: string;
  readonly collectionId: string;
  readonly ownerIdentityId: string;
  readonly title: string;
  readonly description: string | null;
  readonly provenance: 'MANUAL' | 'CHAT' | 'LEGACY';
  readonly currentRevisionNumber: number;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly outputSchema: readonly OutputColumn[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChartSummary {
  readonly id: string;
  readonly collectionId: string;
  readonly title: string;
  /**
   * Core has always sent this on the list endpoint and the browser threw it
   * away, which is why three charts called "… temperature by machine —
   * 2026-09-02" rendered as three identical rows. It is the only thing that
   * tells them apart without opening each one.
   */
  readonly description: string | null;
  readonly provenance: CanonicalChart['provenance'];
  readonly currentRevisionNumber: number;
  readonly updatedAt: string;
}

export interface ChartRevision {
  readonly chartId: string;
  readonly revisionNumber: number;
  readonly title: string;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly outputSchema: readonly OutputColumn[];
  readonly createdAt: string;
  readonly restoredFromRevisionNumber: number | null;
}

export interface ChartCapability {
  readonly type: VisualizationType;
  readonly roles: readonly string[];
  readonly displaySettings: readonly string[];
}

export interface ChartPreview extends ActiveChartResult {
  readonly runId: string;
}

export type CreateCanonicalChartInput = ChartDraft;

export function createDefaultVisualization(type: VisualizationType): VisualizationDefinition {
  switch (type) {
    case 'TABLE':
      return {
        schemaVersion: 1,
        type,
        roles: { columns: [] },
        display: { rowDensity: 'DEFAULT', enableSearch: true, pageSize: 50 },
      };
    case 'NUMBER':
      return {
        schemaVersion: 1,
        type,
        roles: { measure: '' },
        display: {
          showTitle: true,
          showValue: true,
          valueFormatting: { style: 'AUTO', compact: false },
        },
      };
    case 'PIE':
      return {
        schemaVersion: 1,
        type,
        roles: { measure: '', breakout: '' },
        display: {
          variant: 'PIE',
          showLegend: true,
          showLabels: false,
          percentagePlacement: 'OFF',
          minimumSlicePercentage: 2.5,
          donutRadius: 0.65,
        },
      };
    case 'BAR':
      return {
        schemaVersion: 1,
        type,
        roles: { category: '', measures: [] },
        display: {
          orientation: 'VERTICAL',
          stacking: 'NONE',
          showLegend: true,
          showLabels: false,
          gridlines: true,
        },
      };
    case 'SCATTER':
      return {
        schemaVersion: 1,
        type,
        roles: { x: '', y: '' },
        display: {
          showLegend: true,
          showLabels: false,
          pointSize: 60,
          opacity: 0.8,
          gridlines: true,
        },
      };
    case 'LINE':
      return {
        schemaVersion: 1,
        type,
        roles: { x: '', measures: [] },
        display: {
          showLegend: true,
          showLabels: false,
          interpolation: 'LINEAR',
          markers: true,
          lineStyle: 'SOLID',
          missingValueHandling: 'GAP',
          gridlines: true,
        },
      };
    case 'AREA':
      return {
        schemaVersion: 1,
        type,
        roles: { x: '', measures: [] },
        display: {
          showLegend: true,
          showLabels: false,
          stacking: 'NONE',
          opacity: 0.7,
          missingValueHandling: 'GAP',
          gridlines: true,
        },
      };
  }
}

export function createEmptyVisualQuery(context: QueryContext): VisualQueryDefinition {
  return {
    schemaVersion: 1,
    mode: 'VISUAL',
    context,
    parameters: [],
    source: { table: { ...context, table: '' }, alias: 'source' },
    joins: [],
    projections: [],
    customExpressions: [],
    filters: [],
    aggregations: [],
    breakouts: [],
    postAggregationFilters: [],
    orderBy: [],
  };
}

export function field(relation: string, name: string): FieldExpression {
  return { kind: 'FIELD', relation, field: name };
}
