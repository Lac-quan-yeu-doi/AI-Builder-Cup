'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Button } from '@/app/_components/ui/button';
import { TextField } from '@/app/_components/ui/fields';
import { Card } from '@/app/_components/ui/card';
import { PageBar } from '@/app/_components/ui/page-bar';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { CreateMqttStreamAdapterInput } from '@/src/entities/models/streaming';
import type { ManageStreamAdaptersController } from '@/src/interface-adapters/controllers/streaming/manage-stream-adapters.controller';
import type { MqttStreamAdapterViewModel } from '@/src/interface-adapters/presenters/streaming.presenter';
import type { IssuedMqttCredential } from '@/src/entities/models/streaming';
import Link from 'next/link';

interface Props {
  readonly controller: ManageStreamAdaptersController;
}

const initialForm: CreateMqttStreamAdapterInput = {
  tenantStorageKey: '',
  tenantDisplayName: '',
  name: '',
  qos: 1,
  placementKind: 'SHARED',
};

export function StreamingScreen({ controller }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<readonly MqttStreamAdapterViewModel[]>();
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [issued, setIssued] =
    useState<Readonly<{ endpoint: string; topic: string; credential: IssuedMqttCredential }>>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setItems(await controller.list());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    }
  }, [controller, t]);

  useEffect(() => {
    let cancelled = false;
    void controller
      .list()
      .then((loaded) => {
        if (!cancelled) setItems(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : t('state.error'));
      });
    return () => {
      cancelled = true;
    };
  }, [controller, t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const created = await controller.create(form);
      setItems((current) => [created.adapter, ...(current ?? [])]);
      setIssued({
        endpoint: created.adapter.brokerUrl,
        topic: created.adapter.topicFilter,
        credential: created.credential,
      });
      setForm(initialForm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function change(id: string, action: 'pause' | 'resume') {
    setBusy(true);
    setError(undefined);
    try {
      const updated = await controller[action](id);
      setItems((current) => current?.map((item) => (item.id === id ? updated : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    if (!window.confirm(t('streaming.archiveConfirm'))) return;
    setBusy(true);
    try {
      await controller.archive(id);
      setItems((current) => current?.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  async function rotateCredential(id: string) {
    if (!window.confirm(t('streaming.rotateConfirm'))) return;
    setBusy(true);
    setError(undefined);
    try {
      const rotated = await controller.rotateCredential(id);
      setItems((current) => current?.map((item) => (item.id === id ? rotated.adapter : item)));
      setIssued({
        endpoint: rotated.adapter.brokerUrl,
        topic: rotated.adapter.topicFilter,
        credential: rotated.credential,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('state.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid gap-5 p-5">
      <PageBar
        description={t('streaming.subtitle')}
        eyebrow={
          <>
            {t('nav.group.data')} · {t('nav.streaming')}
          </>
        }
        title={t('streaming.title')}
      />
      <div className="grid gap-5 min-[1100px]:grid-cols-[minmax(300px,0.8fr)_minmax(520px,1.4fr)]">
        <Card className="h-fit p-5" asChild>
          <section aria-label={t('streaming.registerTitle')}>
            <h2 className="m-0 text-lg font-semibold text-foreground">
              {t('streaming.registerTitle')}
            </h2>
            <form className="mt-4 grid gap-4" onSubmit={(event) => void submit(event)}>
              <TextField
                hint={t('streaming.tenantKeyHint')}
                label={t('streaming.tenantKey')}
                onChange={(event) => setForm({ ...form, tenantStorageKey: event.target.value })}
                pattern="tnt_[a-z0-9]{12,48}"
                required
                value={form.tenantStorageKey}
              />
              <TextField
                label={t('streaming.tenantName')}
                onChange={(event) => setForm({ ...form, tenantDisplayName: event.target.value })}
                required
                value={form.tenantDisplayName}
              />
              <TextField
                label={t('streaming.adapterName')}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                value={form.name}
              />
              <p className="m-0 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                {t('streaming.managedEndpointHint')}
              </p>
              <Button type="submit" disabled={busy}>
                {t('streaming.register')}
              </Button>
            </form>
            {issued ? (
              <div
                role="status"
                className="mt-5 rounded-xl border border-status-warning/40 bg-status-warning-light p-4"
              >
                <h2 className="m-0 text-sm font-semibold text-foreground">
                  {t('streaming.credentialTitle')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('streaming.credentialOnce')}
                </p>
                <dl className="mt-3 grid gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">{t('streaming.brokerUrl')}</dt>
                    <dd className="m-0 break-all font-mono">{issued.endpoint}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('streaming.topicFilter')}</dt>
                    <dd className="m-0 break-all font-mono">{issued.topic}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('streaming.username')}</dt>
                    <dd className="m-0 break-all font-mono">{issued.credential.username}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('streaming.password')}</dt>
                    <dd className="m-0 break-all font-mono">{issued.credential.password}</dd>
                  </div>
                </dl>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => setIssued(undefined)}
                >
                  {t('streaming.dismissCredential')}
                </Button>
              </div>
            ) : null}
          </section>
        </Card>

        <Card className="min-h-[420px] p-5" asChild>
          <section aria-label={t('streaming.adaptersTitle')}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-lg font-semibold text-foreground">
                {t('streaming.adaptersTitle')}
              </h2>
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy}>
                {t('action.retry')}
              </Button>
            </div>
            {error ? (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            {!items ? (
              <p className="mt-6 text-sm text-muted-foreground">{t('state.loading')}</p>
            ) : null}
            {items?.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">{t('streaming.empty')}</p>
            ) : null}
            <div className="mt-4 grid gap-3" aria-live="polite">
              {items?.map((item) => (
                <article key={item.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="m-0 font-semibold text-foreground">
                        {/* The door into the adapter. Its devices live inside it
                         * rather than in a sidebar destination of their own, so a
                         * name rendered as plain text would leave them with no way
                         * in at all. */}
                        <Link
                          className="underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          href={`/streaming/${encodeURIComponent(item.id)}`}
                        >
                          {item.name}
                        </Link>
                      </h3>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {item.adapterKey}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                      {item.status}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">{t('streaming.tenantKey')}</dt>
                      <dd className="m-0 font-mono">{item.tenantStorageKey}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('streaming.placement')}</dt>
                      <dd className="m-0">
                        {item.placementKind} · {item.deploymentId}
                      </dd>
                    </div>
                    <div className="md:col-span-2">
                      <dt className="text-muted-foreground">{t('streaming.brokerUrl')}</dt>
                      <dd className="m-0 break-all font-mono">{item.brokerUrl}</dd>
                    </div>
                    <div className="md:col-span-2">
                      <dt className="text-muted-foreground">{t('streaming.topicFilter')}</dt>
                      <dd className="m-0 break-all font-mono">{item.topicFilter}</dd>
                    </div>
                    <div className="md:col-span-2">
                      <dt className="text-muted-foreground">{t('streaming.bronzePath')}</dt>
                      <dd className="m-0 break-all font-mono">{item.bronzeObjectPrefix}</dd>
                    </div>
                  </dl>
                  {item.lastError ? (
                    <p className="mt-3 text-xs text-destructive">{item.lastError}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.canPause ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void change(item.id, 'pause')}
                      >
                        {t('streaming.pause')}
                      </Button>
                    ) : null}
                    {item.canResume ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void change(item.id, 'resume')}
                      >
                        {t('streaming.resume')}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void rotateCredential(item.id)}
                    >
                      {t('streaming.rotateCredential')}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive-ghost"
                      disabled={busy}
                      onClick={() => void archive(item.id)}
                    >
                      {t('streaming.archive')}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </Card>
      </div>
    </main>
  );
}
