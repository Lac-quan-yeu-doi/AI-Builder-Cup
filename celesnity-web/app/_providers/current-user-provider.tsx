'use client';

import { createContext, useContext, type ReactNode } from 'react';

const CurrentUserContext = createContext<string | undefined>(undefined);

interface CurrentUserProviderProps {
  readonly userId: string;
  // Optional (not just typed loosely): React.createElement's 3-argument
  // form — used everywhere this provider wraps a test/rerender tree — passes
  // children positionally rather than as a prop key, so a required
  // `children` field here would make TypeScript reject every one of those
  // call sites even though children are always actually supplied at runtime.
  readonly children?: ReactNode;
}

/** Makes the real, server-verified session subject available to the client tree. */
export function CurrentUserProvider({ userId, children }: CurrentUserProviderProps) {
  return <CurrentUserContext.Provider value={userId}>{children}</CurrentUserContext.Provider>;
}

/** The signed-in user's id. Throws if rendered outside `CurrentUserProvider`. */
export function useCurrentUserId(): string {
  const value = useContext(CurrentUserContext);
  if (value === undefined) {
    throw new Error('useCurrentUserId must be used within a CurrentUserProvider');
  }
  return value;
}
