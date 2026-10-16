import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadWorkspaceAccess } from '@/di/server-auth';
import { sessionCookieName } from '@/src/entities/models/session';
import { firstVisibleWorkspaceDestination } from '@/app/_components/layout/workspace-navigation';

// The workspace opens on the assistant rather than on a connector list: asking
// a question is what a visitor came to do, and the set-up screens are one click
// away in the sidebar for the visit where they are the point.
export default async function HomePage() {
  const session = (await cookies()).get(sessionCookieName())?.value;
  if (session === undefined) redirect('/login');
  let destination = '/chat';
  try {
    const visibleFeatures = await loadWorkspaceAccess(session);
    destination = firstVisibleWorkspaceDestination(visibleFeatures)?.href ?? '/chat';
  } catch {
    // The workspace shell owns the retryable, fail-closed policy error state.
  }
  redirect(destination);
}
