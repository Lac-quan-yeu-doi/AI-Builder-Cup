import { GuideMarkdown } from './guide-markdown';
import { GuideSidebar } from './guide-sidebar';
import type { GuidePage, GuideSidebar as GuideSidebarModel } from './guide-loader';
import { LocaleSwitch } from './locale-switch';

/**
 * One guide page: the table of contents on the left, the module's manual on
 * the right, both languages rendered on the server and one shown at a time.
 */
export function GuideScreen({
  sidebar,
  page,
}: {
  readonly sidebar: GuideSidebarModel;
  readonly page: GuidePage;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <GuideSidebar sidebar={sidebar} activeSlug={page.slug} />
      </aside>
      <article data-guide-slug={page.slug} className="min-w-0 max-w-3xl">
        <LocaleSwitch
          vi={<GuideMarkdown content={page.body.vi} />}
          en={<GuideMarkdown content={page.body.en} />}
        />
      </article>
    </div>
  );
}
