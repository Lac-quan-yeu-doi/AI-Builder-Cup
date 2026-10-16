import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

/**
 * The user guide is one Markdown file per module per language under
 * `docs/user-guide/<locale>/`, and `_sidebar.json` says how they are grouped
 * and ordered. Splitting by module keeps each file small enough to rewrite when
 * a screen changes; keeping the two languages as sibling files with the same
 * name keeps a page from drifting between them unnoticed — a slug is only
 * valid when both files exist.
 */
export const GUIDE_DIRECTORY = join(process.cwd(), 'docs', 'user-guide');

const localizedText = z.object({ vi: z.string().min(1), en: z.string().min(1) });

const itemSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  file: z.string().regex(/^[a-z0-9-]+\.md$/u),
  title: localizedText,
});

const sidebarSchema = z.object({
  sections: z.array(z.object({ title: localizedText, items: z.array(itemSchema).min(1) })).min(1),
});

export type GuideSidebar = z.infer<typeof sidebarSchema>;
export type GuideItem = z.infer<typeof itemSchema>;

export interface GuidePage {
  readonly slug: string;
  readonly title: { readonly vi: string; readonly en: string };
  readonly body: { readonly vi: string; readonly en: string };
}

export function loadGuideSidebar(directory = GUIDE_DIRECTORY): GuideSidebar {
  const parsed = sidebarSchema.safeParse(
    JSON.parse(readFileSync(join(directory, '_sidebar.json'), 'utf8')) as unknown,
  );
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`docs/user-guide/_sidebar.json: ${issues}`);
  }
  const slugs = new Set<string>();
  for (const item of parsed.data.sections.flatMap((section) => section.items)) {
    if (slugs.has(item.slug)) {
      throw new Error(`docs/user-guide/_sidebar.json: slug "${item.slug}" is used twice`);
    }
    slugs.add(item.slug);
  }
  return parsed.data;
}

export function guideItems(sidebar: GuideSidebar): readonly GuideItem[] {
  return sidebar.sections.flatMap((section) => section.items);
}

/** The page for a slug, or null when the sidebar does not know it. */
export function loadGuidePage(
  slug: string,
  directory = GUIDE_DIRECTORY,
  sidebar = loadGuideSidebar(directory),
): GuidePage | null {
  const item = guideItems(sidebar).find((candidate) => candidate.slug === slug);
  if (item === undefined) return null;
  const read = (locale: 'vi' | 'en'): string => {
    const path = join(directory, locale, item.file);
    if (!existsSync(path)) {
      throw new Error(`docs/user-guide/${locale}/${item.file} is missing for slug "${slug}"`);
    }
    return readFileSync(path, 'utf8');
  };
  return { slug, title: item.title, body: { vi: read('vi'), en: read('en') } };
}
