import type { Metadata } from 'next';

import { guideItems, loadGuidePage, loadGuideSidebar } from '../_components/guide-loader';
import { GuideScreen } from '../_components/guide-screen';

export const metadata: Metadata = { title: 'User guide' };

/** The guide's front door shows its first section; every section also has its own URL. */
export default function UserGuidePage() {
  const sidebar = loadGuideSidebar();
  const first = guideItems(sidebar)[0];
  if (first === undefined) throw new Error('docs/user-guide/_sidebar.json lists no pages');
  const page = loadGuidePage(first.slug, undefined, sidebar);
  if (page === null) throw new Error(`docs/user-guide: first page "${first.slug}" cannot be read`);
  return <GuideScreen sidebar={sidebar} page={page} />;
}
