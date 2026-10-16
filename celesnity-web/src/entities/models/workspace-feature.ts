export const workspaceFeatures = [
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

export type WorkspaceFeature = (typeof workspaceFeatures)[number];

export function isWorkspaceFeature(value: string): value is WorkspaceFeature {
  return (workspaceFeatures as readonly string[]).includes(value);
}

/**
 * Dispatched on `window` when the server refuses a request because the caller
 * lacks a workspace feature. The workspace shell renders from the access it last
 * verified, so a denial is its cue that the access changed and must be re-read.
 */
export const WORKSPACE_ACCESS_DENIED_EVENT = 'celesnity:workspace-access-denied';
