import { ChartError } from '@domain/chart/errors/chart.errors';
import type { QueryParameter, QueryParameterType } from '@domain/chart/models/query-definition';

/**
 * Renders typed Native SQL parameters without interpolating raw user text.
 * `{{name}}` is required (unless it appears inside an optional `[[...]]`
 * block). Optional blocks are removed when any contained parameter is absent.
 */
export function renderParameters(
  sql: string,
  parameters: readonly QueryParameter[],
  values: Readonly<Record<string, unknown>> = {},
): string {
  const definitions = new Map(parameters.map((parameter) => [parameter.name, parameter]));
  for (const key of Object.keys(values)) {
    if (!definitions.has(key)) throw ChartError.queryInvalid(`Unknown parameter ${key}.`);
  }

  const withOptionalBlocks = sql.replace(/\[\[([\s\S]*?)\]\]/gu, (_whole, body: string) => {
    const names = parameterNames(body);
    const missing = names.some((name) => !hasValue(values, name));
    if (missing) return '';
    return renderTemplate(body, definitions, values);
  });
  return renderTemplate(withOptionalBlocks, definitions, values);
}

function renderTemplate(
  template: string,
  definitions: ReadonlyMap<string, QueryParameter>,
  values: Readonly<Record<string, unknown>>,
): string {
  const rendered = template.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/gu,
    (_whole, name: string) => {
      const definition = definitions.get(name);
      if (!definition) throw ChartError.queryInvalid(`Unknown parameter ${name}.`);
      if (!hasValue(values, name)) {
        if (definition.required) throw ChartError.queryInvalid(`Parameter ${name} is required.`);
        throw ChartError.queryInvalid(`Optional parameter ${name} must be inside [[...]].`);
      }
      return renderValue(definition.type, values[name]);
    },
  );
  if (/\{\{|\}\}/u.test(rendered))
    throw ChartError.queryInvalid('Malformed parameter placeholder.');
  return rendered;
}

function parameterNames(template: string): readonly string[] {
  return [...template.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/gu)].map(
    (match) => match[1]!,
  );
}

function hasValue(values: Readonly<Record<string, unknown>>, name: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(values, name) &&
    values[name] !== null &&
    values[name] !== undefined
  );
}

function renderValue(type: QueryParameterType, value: unknown): string {
  switch (type) {
    case 'NUMBER':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw ChartError.queryInvalid('NUMBER parameters must be finite numbers.');
      }
      return String(value);
    case 'BOOLEAN':
      if (typeof value !== 'boolean')
        throw ChartError.queryInvalid('BOOLEAN parameters must be booleans.');
      return value ? 'TRUE' : 'FALSE';
    case 'DATE':
      return `DATE ${quoteString(value)}`;
    case 'TIMESTAMP':
      return `TIMESTAMP ${quoteString(value)}`;
    case 'STRING':
      return quoteString(value);
  }
}

function quoteString(value: unknown): string {
  if (typeof value !== 'string') throw ChartError.queryInvalid('Text parameters must be strings.');
  if (value.includes('\0'))
    throw ChartError.queryInvalid('Parameter contains an invalid character.');
  return `'${value.replaceAll("'", "''")}'`;
}
