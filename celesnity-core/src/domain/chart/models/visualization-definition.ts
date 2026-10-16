import { ChartError } from '@domain/chart/errors/chart.errors';

export type OutputColumnFamily = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP' | 'UNKNOWN';

export interface OutputColumn {
  readonly name: string;
  readonly type: string;
  readonly family: OutputColumnFamily;
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

export type VisualizationDefinition =
  | TableVisualization
  | NumberVisualization
  | BarVisualization
  | LineVisualization
  | AreaVisualization
  | PieVisualization
  | ScatterVisualization;

export interface TableVisualization {
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

export interface NumberVisualization {
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

export interface BarVisualization {
  readonly schemaVersion: 1;
  readonly type: 'BAR';
  readonly roles: {
    readonly category: string;
    readonly measures: readonly string[];
    readonly breakout?: string;
  };
  readonly display: {
    readonly orientation?: 'VERTICAL' | 'HORIZONTAL';
    readonly stacking?: 'NONE' | 'STACKED' | 'PERCENT';
    readonly showLegend?: boolean;
    readonly showLabels?: boolean;
    readonly axes?: { readonly x?: AxisSettings; readonly y?: AxisSettings };
    readonly colors?: ColorSettings;
    readonly valueFormatting?: ValueFormattingSettings;
    readonly gridlines?: boolean;
  };
}

export interface LineVisualization {
  readonly schemaVersion: 1;
  readonly type: 'LINE';
  readonly roles: {
    readonly x: string;
    readonly measures: readonly string[];
    readonly series?: string;
  };
  readonly display: {
    readonly showLegend?: boolean;
    readonly showLabels?: boolean;
    readonly interpolation?: 'LINEAR' | 'STEP' | 'SMOOTH';
    readonly markers?: boolean;
    readonly axes?: { readonly x?: AxisSettings; readonly y?: AxisSettings };
    readonly colors?: ColorSettings;
    readonly valueFormatting?: ValueFormattingSettings;
    readonly gridlines?: boolean;
    readonly lineStyle?: 'SOLID' | 'DASHED' | 'DOTTED';
    readonly missingValueHandling?: 'LINE' | 'ZERO' | 'GAP';
  };
}

export interface AreaVisualization {
  readonly schemaVersion: 1;
  readonly type: 'AREA';
  readonly roles: {
    readonly x: string;
    readonly measures: readonly string[];
    readonly series?: string;
  };
  readonly display: {
    readonly stacking?: 'NONE' | 'STACKED' | 'PERCENT';
    readonly showLegend?: boolean;
    readonly showLabels?: boolean;
    readonly opacity?: number;
    readonly axes?: { readonly x?: AxisSettings; readonly y?: AxisSettings };
    readonly colors?: ColorSettings;
    readonly valueFormatting?: ValueFormattingSettings;
    readonly gridlines?: boolean;
    readonly missingValueHandling?: 'LINE' | 'ZERO' | 'GAP';
  };
}

export interface PieVisualization {
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

export interface ScatterVisualization {
  readonly schemaVersion: 1;
  readonly type: 'SCATTER';
  readonly roles: {
    readonly x: string;
    readonly y: string;
    readonly series?: string;
    readonly size?: string;
  };
  readonly display: {
    readonly showLegend?: boolean;
    readonly showLabels?: boolean;
    readonly pointSize?: number;
    readonly opacity?: number;
    readonly axes?: { readonly x?: AxisSettings; readonly y?: AxisSettings };
    readonly colors?: ColorSettings;
    readonly valueFormatting?: ValueFormattingSettings;
    readonly gridlines?: boolean;
  };
}

export function validateVisualizationDefinition(
  definition: VisualizationDefinition,
  outputSchema: readonly OutputColumn[],
): void {
  if (definition.schemaVersion !== 1) {
    throw ChartError.unsupportedChartType('Only schema version 1 is supported.');
  }
  const columns = new Map<string, OutputColumn>();
  for (const column of outputSchema) {
    if (columns.has(column.name)) {
      throw ChartError.bindingInvalid(`Output field ${column.name} is duplicated.`);
    }
    columns.set(column.name, column);
  }
  const requireColumn = (name: string): OutputColumn => {
    const column = columns.get(name);
    if (!column) throw ChartError.bindingInvalid(`Output field ${name} does not exist.`);
    return column;
  };
  const requireNumeric = (name: string): void => {
    if (requireColumn(name).family !== 'NUMBER') {
      throw ChartError.bindingInvalid(`Output field ${name} must be numeric.`);
    }
  };
  const requireManyNumeric = (names: readonly string[]): void => {
    if (names.length === 0) throw ChartError.bindingInvalid('At least one measure is required.');
    if (new Set(names).size !== names.length) {
      throw ChartError.bindingInvalid('Measure fields must be unique.');
    }
    names.forEach(requireNumeric);
  };

  switch (definition.type) {
    case 'TABLE':
      if (definition.roles.columns.length === 0)
        throw ChartError.bindingInvalid('At least one column is required.');
      definition.roles.columns.forEach(requireColumn);
      if (new Set(definition.roles.columns).size !== definition.roles.columns.length) {
        throw ChartError.bindingInvalid('Table columns must be unique.');
      }
      validateTableDisplay(definition.display);
      return;
    case 'NUMBER':
      requireNumeric(definition.roles.measure);
      validateEnum(
        definition.display.comparison?.type,
        ['NONE', 'PREVIOUS_VALUE', 'PERCENT_CHANGE', 'ABSOLUTE_CHANGE'],
        'Comparison type',
      );
      validateEnum(
        definition.display.comparisonStyle,
        ['DELTA', 'PERCENT', 'ICON'],
        'Comparison style',
      );
      validateDecimalPlaces(definition.display.decimalPlaces);
      if (definition.display.valueFormatting) {
        validateValueFormatting(definition.display.valueFormatting);
      }
      if (definition.display.comparison?.field) requireNumeric(definition.display.comparison.field);
      return;
    case 'BAR':
      requireColumn(definition.roles.category);
      requireManyNumeric(definition.roles.measures);
      if (definition.roles.breakout) requireColumn(definition.roles.breakout);
      validateEnum(definition.display.orientation, ['VERTICAL', 'HORIZONTAL'], 'Bar orientation');
      validateEnum(definition.display.stacking, ['NONE', 'STACKED', 'PERCENT'], 'Bar stacking');
      validateCartesianDisplay(definition.display);
      return;
    case 'LINE':
    case 'AREA':
      requireColumn(definition.roles.x);
      requireManyNumeric(definition.roles.measures);
      if (definition.roles.series) requireColumn(definition.roles.series);
      if (definition.type === 'LINE') {
        validateEnum(
          definition.display.interpolation,
          ['LINEAR', 'STEP', 'SMOOTH'],
          'Interpolation',
        );
        validateEnum(definition.display.lineStyle, ['SOLID', 'DASHED', 'DOTTED'], 'Line style');
      }
      validateEnum(
        definition.display.missingValueHandling,
        ['LINE', 'ZERO', 'GAP'],
        'Missing value handling',
      );
      if (definition.type === 'AREA') {
        validateEnum(definition.display.stacking, ['NONE', 'STACKED', 'PERCENT'], 'Area stacking');
      }
      validateCartesianDisplay(definition.display);
      return;
    case 'PIE':
      requireNumeric(definition.roles.measure);
      requireColumn(definition.roles.breakout);
      validateDecimalPlaces(definition.display.decimalPlaces);
      validateEnum(definition.display.variant, ['PIE', 'DONUT'], 'Pie variant');
      validateEnum(
        definition.display.percentagePlacement,
        ['OFF', 'IN_LEGEND', 'ON_CHART', 'BOTH'],
        'Percentage placement',
      );
      if (
        definition.display.minimumSlicePercentage !== undefined &&
        (definition.display.minimumSlicePercentage < 0 ||
          definition.display.minimumSlicePercentage > 100)
      ) {
        throw ChartError.bindingInvalid('Minimum slice percentage must be between 0 and 100.');
      }
      if (
        definition.display.donutRadius !== undefined &&
        (definition.display.donutRadius < 0 || definition.display.donutRadius > 1)
      ) {
        throw ChartError.bindingInvalid('Donut radius must be between 0 and 1.');
      }
      validateColors(definition.display.colors);
      return;
    case 'SCATTER':
      requireNumeric(definition.roles.x);
      requireNumeric(definition.roles.y);
      if (definition.roles.series) requireColumn(definition.roles.series);
      if (definition.roles.size) requireNumeric(definition.roles.size);
      validateCartesianDisplay(definition.display);
      return;
  }
}

function validateEnum<T extends string>(
  value: T | undefined,
  allowed: readonly T[],
  label: string,
): void {
  if (value !== undefined && !allowed.includes(value)) {
    throw ChartError.bindingInvalid(`${label} is invalid.`);
  }
}

function validateDecimalPlaces(value: number | undefined): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 10)) {
    throw ChartError.bindingInvalid('Decimal places must be an integer from 0 to 10.');
  }
}

function validateTableDisplay(display: TableVisualization['display']): void {
  validateEnum(display.rowDensity, ['COMPACT', 'DEFAULT', 'SPACIOUS'], 'Row density');
  if (
    display.pageSize !== undefined &&
    (!Number.isInteger(display.pageSize) || display.pageSize < 1 || display.pageSize > 1_000)
  ) {
    throw ChartError.bindingInvalid('Table page size must be an integer from 1 to 1000.');
  }
  for (const formatting of Object.values(display.columnFormatting ?? {})) {
    validateDecimalPlaces(formatting.decimalPlaces);
    validateEnum(
      formatting.style,
      ['AUTO', 'NUMBER', 'CURRENCY', 'PERCENT', 'SCIENTIFIC'],
      'Column formatting style',
    );
  }
}

function validateValueFormatting(display: ValueFormattingSettings): void {
  if (
    display.style !== undefined &&
    !['AUTO', 'NUMBER', 'CURRENCY', 'PERCENT', 'SCIENTIFIC'].includes(display.style)
  ) {
    throw ChartError.bindingInvalid('Value formatting style is invalid.');
  }
  validateDecimalPlaces(display.decimalPlaces);
  if (display.currency !== undefined && !/^[A-Z]{3}$/u.test(display.currency)) {
    throw ChartError.bindingInvalid('Currency must be a three-letter ISO code.');
  }
}

function validateCartesianDisplay(display: {
  readonly axes?: { readonly x?: AxisSettings; readonly y?: AxisSettings };
  readonly colors?: ColorSettings;
  readonly valueFormatting?: ValueFormattingSettings;
  readonly opacity?: number;
  readonly pointSize?: number;
}): void {
  validateColors(display.colors);
  if (display.valueFormatting) validateValueFormatting(display.valueFormatting);
  for (const axis of [display.axes?.x, display.axes?.y]) validateAxis(axis);
  if (
    display.opacity !== undefined &&
    (display.opacity < 0 || display.opacity > 1 || !Number.isFinite(display.opacity))
  ) {
    throw ChartError.bindingInvalid('Opacity must be between 0 and 1.');
  }
  if (
    display.pointSize !== undefined &&
    (!Number.isFinite(display.pointSize) || display.pointSize <= 0)
  ) {
    throw ChartError.bindingInvalid('Point size must be positive.');
  }
}

function validateAxis(axis: AxisSettings | undefined): void {
  if (!axis) return;
  if (axis.scale !== undefined && !['LINEAR', 'LOG', 'POW'].includes(axis.scale)) {
    throw ChartError.bindingInvalid('Axis scale is invalid.');
  }
  if (axis.min !== undefined && !Number.isFinite(axis.min)) {
    throw ChartError.bindingInvalid('Axis minimum must be finite.');
  }
  if (axis.max !== undefined && !Number.isFinite(axis.max)) {
    throw ChartError.bindingInvalid('Axis maximum must be finite.');
  }
  if (axis.min !== undefined && axis.max !== undefined && axis.min >= axis.max) {
    throw ChartError.bindingInvalid('Axis minimum must be lower than maximum.');
  }
}

function validateColors(colors: ColorSettings | undefined): void {
  if (!colors?.byField) return;
  for (const color of Object.values(colors.byField)) {
    if (!/^#[0-9a-f]{6}$/iu.test(color)) {
      throw ChartError.bindingInvalid('Colors must be six-digit hexadecimal values.');
    }
  }
}
