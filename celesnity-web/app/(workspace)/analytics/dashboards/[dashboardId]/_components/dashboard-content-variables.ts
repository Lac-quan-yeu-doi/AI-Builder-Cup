import type { DashboardFilterMapping } from '@/src/entities/models/dashboard';

export function renderDashboardContentVariables(
  source: string,
  cardId: string,
  mappings: readonly DashboardFilterMapping[],
  values: Readonly<Record<string, unknown>>,
  encode = false,
): string {
  const variables = new Map(
    mappings.flatMap((mapping) =>
      mapping.cardId === cardId && mapping.target.kind === 'CONTENT_VARIABLE'
        ? [[mapping.target.variableName, values[mapping.filterId]] as const]
        : [],
    ),
  );
  return source.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_-]{0,63})\s*\}\}/g, (token, name: string) => {
    if (!variables.has(name)) return token;
    const value = variables.get(name);
    const rendered = Array.isArray(value)
      ? value.join(', ')
      : value === null || value === undefined
        ? ''
        : String(value);
    return encode ? encodeURIComponent(rendered) : rendered;
  });
}
