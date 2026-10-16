export const WORKSPACE_FEATURES = [
  'HOME',
  'CONNECTIONS',
  'STREAMING',
  'DEVICES',
  'SOURCE_SCHEMA',
  'CRAWLER',
  'PIPELINES',
  'EXECUTIONS',
  'AUTOMATIONS',
  'CATALOG_DATABASES',
  'CATALOG_TABLES',
  'PLANT_MODEL',
  'QUERY',
  'ANALYTICS',
  'DOCUMENTS',
  'GUIDE',
  'ADMINISTRATION',
] as const;

export type WorkspaceFeature = (typeof WORKSPACE_FEATURES)[number];

export function isWorkspaceFeature(value: string): value is WorkspaceFeature {
  return (WORKSPACE_FEATURES as readonly string[]).includes(value);
}

export function unrestrictedWorkspaceFeatures(role: string): boolean {
  return role === 'PLATFORM_ADMIN' || role === 'ORG_OWNER' || role === 'ORG_ADMIN';
}
