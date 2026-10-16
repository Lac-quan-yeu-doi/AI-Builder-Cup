import 'server-only';

import { requiredEnvironment } from '@/src/infrastructure/auth/firebase-admin-auth';
import { isWorkspaceFeature, type WorkspaceFeature } from '@/src/entities/models/workspace-feature';

export async function loadWorkspaceAccess(
  session: string,
  signal?: AbortSignal,
): Promise<readonly WorkspaceFeature[] | null> {
  const base = requiredEnvironment('CORE_API_URL').replace(/\/+$/u, '');
  const response = await fetch(`${base}/administration/me`, {
    headers: { Authorization: `Bearer ${session}` },
    cache: 'no-store',
    redirect: 'error',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
      : AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Workspace access policy is unavailable.');
  const value: unknown = await response.json();
  if (typeof value !== 'object' || value === null || !('visibleFeatures' in value)) {
    throw new Error('Invalid workspace access policy.');
  }
  if (value.visibleFeatures === null) return null;
  if (
    !Array.isArray(value.visibleFeatures) ||
    !value.visibleFeatures.every(
      (feature): feature is WorkspaceFeature =>
        typeof feature === 'string' && isWorkspaceFeature(feature),
    )
  ) {
    throw new Error('Invalid workspace access policy.');
  }
  return value.visibleFeatures;
}
