'use client';

import { Fragment } from 'react';

import { Badge } from '@/app/_components/ui/badge';
import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';

import type {
  ChangelogArea,
  ChangelogKind,
  ChangelogMonth,
  ChangelogPerson,
} from './changelog-loader';

const KIND_KEY: Readonly<Record<ChangelogKind, TranslationKey>> = {
  feature: 'internal.kind.feature',
  improvement: 'internal.kind.improvement',
  fix: 'internal.kind.fix',
};

const KIND_VARIANT: Readonly<Record<ChangelogKind, 'default' | 'secondary' | 'outline'>> = {
  feature: 'default',
  improvement: 'secondary',
  fix: 'outline',
};

const AREA_KEY: Readonly<Record<ChangelogArea, TranslationKey>> = {
  web: 'internal.area.web',
  core: 'internal.area.core',
  agent: 'internal.area.agent',
  all: 'internal.area.all',
};

/** A person's name, linked to their GitHub profile when the roster knows it. */
function AuthorName({
  name,
  github,
}: {
  readonly name: string;
  readonly github: string | undefined;
}) {
  if (github === undefined) return <span>{name}</span>;
  return (
    <a
      href={`https://github.com/${github}`}
      target="_blank"
      rel="noreferrer"
      className="underline-offset-2 hover:underline"
    >
      {name}
    </a>
  );
}

/**
 * The changelog as a timeline: a heading per month, a rail down the left, one
 * card per change with the day, what kind of change it is, which part of the
 * system it touched, who made it, and what it means for the person using it.
 * The text is read in the workspace's current language.
 */
export function ChangelogTimeline({
  months,
  people,
}: {
  readonly months: readonly ChangelogMonth[];
  readonly people: readonly ChangelogPerson[];
}) {
  const { locale, t } = useTranslation();
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const dayLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const profiles = new Map(people.map((person) => [person.name, person.github]));

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-heading-3 font-[650] tracking-[-0.025em] text-foreground">
          {t('internal.changelog.title')}
        </h1>
        <p className="m-0 max-w-2xl text-body-md text-muted-foreground">
          {t('internal.changelog.intro')}
        </p>
      </header>

      {months.length === 0 ? (
        <p className="m-0 text-body-md text-muted-foreground">{t('internal.changelog.empty')}</p>
      ) : (
        months.map((month) => (
          <section key={month.month} aria-labelledby={`changelog-${month.month}`}>
            <h2
              id={`changelog-${month.month}`}
              className="m-0 mb-4 text-body-lg font-[650] capitalize text-foreground"
            >
              {monthLabel.format(new Date(`${month.month}-01T00:00:00`))}
            </h2>
            <ol className="m-0 flex list-none flex-col gap-6 border-l border-border p-0 pl-6">
              {month.entries.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute top-2 -left-[1.8rem] size-2.5 rounded-full border-2 border-background bg-primary"
                  />
                  <article className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                      <time dateTime={entry.date} className="tabular-nums">
                        {dayLabel.format(new Date(`${entry.date}T00:00:00`))}
                      </time>
                      <Badge variant={KIND_VARIANT[entry.kind]}>{t(KIND_KEY[entry.kind])}</Badge>
                      {entry.areas.map((area) => (
                        <Badge key={area} variant="outline">
                          {t(AREA_KEY[area])}
                        </Badge>
                      ))}
                      {entry.version ? (
                        <span>{t('internal.changelog.version', { version: entry.version })}</span>
                      ) : null}
                      <span>
                        {t('internal.changelog.by')}{' '}
                        {entry.authors.map((author, index) => (
                          <Fragment key={author}>
                            {index > 0 ? ', ' : null}
                            <AuthorName name={author} github={profiles.get(author)} />
                          </Fragment>
                        ))}
                      </span>
                    </div>
                    <h3 className="m-0 text-body-lg font-semibold text-foreground">
                      {entry.title[locale]}
                    </h3>
                    <p className="m-0 max-w-3xl text-body-md leading-[1.65] text-foreground">
                      {entry.summary[locale]}
                    </p>
                    {entry.details && entry.details[locale].length > 0 ? (
                      <ul className="m-0 max-w-3xl list-disc space-y-1 pl-5 text-body-md leading-[1.65] text-foreground">
                        {entry.details[locale].map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
