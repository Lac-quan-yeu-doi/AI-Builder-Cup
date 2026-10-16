'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { DocumentBody } from '@/app/_components/documents/document-body';
import { workspaceDocuments } from '@/app/_components/documents/document-content';
import { Card } from '@/app/_components/ui/card';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';

/**
 * The guide: chapters on the left, the open one on the right.
 *
 * The open chapter lives in the URL so a screen elsewhere can link straight at
 * the page that explains it — which is the point of having a guide inside the
 * workspace rather than beside it.
 */
export function GuideScreen() {
  const { locale, t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const documents = workspaceDocuments(locale);
  const requested = searchParams.get('doc');
  const active = documents.find((document) => document.slug === requested) ?? documents[0];

  if (active === undefined) {
    return null;
  }

  const open = (slug: string): void => {
    const query = new URLSearchParams(searchParams.toString());
    if (slug === documents[0]?.slug) {
      query.delete('doc');
    } else {
      query.set('doc', slug);
    }
    const search = query.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  return (
    <div className="grid min-w-0 items-start gap-6 min-[901px]:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]">
      <nav aria-label={t('guide.title')} className="min-[901px]:sticky min-[901px]:top-6">
        <h1 className="mb-3 px-2.5 text-caption font-[750] tracking-[0.07em] text-muted-foreground uppercase">
          {t('guide.title')}
        </h1>
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {documents.map((document, index) => {
            const current = document.slug === active.slug;
            return (
              <li key={document.slug}>
                <button
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-baseline gap-2 rounded-lg px-2.5 py-2 text-left text-body-sm',
                    current
                      ? 'bg-accent font-[650] text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  onClick={() => open(document.slug)}
                  type="button"
                >
                  <span className="text-caption tabular-nums opacity-60">{index}</span>
                  <span className="min-w-0 flex-1">{document.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <Card className="px-6 py-7 sm:px-8">
        <DocumentBody content={active.body} />
      </Card>
    </div>
  );
}
