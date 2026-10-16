---
name: routing-and-pages
description: Use when adding or changing a route, page, layout, route handler, redirect, or page metadata in the Next.js App Router
---

# Routing and Pages

## Overview

App Router, one route group. Pages are thin: metadata plus the feature root.
Everything else is a component.

```text
app/layout.tsx              Root layout: <html lang>, globals.css, LocaleHydration
app/page.tsx                redirect('/connections')
app/(workspace)/layout.tsx  Renders WorkspaceShell around every workspace page
app/(workspace)/<page>/page.tsx
app/(workspace)/<page>/_components/
app/api/client-logs/route.ts   Route handler
app/health/route.ts            Liveness probe
```

`(workspace)` is a route group: it adds the shell without adding a URL segment.
`/connections` is `app/(workspace)/connections/page.tsx`.

## Adding a page

1. Create `app/(workspace)/<segment>/page.tsx`:

   ```tsx
   import type { Metadata } from 'next';

   import { XFeature } from '@/app/(workspace)/<segment>/_components/x-feature';

   export const metadata: Metadata = { title: 'Human Title' };

   export default function XPage() {
     return <XFeature />;
   }
   ```

2. Create `app/(workspace)/<segment>/_components/x-feature.tsx` — `'use client'`,
   resolves controllers with `getInjection`, freezes them, renders the screen.
3. Add the nav entry in `app/_components/layout/workspace-navigation.ts` with a
   `labelKey`, and add that key to `app/_i18n/en.ts` **and** `app/_i18n/vi.ts`.
4. Register the feature root in `tests/unit/app/frameworks-layer.test.ts`
   (`featureRoots`, `routeSegmentsWithLocalComponents`) and add controller wiring
   coverage in `tests/unit/app/controller-wiring.test.ts`.

## Rules

- A page never calls a controller, resolves DI, or holds state. It renders one
  feature root.
- Keep the page a server component; the feature root carries `'use client'`.
- `metadata` is server-rendered before the client locale is known, so titles stay
  in the default locale. Do not try to translate `metadata` through the Zustand
  store.
- Route handlers (`route.ts`) may import controllers and entities like any other
  `app/` file — never infrastructure.
- Dynamic segments: validate params at the controller boundary with the feature's
  Zod schema, not in the page.
- Redirects use `redirect()` from `next/navigation` (see `app/page.tsx`).

## Failure modes

| Symptom                                      | Cause                                               |
| -------------------------------------------- | --------------------------------------------------- |
| Page renders but shell/nav is missing        | File created outside `(workspace)/`                 |
| `useState`/`getInjection` error during build | Missing `'use client'` in the feature root          |
| Route unexpectedly 404s                      | Folder starts with `_` (private, not a route)       |
| `frameworks-layer` test fails                | New feature root not registered in the test's lists |

## Verify

```bash
npx vitest run tests/unit/app
npm run build      # route table is printed; confirm your path appears
```
