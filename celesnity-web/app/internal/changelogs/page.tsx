import type { Metadata } from 'next';

import { loadAuthors, loadChangelog } from '../_components/changelog-loader';
import { ChangelogTimeline } from '../_components/changelog-timeline';

export const metadata: Metadata = { title: 'Changelog' };

/** Read at build time: the files under `data/changelogs` ship inside the page. */
export default function ChangelogsPage() {
  return <ChangelogTimeline months={loadChangelog()} people={loadAuthors()} />;
}
