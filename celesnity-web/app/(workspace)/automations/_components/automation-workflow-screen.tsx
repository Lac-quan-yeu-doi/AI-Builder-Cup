'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';

import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { EmptyState } from '@/app/_components/ui/empty-state';
import { InlineError } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { Card } from '@/app/_components/ui/card';
import { SelectField, TextField } from '@/app/_components/ui/fields';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { AutomationWorkflowController } from '@/src/interface-adapters/controllers/automation-workflow/automation-workflow.controller';
import type { AutomationWorkflowViewModel } from '@/src/interface-adapters/presenters/automation-workflow.presenter';
import { AutomationWorkflowStatusBadge } from '@/app/_components/automation-workflow/automation-workflow-status-badge';
import { isCurrentRequestToken } from '@/app/_components/shared/request-token';
import type { Translator } from '@/app/_i18n/translate';
import { useAssistantDock } from '@/app/_components/assistant/use-assistant-dock';

import { AutomationWorkflowChatPanel } from '../[workflowId]/_components/automation-workflow-chat-panel';

interface Props {
  readonly controller: AutomationWorkflowController;
}

function describeTrigger(workflow: AutomationWorkflowViewModel): string {
  if (workflow.triggerType === 'EVENT') {
    return workflow.eventTopic ?? '';
  }
  return workflow.scheduleTimezone
    ? `${workflow.scheduleCron ?? ''} (${workflow.scheduleTimezone})`
    : (workflow.scheduleCron ?? '');
}

export function AutomationWorkflowScreen({ controller }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<readonly AutomationWorkflowViewModel[]>();
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<AutomationWorkflowViewModel>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [suggestedEventTopic, setSuggestedEventTopic] = useState('');
  const listRequestToken = useRef(0);

  const load = useCallback(async () => {
    const requestToken = ++listRequestToken.current;
    try {
      const workflows = await controller.list();
      if (isCurrentRequestToken(listRequestToken.current, requestToken)) {
        setError(undefined);
        setItems(workflows);
      }
    } catch (cause) {
      if (isCurrentRequestToken(listRequestToken.current, requestToken)) {
        setError(cause instanceof Error ? cause.message : t('automationWorkflow.loadError'));
      }
    }
  }, [controller, t]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      listRequestToken.current += 1;
    };
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const triggerType = String(form.get('triggerType') ?? 'EVENT') as 'EVENT' | 'SCHEDULE';
    setBusy(true);
    setError(undefined);
    try {
      const created = await controller.create({
        name: String(form.get('name') ?? '').trim(),
        triggerType,
        ...(triggerType === 'EVENT'
          ? { eventTopic: String(form.get('eventTopic') ?? '').trim() }
          : {
              scheduleCron: String(form.get('scheduleCron') ?? '').trim(),
              scheduleTimezone: String(form.get('scheduleTimezone') ?? '').trim() || undefined,
            }),
      });
      setItems((current) => [created, ...(current ?? [])]);
      setCreateOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renaming) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      const updated = await controller.update(renaming.id, {
        name: String(form.get('name') ?? '').trim(),
      });
      setItems((current) =>
        current?.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setRenaming(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(item: AutomationWorkflowViewModel) {
    setBusy(true);
    setError(undefined);
    try {
      const created = await controller.duplicate(item.id);
      setItems((current) => [created, ...(current ?? [])]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: AutomationWorkflowViewModel) {
    setBusy(true);
    setError(undefined);
    try {
      const updated = await controller.update(item.id, { enabled: item.status !== 'enabled' });
      setItems((current) =>
        current?.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: AutomationWorkflowViewModel) {
    if (!window.confirm(t('automationWorkflow.confirmRemove'))) return;
    setBusy(true);
    setError(undefined);
    try {
      await controller.remove(item.id);
      setItems((current) => current?.filter((candidate) => candidate.id !== item.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  const assistant = useAssistantDock('automations-list', true);
  const eventTopics = existingEventTopics(items ?? []);
  const openCreate = (eventTopic = '') => {
    setSuggestedEventTopic(eventTopic);
    setCreateOpen(true);
  };

  return (
    <div className="flex h-full min-h-0">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-6 py-8 min-[1081px]:px-10">
          <PageBar
            actions={
              <>
                <Button variant="outline" onClick={() => void load()} disabled={busy}>
                  {t('automationWorkflow.retry')}
                </Button>
                <Button onClick={() => openCreate()} disabled={busy}>
                  {t('automationWorkflow.create')}
                </Button>
              </>
            }
            description={t('page.automations.description')}
            title={t('page.automations.title')}
          />
          {error ? <InlineError>{error}</InlineError> : null}
          <Card className="min-h-0 overflow-hidden p-0" asChild>
            <section aria-label={t('automationWorkflow.title')}>
              {!items ? (
                <div className="grid min-h-[300px] place-items-center">
                  <Spinner className="size-7 text-primary" />
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  title={t('automationWorkflow.empty')}
                  action={
                    <Button onClick={() => openCreate()}>{t('automationWorkflow.create')}</Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-border bg-muted text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      <tr>
                        {[
                          t('automationWorkflow.name'),
                          t('automationWorkflow.status'),
                          t('automationWorkflow.trigger'),
                          t('automationWorkflow.steps'),
                          t('automationWorkflow.createdAt'),
                          t('automationWorkflow.actions'),
                        ].map((heading) => (
                          <th className="px-4 py-3" key={heading}>
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr className="border-b border-border last:border-0" key={item.id}>
                          <td className="px-4 py-4">
                            <Link
                              className="font-semibold text-foreground hover:text-primary"
                              href={`/automations/${encodeURIComponent(item.id)}`}
                            >
                              {item.name}
                            </Link>
                          </td>
                          <td className="px-4 py-4">
                            <AutomationWorkflowStatusBadge status={item.status} t={t} />
                          </td>
                          <td className="px-4 py-4 font-mono text-xs">{describeTrigger(item)}</td>
                          <td className="px-4 py-4 text-xs">{item.steps.length}</td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-1">
                              <Button size="xs" variant="outline" asChild>
                                <Link href={`/automations/${encodeURIComponent(item.id)}`}>
                                  {t('automationWorkflow.open')}
                                </Link>
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => void toggle(item)}
                                disabled={busy}
                              >
                                {item.status === 'enabled'
                                  ? t('automationWorkflow.disable')
                                  : t('automationWorkflow.enable')}
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => setRenaming(item)}
                                disabled={busy}
                              >
                                {t('automationWorkflow.rename')}
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => void duplicate(item)}
                                disabled={busy}
                              >
                                {t('automationWorkflow.duplicate')}
                              </Button>
                              <Button
                                size="xs"
                                variant="destructive-ghost"
                                onClick={() => void remove(item)}
                                disabled={busy}
                              >
                                {t('automationWorkflow.remove')}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </Card>
        </div>
      </main>
      {assistant.open ? (
        <AutomationWorkflowChatPanel
          onClose={assistant.hide}
          onTopicSelected={openCreate}
          onWorkflowChanged={() => void load()}
          topicOptions={eventTopics}
          workflowName={t('automationWorkflow.topicAssistantTitle')}
        />
      ) : null}

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) setSuggestedEventTopic('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('automationWorkflow.createTitle')}</DialogTitle>
          </DialogHeader>
          <CreateWorkflowForm
            key={suggestedEventTopic}
            busy={busy}
            error={error}
            initialEventTopic={suggestedEventTopic}
            onCancel={() => setCreateOpen(false)}
            onSubmit={create}
            t={t}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={renaming !== undefined}
        onOpenChange={(next) => !next && setRenaming(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('automationWorkflow.renameTitle')}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => void rename(event)}>
            <TextField
              label={t('automationWorkflow.name')}
              name="name"
              required
              defaultValue={renaming?.name}
              placeholder={t('automationWorkflow.namePlaceholder')}
            />
            {error ? <InlineError>{error}</InlineError> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setRenaming(undefined)}>
                {t('automationWorkflow.cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {t('automationWorkflow.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function existingEventTopics(workflows: readonly AutomationWorkflowViewModel[]): readonly string[] {
  return [
    ...new Set(
      workflows
        .filter((workflow) => workflow.triggerType === 'EVENT')
        .map((workflow) => workflow.eventTopic?.trim())
        .filter((topic): topic is string => Boolean(topic)),
    ),
  ];
}

function CreateWorkflowForm({
  busy,
  error,
  initialEventTopic,
  onCancel,
  onSubmit,
  t,
}: {
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly initialEventTopic: string;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly t: Translator;
}) {
  const [triggerType, setTriggerType] = useState<'EVENT' | 'SCHEDULE'>('EVENT');
  const [eventTopic, setEventTopic] = useState(initialEventTopic);
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <TextField
        label={t('automationWorkflow.name')}
        name="name"
        required
        placeholder={t('automationWorkflow.namePlaceholder')}
      />
      <SelectField
        label={t('automationWorkflow.triggerType')}
        name="triggerType"
        value={triggerType}
        onChange={(value) => setTriggerType(value as 'EVENT' | 'SCHEDULE')}
        data={[
          { label: t('automationWorkflow.triggerEvent'), value: 'EVENT' },
          { label: t('automationWorkflow.triggerSchedule'), value: 'SCHEDULE' },
        ]}
      />
      {triggerType === 'EVENT' ? (
        <TextField
          label={t('automationWorkflow.eventTopic')}
          name="eventTopic"
          required
          value={eventTopic}
          onChange={(event) => setEventTopic(event.target.value)}
          placeholder={t('automationWorkflow.eventTopicPlaceholder')}
        />
      ) : (
        <>
          <TextField
            label={t('automationWorkflow.scheduleCron')}
            name="scheduleCron"
            required
            placeholder={t('automationWorkflow.scheduleCronPlaceholder')}
          />
          <TextField
            label={t('automationWorkflow.scheduleTimezone')}
            name="scheduleTimezone"
            placeholder="UTC"
          />
        </>
      )}
      {error ? <InlineError>{error}</InlineError> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onCancel}>
          {t('automationWorkflow.cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {t('automationWorkflow.save')}
        </Button>
      </div>
    </form>
  );
}
