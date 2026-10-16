'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

import { getInjection } from '@/di/container';
import {
  WORKSPACE_ACCESS_DENIED_EVENT,
  type WorkspaceFeature,
} from '@/src/entities/models/workspace-feature';

const loadSession = getInjection('LoadAdministrationSessionController');

/**
 * How long a verified access is trusted before a returning tab re-reads it in
 * the background. Core enforces every request on its own, so this only bounds
 * how long the navigation can lag behind a change an administrator made — it
 * never widens what the user can reach.
 */
const ACCESS_FRESH_FOR_MS = 60_000;

/**
 * A screen that keeps calling an endpoint it is denied would otherwise turn
 * every one of those responses into another session read.
 */
const DENIAL_RECHECK_GAP_MS = 5_000;

interface WorkspaceAccessValue {
  readonly visibleFeatures: readonly WorkspaceFeature[] | null;
  readonly status: 'ready' | 'loading' | 'error';
  readonly reload: () => Promise<void>;
}

const WorkspaceAccessContext = createContext<WorkspaceAccessValue>({
  visibleFeatures: null,
  status: 'ready',
  reload: async () => undefined,
});

interface WorkspaceAccessProviderProps {
  readonly children?: ReactNode;
  readonly initialVisibleFeatures: readonly WorkspaceFeature[] | null;
  readonly initialError?: boolean;
}

/**
 * Serves the access the server layout resolved, then keeps it current without
 * ever blocking a navigation on it. Blocking used to replace the destination
 * with the "access unavailable" screen and empty the sidebar on every click
 * until `/administration/me` answered.
 *
 * The access is re-read in the background on every navigation — so a feature an
 * administrator revoked or granted still shows up at the next click, as it did
 * when the check blocked — when the tab regains focus after a while, and when
 * the server denies a request for a missing feature.
 */
export function WorkspaceAccessProvider({
  children,
  initialVisibleFeatures,
  initialError = false,
}: WorkspaceAccessProviderProps) {
  const pathname = usePathname();
  const [visibleFeatures, setVisibleFeatures] = useState(initialVisibleFeatures);
  const [status, setStatus] = useState<'ready' | 'loading' | 'error'>(
    initialError ? 'error' : 'ready',
  );
  const checkedAt = useRef(0);
  const pendingCheck = useRef<Promise<void> | null>(null);
  const previousPathname = useRef(pathname);

  // The server layout verified the access this provider starts from.
  useEffect(() => {
    checkedAt.current = Date.now();
  }, []);

  const revalidate = useCallback((): Promise<void> => {
    // One read at a time: a burst of denials, or a navigation during a focus
    // check, all settle on the same answer.
    if (pendingCheck.current !== null) return pendingCheck.current;
    const check = (async () => {
      try {
        const session = await loadSession();
        setVisibleFeatures(session.visibleFeatures);
        setStatus('ready');
      } catch {
        // Keep the access already on screen: Core still refuses whatever the
        // user may have lost. Only a workspace with no verified access at all
        // has nothing to fall back on.
        setStatus((current) => (current === 'ready' ? 'ready' : 'error'));
      } finally {
        checkedAt.current = Date.now();
        pendingCheck.current = null;
      }
    })();
    pendingCheck.current = check;
    return check;
  }, []);

  const reload = useCallback(() => {
    setStatus('loading');
    return revalidate();
  }, [revalidate]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    void revalidate();
  }, [pathname, revalidate]);

  useEffect(() => {
    const onDenied = () => {
      if (Date.now() - checkedAt.current < DENIAL_RECHECK_GAP_MS) return;
      void revalidate();
    };
    const onFocus = () => {
      if (Date.now() - checkedAt.current > ACCESS_FRESH_FOR_MS) void revalidate();
    };
    window.addEventListener(WORKSPACE_ACCESS_DENIED_EVENT, onDenied);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener(WORKSPACE_ACCESS_DENIED_EVENT, onDenied);
      window.removeEventListener('focus', onFocus);
    };
  }, [revalidate]);

  return (
    <WorkspaceAccessContext.Provider value={{ visibleFeatures, status, reload }}>
      {children}
    </WorkspaceAccessContext.Provider>
  );
}

export function useWorkspaceAccess(): WorkspaceAccessValue {
  return useContext(WorkspaceAccessContext);
}
