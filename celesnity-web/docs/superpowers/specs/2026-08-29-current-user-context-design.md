# Design: Expose the real authenticated user id to client components

Status: approved by user, ready for implementation planning.

## 1. Problem

`celesnity-web` verifies the real session subject server-side today —
`verifyServerSessionSubject` (`src/infrastructure/auth/server-session-subject.ts`)
is called from `/api/agent/[...path]/route.ts` on every request, and its
result (`subject`) unconditionally overwrites whatever `X-Caller-Id` a client
sends before forwarding to `minder-serve` (`headers.set('X-Caller-Id',
subject)` — `Headers.set` replaces, so the real server-side authorization
boundary is intact regardless of what the client claims).

But nothing exposes that verified id to the React client tree. Three places
currently stand in for it with the literal string `'local-user'` — confirmed
as the complete set via a repo-wide grep, not an example:

- `app/(workspace)/chat/_components/chat-screen.tsx:96` — `DEFAULT_USER_ID`,
  used for `sendMessage`, `streamEvents`, `getSessionTranscript`,
  `getRoomMetrics`, `getRunManifest`, `getRunTrace`, `getRunValidation`.
- `app/_stores/chat-sessions.store.ts:114` — `CHAT_STORAGE_USER_ID`, used by
  `workspace-shell.tsx` to hydrate the chat sessions store.
- `src/infrastructure/repositories/agent-api-chart-encoding-suggestion.repository.ts:30`
  — `CALLER_ID`, sent as `X-Caller-Id` for every chart-encoding-suggestion
  call; this call chain (React → controller → use-case → repository) has no
  `userId` parameter anywhere today, unlike chat's `sendMessage`.

**Impact** (server-side authorization is not affected — this is a client-side
gap only):

- `chat-storage.ts` keys `localStorage` as `celesnity.chat.sessions.${userId}`.
  Since every real user shares the literal `'local-user'`, anyone using the
  same browser profile (most concretely: a shared/public workstation) sees
  the previous user's cached session titles on load, until real server data
  overwrites it.
- Untitled chat rooms all get the fallback display name `chat-local-user`
  instead of something per-user.
- `chart-encoding-suggestion` calls carry no real per-user attribution at
  all in minder-agent's own records.

## 2. Design

### Architecture

Resolve the real user id once, server-side, at `app/(workspace)/layout.tsx`
— it already wraps every workspace route as a Server Component. It reads
the session cookie via `next/headers`, calls the existing
`verifyServerSessionSubject` (no new auth logic), and passes the result down
through a small React Context. Every place currently hardcoding
`'local-user'` reads from a `useCurrentUserId()` hook instead.

### Components

**New `app/_providers/current-user-provider.tsx`** — a plain Context, not
Zustand: this is one immutable string resolved once server-side per
request, not client-mutated state.

```tsx
'use client';
import { createContext, useContext, type ReactNode } from 'react';

const CurrentUserContext = createContext<string | undefined>(undefined);

export function CurrentUserProvider({
  userId,
  children,
}: {
  readonly userId: string;
  readonly children: ReactNode;
}) {
  return <CurrentUserContext.Provider value={userId}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUserId(): string {
  const value = useContext(CurrentUserContext);
  if (value === undefined) {
    throw new Error('useCurrentUserId must be used within a CurrentUserProvider');
  }
  return value;
}
```

**Modify `app/(workspace)/layout.tsx`** — becomes `async`, reads the session
cookie, calls `verifyServerSessionSubject`, wraps `children` in
`<CurrentUserProvider userId={userId}>`; redirects to `/login` on failure
(mirrors `proxy.ts`'s own redirect shape — `returnTo` isn't preserved here
since a layout has no natural "current path" without also reading
`headers()`, and this is a defensive fallback for an edge case `proxy.ts`
already mostly prevents, not the primary login redirect path).

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { verifyServerSessionSubject } from '@/di/server-auth';
import { SESSION_COOKIE } from '@/src/entities/models/session';
import { CurrentUserProvider } from '@/app/_providers/current-user-provider';
import { WorkspaceShell } from '@/app/_components/layout/workspace-shell';

export default async function WorkspaceLayout({ children }: { readonly children: ReactNode }) {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (session === undefined) redirect('/login');

  let userId: string;
  try {
    userId = await verifyServerSessionSubject(session);
  } catch {
    redirect('/login');
  }

  return (
    <CurrentUserProvider userId={userId}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </CurrentUserProvider>
  );
}
```

**Three replaced call sites** (the complete set, confirmed by grep):

1. `chat-screen.tsx`: remove `DEFAULT_USER_ID`, call `useCurrentUserId()` at
   the top of the component, use that value everywhere `DEFAULT_USER_ID` was
   used.
2. `chat-sessions.store.ts` / `workspace-shell.tsx`: remove the exported
   `CHAT_STORAGE_USER_ID` constant; `workspace-shell.tsx` calls
   `useCurrentUserId()` and passes that to `useChatSessionsStore.getState().hydrate(userId)`.
3. `agent-api-chart-encoding-suggestion.repository.ts`: remove `CALLER_ID`.
   `ChartEncodingSuggestionInput` (`src/entities/models/chart-encoding-suggestion.ts`)
   gains a `readonly userId: string` field — consistent with
   `SendMessageInput`'s existing convention of carrying `userId` as part of
   the input object rather than a separate parameter. Threaded through:
   - `SuggestChartEncodingsUseCase` — no signature change needed (it already
     forwards the whole `input` object to `repository.suggest(input)`).
   - `SuggestChartEncodingsController` — no signature change needed for the
     same reason (parses `input: unknown` via `suggestChartEncodingsInputSchema`,
     which needs the new field added).
   - `chart.schemas.ts`'s `suggestChartEncodingsInputSchema` — add
     `userId: z.string().min(1)`.
   - `chart-sidebar.tsx`'s two call sites (`suggestChartEncodings({...})`) —
     add `userId: useCurrentUserId()`.

### Error handling

- Missing/invalid session cookie at the layout: `redirect('/login')`.
  `proxy.ts`'s middleware only checks cookie _presence_
  (`request.cookies.has(SESSION_COOKIE)`), not validity, so this closes that
  gap defensively — an expired/tampered cookie that passes the middleware
  check still gets caught here before any workspace UI renders.
- `CELESNITY_AUTH_MODE=local-development` needs no special-casing —
  `verifyServerSessionSubject` already branches on it internally
  (`verifyLocalDevelopmentSession`).
- `useCurrentUserId()` throwing outside `CurrentUserProvider` should never
  happen in practice (the provider is mounted at the root workspace layout,
  above every consumer) — the throw exists as a programmer-error guard, not
  a handled runtime case.

## 3. What doesn't change

- The actual server-side authorization boundary (`/api/agent`'s
  `X-Caller-Id` overwrite) — already correct, untouched by this work.
- `verifyServerSessionSubject` itself — reused as-is, no new auth logic.
- Any repository/use-case/controller signature for chat (`sendMessage`,
  `streamEvents`, etc.) — they already accept `userId`; only the _caller_
  (`chat-screen.tsx`) changes what it passes.

## 4. Testing

- New unit test for `CurrentUserProvider`/`useCurrentUserId` — throws
  outside the provider, returns the given value inside.
- Update any existing test that constructs `chat-screen.tsx` or
  `chart-sidebar.tsx` behavior around the hardcoded `'local-user'` value, if
  any assert on it directly (check during implementation).
- Update `chart.schemas.ts`'s test coverage (if any) for the new required
  `userId` field on `suggestChartEncodingsInputSchema`.
- No test currently exists for `workspace-shell.tsx`'s hydrate call or the
  workspace layout itself — add a minimal one if the layout's redirect
  behavior is easy to test in isolation; otherwise note as a gap rather than
  force a heavier integration test.

## 5. Acceptance criteria

- Every occurrence of the literal `'local-user'` is removed from
  `app/` and `src/` (excluding this spec file and any test fixture that
  deliberately uses it as a stub value).
- Two different real logged-in users on two different browsers see their
  own, distinct chat session lists and cached `localStorage` state.
- `chart-encoding-suggestion` calls carry the real caller's user id.
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all
  pass with no new failures beyond whatever pre-existing ones already exist
  on this branch.
