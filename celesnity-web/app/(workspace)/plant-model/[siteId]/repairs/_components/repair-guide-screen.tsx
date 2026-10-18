'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BadgeCheckIcon, PlayIcon, Trash2Icon } from 'lucide-react';

import { useTranslation } from '@/app/_i18n/use-translation';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Checkbox } from '@/app/_components/ui/checkbox';
import { Spinner } from '@/app/_components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import {
  approvalIssues,
  checklistFromGuide,
  openWhyQuestions,
  skillFromGuide,
  type RepairGuide,
} from '@/src/entities/models/repair-guide';
import type { RepairGuideController } from '@/src/interface-adapters/controllers/plant-model/repair-guide.controller';

import { GuideCompareTab } from './guide-compare-tab';
import { GuideProcedureTab } from './guide-procedure-tab';
import { GuideTransferTab } from './guide-transfer-tab';

export function RepairGuideScreen({
  controller,
  siteId,
  guideId,
}: {
  readonly controller: RepairGuideController;
  readonly siteId: string;
  readonly guideId: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [guide, setGuide] = useState<RepairGuide>();
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const base = `/plant-model/${encodeURIComponent(siteId)}/repairs`;

  useEffect(() => {
    let active = true;
    void controller.get(guideId).then(
      (value) => {
        if (active) setGuide(value);
      },
      () => {
        if (active) setError(t('plantRepairs.notFound'));
      },
    );
    return () => {
      active = false;
    };
  }, [controller, guideId, t]);

  const update = useCallback(
    async (next: RepairGuide) => {
      setGuide(next);
      try {
        setGuide(await controller.save(next));
      } catch {
        setError(t('plantRepairs.saveError'));
      }
    },
    [controller, t],
  );

  if (guide === undefined) {
    return (
      <div className="flex items-center gap-2 p-6 text-body-sm text-muted-foreground">
        {error ? <span role="alert">{error}</span> : <Spinner />}
      </div>
    );
  }

  const issues = approvalIssues(guide);
  const questions = openWhyQuestions(guide);
  const skill = skillFromGuide(guide);

  async function approve() {
    setApproving(true);
    setError('');
    try {
      setGuide(await controller.approve(guideId));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t('plantRepairs.approveError'));
    } finally {
      setApproving(false);
    }
  }

  async function remove() {
    if (!window.confirm(t('plantRepairs.deleteConfirm'))) return;
    await controller.remove(guideId);
    router.push(base);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <section className="flex flex-col gap-3">
        <PageBar
          backTo={{ href: base, label: t('plantRepairs.title') }}
          eyebrow={
            <>
              {t('plantRepairs.machineFault', {
                machine: guide.machineName,
                fault: guide.faultName,
              })}
              {' · '}
              {t('plantRepairs.recordedBy', { expert: guide.expert })}
            </>
          }
          title={guide.procedure.title}
          meta={
            <Badge
              variant={guide.status === 'approved' ? 'success' : 'warning'}
              className="font-mono"
            >
              {guide.status === 'approved'
                ? t('plantRepairs.status.approved', { revision: guide.revision })
                : t('plantRepairs.status.draft', { revision: guide.revision })}
            </Badge>
          }
          description={guide.procedure.summary}
          actions={
            <>
              {guide.status === 'approved' ? (
                <Button asChild>
                  <Link href={`${base}/${encodeURIComponent(guide.id)}/guide`}>
                    <PlayIcon />
                    {t('plantRepairs.startGuided')}
                  </Link>
                </Button>
              ) : (
                <Button disabled={issues.length > 0 || approving} onClick={() => void approve()}>
                  {approving ? <Spinner /> : <BadgeCheckIcon />}
                  {t('plantRepairs.approve')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('plantRepairs.delete')}
                onClick={() => void remove()}
              >
                <Trash2Icon />
              </Button>
            </>
          }
        />
        {guide.status === 'draft' ? (
          <p className="text-body-sm text-muted-foreground">
            {issues.length > 0
              ? t('plantRepairs.toConfirm', { count: issues.length })
              : t('plantRepairs.readyToApprove')}
            {questions.length > 0
              ? ` ${t('plantRepairs.whyOpen', { count: questions.length })}`
              : ''}
          </p>
        ) : guide.skillName !== undefined ? (
          <p className="text-body-sm text-muted-foreground">
            {t('plantRepairs.publishedSkill', { name: guide.skillName })}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>

      <Tabs defaultValue="procedure" className="gap-4">
        <TabsList>
          <TabsTrigger value="procedure">{t('plantRepairs.tab.procedure')}</TabsTrigger>
          <TabsTrigger value="checklist">{t('plantRepairs.tab.checklist')}</TabsTrigger>
          <TabsTrigger value="skill">{t('plantRepairs.tab.skill')}</TabsTrigger>
          <TabsTrigger value="transfer">{t('plantRepairs.tab.transfer')}</TabsTrigger>
          <TabsTrigger value="compare">{t('plantRepairs.tab.compare')}</TabsTrigger>
        </TabsList>
        <TabsContent value="procedure">
          <GuideProcedureTab guide={guide} controller={controller} onChange={update} />
        </TabsContent>
        <TabsContent value="checklist">
          <ul className="flex max-w-3xl flex-col divide-y rounded-xl border bg-card">
            {checklistFromGuide(guide).map((item) => (
              <li key={item.id} className="flex items-start gap-3 p-4">
                <Checkbox aria-label={item.label} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-label">
                    {item.step === undefined ? '' : `${item.step + 1}. `}
                    {item.label}
                  </p>
                  {item.detail ? (
                    <p className="text-body-sm text-muted-foreground">{item.detail}</p>
                  ) : null}
                </div>
                {item.safety ? <Badge variant="danger">{t('plantRepairs.safety')}</Badge> : null}
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="skill" className="flex max-w-4xl flex-col gap-3">
          <p className="text-body-sm text-muted-foreground">
            {guide.skillName !== undefined
              ? t('plantRepairs.skillPublished', { name: guide.skillName })
              : t('plantRepairs.skillOnApproval', { name: skill.name })}
          </p>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-label">{skill.name}</p>
            <p className="text-body-sm text-muted-foreground">{skill.description}</p>
          </div>
          <pre className="max-h-[560px] overflow-auto rounded-xl bg-muted p-4 text-micro whitespace-pre-wrap">
            {skill.body}
          </pre>
        </TabsContent>
        <TabsContent value="transfer">
          <GuideTransferTab guide={guide} controller={controller} onChange={setGuide} />
        </TabsContent>
        <TabsContent value="compare">
          <GuideCompareTab guide={guide} controller={controller} onChange={setGuide} />
        </TabsContent>
      </Tabs>

      <section className="max-w-3xl space-y-2">
        <h2 className="text-label text-muted-foreground">{t('plantRepairs.history')}</h2>
        <ol className="space-y-1 text-body-sm">
          {[...guide.history].reverse().map((entry) => (
            <li key={entry.revision} className="flex gap-3">
              <span className="text-muted-foreground tabular-nums">r{entry.revision}</span>
              <span className="text-muted-foreground tabular-nums">
                {new Date(entry.at).toLocaleString()}
              </span>
              <span>{entry.note}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
