'use client';

import { CircleAlert, CircleCheck, Clock3, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { CardContent, CardFooter, CardHeader } from '@/app/_components/ui/card';
import { SelectField, type SelectOption } from '@/app/_components/ui/fields';
import { Spinner } from '@/app/_components/ui/spinner';
import { useTranslation } from '@/app/_i18n/use-translation';
import type {
  DetailViewModel,
  TutorialContextSelectorViewModel,
} from '@/src/interface-adapters/presenters/tutorial-detail.presenter';
import { getVietnameseAgentTutorial } from '@/src/entities/models/tutorial-agent-localizations';

export interface TutorialDetailPanelProps {
  readonly detail: DetailViewModel;
  readonly onContextSelectionChange: (selectorId: string, resourceId: string) => void;
  readonly onStartFresh?: () => void;
  readonly onStart: () => void;
  readonly starting?: boolean;
  readonly action?: 'start' | 'resume' | 'continue' | 'repeat' | 'restart';
}

function contextOptions(
  selector: TutorialContextSelectorViewModel,
  placeholder: string,
): readonly SelectOption[] {
  return [
    { disabled: true, label: placeholder, value: '' },
    ...selector.options.map((option) => ({ label: option.name, value: option.id })),
  ];
}

/**
 * Controlled tutorial-readiness view. Eligibility and authorized context data
 * arrive through the detail presenter; this component only renders them and
 * reports member interactions to its owning feature root.
 */
export function TutorialDetailPanel({
  detail,
  onContextSelectionChange,
  onStartFresh,
  onStart,
  starting = false,
  action = 'start',
}: TutorialDetailPanelProps) {
  const { locale, t } = useTranslation();
  const localized =
    locale === 'vi' ? getVietnameseAgentTutorial(detail.tutorialId)?.metadata : undefined;
  const titleId = useId();
  const startUnavailableId = useId();
  const durationKey =
    detail.metadata.estimatedMinutes === 1
      ? 'tutorial.estimatedMinute'
      : 'tutorial.estimatedMinutes';
  const stepCountKey =
    detail.metadata.stepCount === 1 ? 'tutorial.stepCountSingular' : 'tutorial.stepCount';
  const startDisabled = !detail.startEnabled || starting;

  return (
    <article aria-labelledby={titleId} className="flex min-h-full flex-col">
      <CardHeader className="border-b py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{localized?.category ?? detail.metadata.category}</Badge>
          <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
            <Clock3 aria-hidden="true" />
            {t(durationKey, { count: detail.metadata.estimatedMinutes })}
          </span>
          <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
            <ListChecks aria-hidden="true" />
            {t(stepCountKey, { count: detail.metadata.stepCount })}
          </span>
        </div>
        <h2 id={titleId} className="text-heading-2 text-foreground">
          {localized?.title ?? detail.metadata.title}
        </h2>
        <p className="text-body-sm text-muted-foreground">
          {localized?.summary ?? detail.metadata.summary}
        </p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-8 py-6">
        <section aria-labelledby={`${titleId}-outcomes`} className="grid gap-3">
          <h3 id={`${titleId}-outcomes`} className="text-title text-foreground">
            {t('tutorial.learningOutcomes')}
          </h3>
          <ul className="grid list-disc gap-2 pl-5 text-body-sm text-foreground">
            {(localized?.learningOutcomes ?? detail.metadata.learningOutcomes).map((outcome) => (
              <li key={outcome}>{outcome}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={`${titleId}-prerequisites`} className="grid gap-3">
          <div className="grid gap-1">
            <h3 id={`${titleId}-prerequisites`} className="text-title text-foreground">
              {t('tutorial.prerequisitesTitle')}
            </h3>
            <p className="text-body-sm text-muted-foreground">
              {t('tutorial.prerequisitesDescription')}
            </p>
          </div>

          {detail.prerequisiteStates.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">{t('tutorial.noPrerequisites')}</p>
          ) : (
            <ul className="grid gap-3">
              {detail.prerequisiteStates.map((prerequisite) => (
                <li
                  key={prerequisite.id}
                  className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-body-sm text-foreground">{prerequisite.description}</p>
                    {prerequisite.informational === true ? null : (
                      <Badge variant={prerequisite.satisfied ? 'success' : 'warning'}>
                        {prerequisite.satisfied ? (
                          <CircleCheck aria-hidden="true" />
                        ) : (
                          <CircleAlert aria-hidden="true" />
                        )}
                        {prerequisite.satisfied
                          ? t('tutorial.prerequisiteSatisfied')
                          : t('tutorial.prerequisiteUnsatisfied')}
                      </Badge>
                    )}
                  </div>
                  {!prerequisite.satisfied && prerequisite.remediation !== null ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={prerequisite.remediation.href}>
                        {prerequisite.remediation.label}
                      </Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {detail.contextSelectors.length === 0 ? null : (
          <section aria-labelledby={`${titleId}-context`} className="grid gap-4">
            <div className="grid gap-1">
              <h3 id={`${titleId}-context`} className="text-title text-foreground">
                {t('tutorial.contextTitle')}
              </h3>
              <p className="text-body-sm text-muted-foreground">
                {t('tutorial.contextDescription')}
              </p>
            </div>

            <div className="grid gap-5">
              {detail.contextSelectors.map((selector) => (
                <SelectField
                  key={selector.id}
                  data={contextOptions(selector, t('tutorial.selectContext'))}
                  disabled={starting || selector.options.length === 0}
                  hint={
                    selector.options.length === 0
                      ? t('tutorial.noContextOptions')
                      : selector.selectedResourceName === null
                        ? undefined
                        : t('tutorial.contextSelected', {
                            name: selector.selectedResourceName,
                          })
                  }
                  label={t('tutorial.contextSelectorLabel', {
                    resourceType: selector.resourceType,
                  })}
                  onChange={(resourceId) => onContextSelectionChange(selector.id, resourceId)}
                  value={selector.selectedResourceId ?? ''}
                />
              ))}
            </div>
          </section>
        )}
      </CardContent>

      <CardFooter className="sticky bottom-0 grid gap-2 border-t bg-card py-4">
        <Button
          aria-busy={starting || undefined}
          aria-describedby={detail.startEnabled ? undefined : startUnavailableId}
          disabled={startDisabled}
          onClick={onStart}
          size="lg"
        >
          {starting ? (
            <>
              <Spinner aria-label={t('tutorial.starting')} />
              {t('tutorial.starting')}
            </>
          ) : (
            t(
              action === 'resume'
                ? 'tutorial.resume'
                : action === 'continue'
                  ? 'tutorial.continue'
                  : action === 'restart'
                    ? 'tutorial.startOver'
                    : action === 'repeat'
                      ? 'tutorial.repeat'
                      : 'tutorial.start',
            )
          )}
        </Button>
        {onStartFresh === undefined || (action !== 'resume' && action !== 'continue') ? null : (
          <Button disabled={startDisabled} onClick={onStartFresh} size="lg" variant="outline">
            {t('tutorial.startFresh')}
          </Button>
        )}
        {detail.startEnabled ? null : (
          <p id={startUnavailableId} className="text-caption text-muted-foreground">
            {t('tutorial.startUnavailable')}
          </p>
        )}
      </CardFooter>
    </article>
  );
}
