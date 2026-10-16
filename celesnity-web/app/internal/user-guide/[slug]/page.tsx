import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { guideItems, loadGuidePage, loadGuideSidebar } from '../../_components/guide-loader';
import { GuideScreen } from '../../_components/guide-screen';

interface GuidePageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

/** Every slug in `_sidebar.json` becomes a static page at build time; nothing else routes. */
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return guideItems(loadGuideSidebar()).map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = guideItems(loadGuideSidebar()).find((candidate) => candidate.slug === slug);
  return { title: item === undefined ? 'User guide' : `${item.title.en} · User guide` };
}

export default async function UserGuideSectionPage({ params }: GuidePageProps) {
  const { slug } = await params;
  const sidebar = loadGuideSidebar();
  const page = loadGuidePage(slug, undefined, sidebar);
  if (page === null) notFound();
  return <GuideScreen sidebar={sidebar} page={page} />;
}
