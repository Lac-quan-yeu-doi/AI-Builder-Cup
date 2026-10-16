import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { InternalShell } from './_components/internal-shell';

/*
 * Served as `/_internal/...`. A URL segment that starts with an underscore
 * cannot be a folder name here (the App Router reserves `_` for private
 * folders, and the encoded `%5F` spelling confuses the route type generator),
 * so the folder is `app/internal` and `next.config.ts` rewrites `/_internal/*`
 * onto it. Nothing links here from the workspace; the pages are for release
 * and handover.
 */
export const metadata: Metadata = { title: 'Internal' };

export default function InternalLayout({ children }: { readonly children: ReactNode }) {
  return <InternalShell>{children}</InternalShell>;
}
