'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/app/_i18n/use-translation';
import { Button } from '@/app/_components/ui/button';
import { PageAlert } from '@/app/_components/ui/page-alert';
import type {
  ServiceIdentitySummary,
  UpdateAgentServiceIdentityInput,
} from '@/src/entities/models/administration';

interface ServiceIdentitiesPanelProps {
  readonly load: () => Promise<readonly ServiceIdentitySummary[]>;
  readonly update: (input: UpdateAgentServiceIdentityInput) => Promise<ServiceIdentitySummary>;
  readonly active: boolean;
}

export function ServiceIdentitiesPanel({ load, update, active }: ServiceIdentitiesPanelProps) {
  const { t } = useTranslation();
  const [identities, setIdentities] = useState<readonly ServiceIdentitySummary[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  useEffect(() => {
    if (!active) return;
    let current = true;
    void load()
      .then((value) => {
        if (current) {
          setIdentities(value);
          setRefreshRequired(false);
          setError(undefined);
        }
      })
      .catch(() => {
        if (current) setError(t('administration.serviceIdentitiesLoadError'));
      });
    return () => {
      current = false;
    };
  }, [active, load, t]);

  const refresh = async () => {
    setBusy(true);
    try {
      setIdentities(await load());
      setRefreshRequired(false);
      setError(undefined);
    } catch {
      setError(t('administration.serviceIdentitiesLoadError'));
    } finally {
      setBusy(false);
    }
  };

  const agent = identities?.find((identity) => identity.purpose === 'AGENT');
  const save = async (input: UpdateAgentServiceIdentityInput) => {
    setBusy(true);
    setError(undefined);
    try {
      await update(input);
    } catch {
      setError(t('administration.serviceIdentitiesUpdateError'));
      setBusy(false);
      return;
    }
    try {
      setIdentities(await load());
      setRefreshRequired(false);
    } catch {
      setRefreshRequired(true);
      setError(t('administration.serviceIdentitiesSavedRefreshError'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="grid gap-4 rounded-md border border-border p-4" aria-busy={busy}>
      <div>
        <h2 className="m-0 text-lg font-semibold">{t('administration.serviceIdentitiesTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('administration.serviceIdentitiesDescription')}
        </p>
      </div>
      {error ? <PageAlert tone="error">{error}</PageAlert> : null}
      <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
        {t('administration.serviceIdentitiesRefresh')}
      </Button>
      {!identities ? (
        <p role="status">{t('administration.serviceIdentitiesLoading')}</p>
      ) : (
        identities.map((identity) => (
          <div key={identity.purpose} className="rounded-md border border-border p-3">
            <strong>{identity.purpose}</strong> ·{' '}
            {identity.enabled
              ? t('administration.serviceIdentitiesEnabled')
              : t('administration.serviceIdentitiesDisabled')}{' '}
            · {identity.identity.status}
            <p className="m-0 text-sm">
              {t('administration.serviceIdentitiesPermissions', {
                values:
                  identity.permissions.join(', ') || t('administration.serviceIdentitiesNone'),
              })}
            </p>
            <p className="m-0 text-sm">
              {t('administration.serviceIdentitiesFeatures', {
                values: identity.features.join(', ') || t('administration.serviceIdentitiesNone'),
              })}
            </p>
          </div>
        ))
      )}
      {agent ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || refreshRequired || agent.identity.status !== 'ACTIVE'}
            onClick={() =>
              void save({
                enabled: !agent.enabled,
                permissions: agent.permissions,
                features: agent.features,
              })
            }
          >
            {agent.enabled
              ? t('administration.serviceIdentitiesDisableAgent')
              : t('administration.serviceIdentitiesEnableAgent')}
          </Button>
          {agent.permissions.includes('workspace:write') ? (
            <Button
              variant="outline"
              disabled={busy || refreshRequired}
              onClick={() => {
                if (window.confirm(t('administration.serviceIdentitiesRevokeWriteConfirm'))) {
                  void save({
                    enabled: agent.enabled,
                    permissions: agent.permissions.filter(
                      (permission) => permission !== 'workspace:write',
                    ),
                    features: agent.features,
                  });
                }
              }}
            >
              {t('administration.serviceIdentitiesRevokeWrite')}
            </Button>
          ) : null}
          {agent.features.map((feature) => (
            <Button
              key={feature}
              variant="outline"
              disabled={busy || refreshRequired}
              onClick={() => {
                if (
                  window.confirm(
                    t('administration.serviceIdentitiesRevokeFeatureConfirm', { feature }),
                  )
                ) {
                  const features = agent.features.filter((value) => value !== feature);
                  void save({
                    enabled: agent.enabled && features.length > 0,
                    permissions: agent.permissions,
                    features,
                  });
                }
              }}
            >
              {t('administration.serviceIdentitiesRevokeFeature', { feature })}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
