import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { loadWorkspaceAccess, verifyServerSessionSubject } from '@/di/server-auth';
import { sessionCookieName } from '@/src/entities/models/session';
import { CurrentUserProvider } from '@/app/_providers/current-user-provider';
import { WorkspaceShell } from '@/app/_components/layout/workspace-shell';
import { WorkspaceAccessProvider } from '@/app/_providers/workspace-access-provider';
import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';

interface WorkspaceLayoutProps {
  readonly children: ReactNode;
}

// `proxy.ts` (the middleware) already redirects to `/login` when the session
// cookie is entirely absent, but only checks *presence*, not validity — an
// expired or tampered cookie passes that check and lands here. Redirecting
// again on a verification failure closes that gap before any workspace UI
// renders, rather than surfacing a thrown error from `verifyServerSessionSubject`.
export default async function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const session = (await cookies()).get(sessionCookieName())?.value;
  if (session === undefined) redirect('/login');

  let userId: string;
  let visibleFeatures: readonly WorkspaceFeature[] | null = null;
  let accessError = false;
  try {
    userId = await verifyServerSessionSubject(session);
    visibleFeatures = await loadWorkspaceAccess(session);
  } catch {
    try {
      userId = await verifyServerSessionSubject(session);
      accessError = true;
    } catch {
      redirect('/login');
    }
  }

  return (
    <CurrentUserProvider userId={userId}>
      <WorkspaceAccessProvider initialError={accessError} initialVisibleFeatures={visibleFeatures}>
        <WorkspaceShell>{children}</WorkspaceShell>
      </WorkspaceAccessProvider>
    </CurrentUserProvider>
  );
}
