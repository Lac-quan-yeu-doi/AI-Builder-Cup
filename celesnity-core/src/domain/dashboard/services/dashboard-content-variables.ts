import type { DashboardCard } from '@domain/dashboard/models/dashboard-card';

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_-]{0,63})\s*\}\}/g;

export function dashboardContentVariables(card: DashboardCard): readonly string[] {
  if (card.kind === 'CHART') return [];
  const content =
    card.kind === 'HEADING'
      ? card.content.text
      : card.kind === 'TEXT'
        ? card.content.markdown
        : `${card.content.label}\n${card.content.url}`;
  return [...new Set([...content.matchAll(VARIABLE_PATTERN)].map((match) => match[1]!))];
}
