import type {
  DashboardFilterSemanticType,
  DashboardFilterTarget,
} from '@domain/dashboard/models/dashboard-filter';

export type DashboardFilterTargetMetadata = DashboardFilterTarget & {
  readonly semanticType: DashboardFilterSemanticType;
};

export function isDashboardFilterTargetCompatible(
  filterType: DashboardFilterSemanticType,
  target: DashboardFilterTargetMetadata,
): boolean {
  if (target.kind === 'FIELD' && !target.fieldId.trim()) return false;
  if (target.kind === 'NATIVE_QUERY_VARIABLE' && !target.variableKey.trim()) return false;
  if (target.kind === 'CONTENT_VARIABLE' && !target.variableName.trim()) return false;
  if (filterType === target.semanticType) return true;
  if (filterType === 'TIME_GROUPING' && target.semanticType === 'DATE_PICKER') return true;
  return filterType === 'TEXT_CATEGORY' && ['LOCATION', 'ID'].includes(target.semanticType);
}
