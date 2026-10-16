# Current User Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the real, server-verified authenticated user id to client components via a React Context, and remove the three hardcoded `'local-user'` placeholders that currently stand in for it.

**Architecture:** `app/(workspace)/layout.tsx` (a Server Component) resolves the real user id once per request via the existing `verifyServerSessionSubject`, then wraps its children in a new `CurrentUserProvider`. Client components read it via `useCurrentUserId()` instead of a hardcoded constant.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-29-current-user-context-design.md`

## Global Constraints

- Every task must pass `npm run typecheck`, `npm run lint`, and `npm test` before being considered done (per `CLAUDE.md`'s quality gate).
- No `any`, no non-null assertions (`CLAUDE.md` rule 4).
- React never calls the API directly — this work only touches auth-context plumbing, not API calls, so this constraint isn't at risk, but don't introduce a new API call while touching these files.
- After all tasks: zero occurrences of the literal `'local-user'` remain in `app/` or `src/` (test fixtures that deliberately use it as a stub value are the sole exception — see Task 2).

---

### Task 1: `CurrentUserProvider` / `useCurrentUserId`

**Files:**

- Create: `app/_providers/current-user-provider.tsx`
- Test: `tests/unit/app/current-user-provider.test.ts`

**Interfaces:**

- Produces: `CurrentUserProvider({ userId: string, children: ReactNode })` (client component) and `useCurrentUserId(): string` (throws if called outside the provider) — both exported from `app/_providers/current-user-provider.tsx`. Task 2 and Task 3 consume both; Tasks 4–6 consume only `useCurrentUserId`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/app/current-user-provider.test.ts`:

```typescript
// @vitest-environment jsdom

import { createElement } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CurrentUserProvider, useCurrentUserId } from '@/app/_providers/current-user-provider';

describe('CurrentUserProvider / useCurrentUserId', () => {
  it('returns the userId given to the provider', () => {
    const { result } = renderHook(() => useCurrentUserId(), {
      wrapper: ({ children }) =>
        createElement(CurrentUserProvider, { userId: 'user-abc', children }),
    });
    expect(result.current).toBe('user-abc');
  });

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useCurrentUserId())).toThrow(
      'useCurrentUserId must be used within a CurrentUserProvider',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app/current-user-provider.test.ts`
Expected: FAIL with "Cannot find module '@/app/_providers/current-user-provider'"

- [ ] **Step 3: Write the implementation**

Create `app/_providers/current-user-provider.tsx`:

```tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';

const CurrentUserContext = createContext<string | undefined>(undefined);

interface CurrentUserProviderProps {
  readonly userId: string;
  readonly children: ReactNode;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/app/current-user-provider.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full quality gate**

Run: `npm run typecheck && npx eslint app/_providers/current-user-provider.tsx tests/unit/app/current-user-provider.test.ts`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add app/_providers/current-user-provider.tsx tests/unit/app/current-user-provider.test.ts
git commit -m "feat: add CurrentUserProvider/useCurrentUserId"
```

---

### Task 2: Wire the test helper to provide a current user by default

**Files:**

- Modify: `tests/support/render-ui.ts`

**Interfaces:**

- Consumes: `CurrentUserProvider` (Task 1).
- Produces: `renderUi(node)` now renders `node` inside `<CurrentUserProvider userId="local-user">` — every existing and future test using `renderUi` gets a working `useCurrentUserId()` for free. `'local-user'` is chosen deliberately as the stub value so it matches the two pre-existing assertions in `tests/unit/app/chat-screen.test.ts:213,217` that already expect `'local-user'` — this is the one legitimate place the literal survives (a test fixture, not production code).

- [ ] **Step 1: Update the render helper**

In `tests/support/render-ui.ts`, add the import:

```typescript
import { CurrentUserProvider } from '@/app/_providers/current-user-provider';
```

Update the doc comment and `renderUi` function (the comment currently says "The shared components need no provider" — that's no longer fully true):

```typescript
/**
 * Renders a subtree the way `app/(workspace)/layout.tsx` does — wrapped in
 * `CurrentUserProvider`, since any component under the workspace tree may
 * call `useCurrentUserId()`. `'local-user'` is an arbitrary but fixed stub
 * id; don't read meaning into it beyond "some signed-in user."
 *
 * Otherwise a thin wrapper over `render` that installs the browser APIs
 * jsdom does not implement and Radix reaches for on mount.
 */
export function renderUi(node: ReactNode): RenderResult {
  installBrowserStubs();
  return render(createElement(CurrentUserProvider, { userId: 'local-user', children: node }));
}
```

Add `createElement` to the existing `react` import at the top of the file (currently `import type { ReactNode } from 'react';` — needs a second, non-type import):

```typescript
import { createElement, type ReactNode } from 'react';
```

- [ ] **Step 2: Run the existing test suites that use `renderUi` to confirm nothing broke**

Run: `npx vitest run tests/unit/app/chat-screen.test.ts tests/unit/app/chart-sidebar.test.ts`
Expected: PASS — same pass count as before this change (these tests don't yet call `useCurrentUserId()` themselves; this step just confirms the wrapping itself doesn't break existing rendering).

- [ ] **Step 3: Commit**

```bash
git add tests/support/render-ui.ts
git commit -m "test: wrap renderUi in CurrentUserProvider"
```

---

### Task 3: Resolve the real user id in the workspace layout

**Files:**

- Modify: `app/(workspace)/layout.tsx`

**Interfaces:**

- Consumes: `CurrentUserProvider` (Task 1), `verifyServerSessionSubject` (from `@/di/server-auth`, pre-existing), `SESSION_COOKIE` (from `@/src/entities/models/session`, pre-existing).

- [ ] **Step 1: Replace the layout**

Current content of `app/(workspace)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';

import { WorkspaceShell } from '@/app/_components/layout/workspace-shell';

interface WorkspaceLayoutProps {
  readonly children: ReactNode;
}

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
```

Replace it with:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { verifyServerSessionSubject } from '@/di/server-auth';
import { SESSION_COOKIE } from '@/src/entities/models/session';
import { CurrentUserProvider } from '@/app/_providers/current-user-provider';
import { WorkspaceShell } from '@/app/_components/layout/workspace-shell';

interface WorkspaceLayoutProps {
  readonly children: ReactNode;
}

// `proxy.ts` (the middleware) already redirects to `/login` when the session
// cookie is entirely absent, but only checks *presence*, not validity — an
// expired or tampered cookie passes that check and lands here. Redirecting
// again on a verification failure closes that gap before any workspace UI
// renders, rather than surfacing a thrown error from `verifyServerSessionSubject`.
export default async function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
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

- [ ] **Step 2: Run the quality gate**

Run: `npm run typecheck && npx eslint 'app/(workspace)/layout.tsx'`
Expected: both clean. (TypeScript must accept `session` as narrowed to `string` after the `if (session === undefined) redirect('/login');` guard — `redirect`'s return type is `never`, so this narrows correctly with no cast needed. If it doesn't typecheck, do not add a non-null assertion — instead restructure as `if (session === undefined) { redirect('/login'); }` with an explicit block, which changes nothing about the runtime behavior but may help control-flow narrowing.)

- [ ] **Step 3: Manual verification (no automated test exists for this layout — see spec §4)**

Run: `npm run dev`, sign in, and confirm `/chat` (or any workspace route) still renders. This can't be fully automated without a running auth backend; if you want a test, the smallest useful one mocks `next/headers`'s `cookies` and `@/di/server-auth`'s `verifyServerSessionSubject` and asserts `redirect('/login')` is called when the cookie is missing — add it only if that mocking is straightforward in this codebase's existing Vitest setup (check `vitest.config.mts`'s `next/navigation`/`next/headers` mocking conventions first, e.g. how `tests/unit/app/chat-screen.test.ts` mocks `next/navigation`).

- [ ] **Step 4: Commit**

```bash
git add 'app/(workspace)/layout.tsx'
git commit -m "feat: resolve the real user id in the workspace layout"
```

---

### Task 4: `chat-screen.tsx` uses the real user id

**Files:**

- Modify: `app/(workspace)/chat/_components/chat-screen.tsx:96,107-127` (and every other line using `DEFAULT_USER_ID`)

**Interfaces:**

- Consumes: `useCurrentUserId` (Task 1).

- [ ] **Step 1: Remove the constant and add the hook call**

Delete this line (currently line 96):

```typescript
const DEFAULT_USER_ID = 'local-user';
```

In the `ChatScreen` component body, immediately after `const { t } = useTranslation();` (currently line 127), add:

```typescript
const userId = useCurrentUserId();
```

Add the import alongside the other `@/app/...` imports near the top of the file:

```typescript
import { useCurrentUserId } from '@/app/_providers/current-user-provider';
```

- [ ] **Step 2: Replace every remaining use of `DEFAULT_USER_ID` with `userId`**

Run this exact command from the repo root — it's a pure identifier rename (same type, same call shape at every site), not a behavior change:

```bash
sed -i '' 's/\bDEFAULT_USER_ID\b/userId/g' 'app/(workspace)/chat/_components/chat-screen.tsx'
```

Then verify no occurrences remain:

```bash
grep -n "DEFAULT_USER_ID" 'app/(workspace)/chat/_components/chat-screen.tsx'
```

Expected: no output. (This command also renames the constant declaration line from Step 1 if you ran it before deleting that line by hand — either order works, just don't do both and end up with `const userId = 'local-user'` still present. Check with `grep -n "const userId = 'local-user'"` after — expect no output.)

- [ ] **Step 3: Run the affected tests**

Run: `npx vitest run tests/unit/app/chat-screen.test.ts`
Expected: PASS — unchanged pass count. The two assertions at `tests/unit/app/chat-screen.test.ts:213,217` expecting `'local-user'` still pass because Task 2 made `renderUi` provide exactly that stub value.

- [ ] **Step 4: Run the full quality gate**

Run: `npm run typecheck && npx eslint 'app/(workspace)/chat/_components/chat-screen.tsx'`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add 'app/(workspace)/chat/_components/chat-screen.tsx'
git commit -m "feat: use the real user id in ChatScreen"
```

---

### Task 5: `chat-sessions.store.ts` / `workspace-shell.tsx` use the real user id

**Files:**

- Modify: `app/_stores/chat-sessions.store.ts:106-114`
- Modify: `app/_components/layout/workspace-shell.tsx:19,88`

**Interfaces:**

- Consumes: `useCurrentUserId` (Task 1).
- Produces: `chat-sessions.store.ts` no longer exports `CHAT_STORAGE_USER_ID` — nothing else in the codebase imports it (confirmed by repo-wide grep during planning), so removing the export is safe.

- [ ] **Step 1: Remove the placeholder constant**

In `app/_stores/chat-sessions.store.ts`, delete these lines (the doc comment and the constant it documents):

```typescript
/**
 * The account these conversations belong to.
 *
 * A placeholder until conversations move to the server and are keyed by the
 * signed-in account. It lives here because both the sidebar and the chat
 * screen hydrate the same store, and they have to agree on the key or each
 * would read a different set.
 */
export const CHAT_STORAGE_USER_ID = 'local-user';
```

- [ ] **Step 2: Update `workspace-shell.tsx` to resolve the real user id**

Change the import (currently):

```typescript
import { CHAT_STORAGE_USER_ID, useChatSessionsStore } from '@/app/_stores/chat-sessions.store';
```

to:

```typescript
import { useChatSessionsStore } from '@/app/_stores/chat-sessions.store';
import { useCurrentUserId } from '@/app/_providers/current-user-provider';
```

In the component body (near the other hook calls, e.g. right after `const collapsed = useSidebarStore((state) => state.collapsed);`), add:

```typescript
const userId = useCurrentUserId();
```

Change the effect (currently):

```typescript
useEffect(() => {
  void useSidebarStore.persist.rehydrate();
  // The sidebar lists conversations on every route, so it cannot wait for
  // the chat screen to load them — on `/databases/demo` that screen is not
  // mounted, and the history under each database came up empty.
  useChatSessionsStore.getState().hydrate(CHAT_STORAGE_USER_ID);
}, []);
```

to:

```typescript
useEffect(() => {
  void useSidebarStore.persist.rehydrate();
  // The sidebar lists conversations on every route, so it cannot wait for
  // the chat screen to load them — on `/databases/demo` that screen is not
  // mounted, and the history under each database came up empty.
  useChatSessionsStore.getState().hydrate(userId);
}, [userId]);
```

(`userId` is now a dependency: `useCurrentUserId()` returns a plain string that never changes during a session, so this doesn't change how often the effect runs in practice — it's added because `userId` is now a reactive value the effect closes over, and ESLint's `react-hooks/exhaustive-deps` rule expects it listed.)

- [ ] **Step 3: Run the quality gate**

Run: `npm run typecheck && npx eslint app/_stores/chat-sessions.store.ts app/_components/layout/workspace-shell.tsx`
Expected: both clean.

- [ ] **Step 4: Run any existing tests touching these files**

Run: `npx vitest run tests/unit/app/chat-screen.test.ts tests/unit/app/chart-sidebar.test.ts`
Expected: PASS (both files' stores are shared, so this confirms nothing regressed even though neither test directly renders `WorkspaceShell`).

- [ ] **Step 5: Commit**

```bash
git add app/_stores/chat-sessions.store.ts app/_components/layout/workspace-shell.tsx
git commit -m "feat: use the real user id to hydrate chat sessions"
```

---

### Task 6: Thread the real user id through chart-encoding-suggestion

**Files:**

- Modify: `src/entities/models/chart-encoding-suggestion.ts`
- Modify: `src/interface-adapters/controllers/charts/chart.schemas.ts:55-60`
- Modify: `src/infrastructure/repositories/agent-api-chart-encoding-suggestion.repository.ts`
- Modify: `app/(workspace)/chat/_components/chart-sidebar.tsx` (three spots: `ChartSidebar`, `ChartEditModal`, `ChartQueryRow`)

**Interfaces:**

- Consumes: `useCurrentUserId` (Task 1).
- Produces: `ChartEncodingSuggestionInput` gains `readonly userId: string`. No other task depends on this one.

- [ ] **Step 1: Add `userId` to the entity**

In `src/entities/models/chart-encoding-suggestion.ts`, change:

```typescript
export interface ChartEncodingSuggestionInput {
  readonly title: string;
  readonly chartType: ChartType;
  readonly columns: readonly string[];
  readonly sampleRows: readonly Record<string, unknown>[];
}
```

to:

```typescript
export interface ChartEncodingSuggestionInput {
  readonly userId: string;
  readonly title: string;
  readonly chartType: ChartType;
  readonly columns: readonly string[];
  readonly sampleRows: readonly Record<string, unknown>[];
}
```

- [ ] **Step 2: Add `userId` to the validation schema**

In `src/interface-adapters/controllers/charts/chart.schemas.ts`, change:

```typescript
export const suggestChartEncodingsInputSchema = z.object({
  title: z.string(),
  chartType: z.enum(CHART_TYPES),
  columns: z.array(z.string()),
  sampleRows: z.array(z.record(z.string(), z.unknown())),
});
```

to:

```typescript
export const suggestChartEncodingsInputSchema = z.object({
  userId: z.string().min(1),
  title: z.string(),
  chartType: z.enum(CHART_TYPES),
  columns: z.array(z.string()),
  sampleRows: z.array(z.record(z.string(), z.unknown())),
});
```

- [ ] **Step 3: Use the real `userId` in the repository instead of the hardcoded constant**

In `src/infrastructure/repositories/agent-api-chart-encoding-suggestion.repository.ts`, delete this line:

```typescript
const CALLER_ID = 'local-user';
```

Change the `suggest` method's request body (currently):

```typescript
dto = await this.transport.request<BlockingTurnDto>('/turns/blocking', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'X-Caller-Id': CALLER_ID },
  body: JSON.stringify({
    session_key: `chart-encodings-${crypto.randomUUID()}`,
    agent: AGENT_NAME,
    input: buildPrompt(input),
  }),
});
```

to:

```typescript
dto = await this.transport.request<BlockingTurnDto>('/turns/blocking', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'X-Caller-Id': input.userId },
  body: JSON.stringify({
    session_key: `chart-encodings-${crypto.randomUUID()}`,
    agent: AGENT_NAME,
    input: buildPrompt(input),
  }),
});
```

- [ ] **Step 4: Thread `userId` through `chart-sidebar.tsx`'s three components**

In `ChartSidebar` (the top-level component), add the hook call right after `const { t } = useTranslation();`:

```typescript
const userId = useCurrentUserId();
```

Add the import alongside the other `@/app/...`/`@/src/...` imports:

```typescript
import { useCurrentUserId } from '@/app/_providers/current-user-provider';
```

At `ChartSidebar`'s own `suggestChartEncodings({...})` call site (currently):

```typescript
const suggestion = await suggestChartEncodings({
  title: withData.title,
  chartType: withData.chartType,
  columns,
  sampleRows: records.slice(0, 5),
});
```

add `userId,` as the first property:

```typescript
const suggestion = await suggestChartEncodings({
  userId,
  title: withData.title,
  chartType: withData.chartType,
  columns,
  sampleRows: records.slice(0, 5),
});
```

Thread it to `<ChartEditModal>` (add the prop at its call site):

```tsx
<ChartEditModal
  chart={editingChart}
  draft={draft}
  fields={fields}
  saveState={saveState}
  onClose={() => setEditingId(null)}
  onChangeDraft={changeDraft}
  onChangeChannel={changeChannel}
  onDelete={() => void removeSelected()}
  setChartDataFromCsv={setChartDataFromCsv}
  onCsvUploaded={applyChart}
  patchChart={patchChart}
  submitQuery={submitQuery}
  monitorQuery={monitorQuery}
  listQueryCatalogs={listQueryCatalogs}
  suggestChartEncodings={suggestChartEncodings}
  userId={userId}
  onQueryRefreshed={applyChart}
  t={t}
/>
```

Add `userId` to `ChartEditModalProps` and the `ChartEditModal` destructured parameters:

```typescript
interface ChartEditModalProps {
  readonly chart: ChartViewModel;
  readonly draft: Draft;
  readonly fields: readonly string[];
  readonly saveState: 'saved' | 'saving' | 'conflict';
  readonly onClose: () => void;
  readonly onChangeDraft: (change: Partial<Draft>) => void;
  readonly onChangeChannel: (channel: ChartChannel, field: string) => void;
  readonly onDelete: () => void;
  readonly setChartDataFromCsv: SetChartDataFromCsvController;
  readonly onCsvUploaded: (chart: ChartViewModel) => void;
  readonly patchChart: PatchChartController;
  readonly submitQuery?: SubmitQueryController;
  readonly monitorQuery?: MonitorQueryController;
  readonly listQueryCatalogs?: ListQueryCatalogsController;
  readonly suggestChartEncodings?: SuggestChartEncodingsController;
  readonly userId: string;
  readonly onQueryRefreshed: (chart: ChartViewModel) => void;
  readonly t: Translator;
}
```

(add `userId` to the `function ChartEditModal({ ... })` destructuring list the same way, and to its own `<ChartQueryRow>` call site — add `userId={userId}` there, and add `readonly userId: string;` plus `userId` to `ChartQueryRow`'s inline props type/destructuring.)

At `ChartQueryRow`'s own `suggestChartEncodings({...})` call site (currently):

```typescript
void suggestChartEncodings({
  title: saved.title,
  chartType: saved.chartType,
  columns: result.columns.map((column) => column.name),
  sampleRows: records.slice(0, 5),
});
```

add `userId,` as the first property:

```typescript
void suggestChartEncodings({
  userId,
  title: saved.title,
  chartType: saved.chartType,
  columns: result.columns.map((column) => column.name),
  sampleRows: records.slice(0, 5),
});
```

- [ ] **Step 5: Run the quality gate**

Run: `npm run typecheck && npx eslint src/entities/models/chart-encoding-suggestion.ts src/interface-adapters/controllers/charts/chart.schemas.ts src/infrastructure/repositories/agent-api-chart-encoding-suggestion.repository.ts 'app/(workspace)/chat/_components/chart-sidebar.tsx'`
Expected: both clean. TypeScript will catch any missed `userId` prop-threading spot as a "missing property" error on `ChartEditModalProps`/the `ChartQueryRow` props type — fix any that surface before moving on.

- [ ] **Step 6: Run the affected tests**

Run: `npx vitest run tests/unit/app/chart-sidebar.test.ts`
Expected: PASS — unchanged pass count (this file doesn't exercise `suggestChartEncodings` per the repo search done during planning, so this only confirms the prop-threading didn't break rendering).

- [ ] **Step 7: Commit**

```bash
git add src/entities/models/chart-encoding-suggestion.ts src/interface-adapters/controllers/charts/chart.schemas.ts src/infrastructure/repositories/agent-api-chart-encoding-suggestion.repository.ts 'app/(workspace)/chat/_components/chart-sidebar.tsx'
git commit -m "feat: use the real user id for chart-encoding-suggestion calls"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm the literal is gone everywhere it should be**

Run: `grep -rn "'local-user'" app src --include="*.ts" --include="*.tsx"`
Expected output: exactly one line, `tests/support/render-ui.ts` (the deliberate test stub from Task 2) — if `tests/` is included in the search, that's the only survivor; if scoped to `app`/`src` only as shown, expect **no output at all**.

- [ ] **Step 2: Full quality gate**

Run: `npm run typecheck && npm run lint && npm test && npm run format:check`
Expected: all pass, with no new failures beyond whatever pre-existing ones already exist on this branch (check the baseline first with `git stash` if any fail, the same way prior sessions on this branch have verified pre-existing vs. new failures).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds — this specifically exercises `app/(workspace)/layout.tsx` as a real Server Component, which none of the unit tests do.

This task has no commit — it's a verification checklist confirming Tasks 1–6 work together, not a code change.
