import { redirect } from 'next/navigation';

/**
 * Kept as a redirect, not a screen.
 *
 * This page and `/metadata-crawler` listed the same crawlers — one column of
 * difference — so "where do I see what a scan found" had two answers and
 * neither was the source's own screen. The crawler list is the surviving one:
 * it is where a scan is assigned and scheduled. Old links and bookmarks still
 * land somewhere rather than 404.
 */
export default function SourceSchemaPage() {
  redirect('/metadata-crawler');
}
