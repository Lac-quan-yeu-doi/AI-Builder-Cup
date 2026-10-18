'use client';

import { useEffect, useState } from 'react';

import { DeviceManagementFeature } from '@/app/_components/device/device-management-feature';
import { Badge } from '@/app/_components/ui/badge';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { MqttStreamAdapter } from '@/src/entities/models/streaming';
import type { ManageStreamAdaptersController } from '@/src/interface-adapters/controllers/streaming/manage-stream-adapters.controller';

export interface AdapterScreenProps {
  readonly adapterId: string;
  readonly controller: ManageStreamAdaptersController;
}

/**
 * One stream adapter, and the devices filed under it.
 *
 * Devices used to be a sidebar destination of their own, beside Streaming. They
 * are not a peer of it: `ListDevicesController` takes an `adapterId`, so a device
 * belongs to exactly one adapter and the relationship is in the data rather than
 * in the layout. The screen opened on an adapter `<Select>` that the visitor had
 * to answer before anything loaded — a question this route answers for them.
 *
 * The devices screen keeps tabs of its own (health, firmware, alerts, config), so
 * this deliberately does not add a second tab strip around them. The adapter is
 * the heading; its devices are the content.
 */
export function AdapterScreen({ adapterId, controller }: AdapterScreenProps) {
  const { t } = useTranslation();
  const [adapter, setAdapter] = useState<MqttStreamAdapter>();
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    // `list()` is the only read the controller offers; there is no get-by-id, and
    // adding one would be a Core change for a page that needs one row.
    controller
      .list()
      .then((adapters) => {
        if (cancelled) return;
        const match = adapters.find((candidate) => candidate.id === adapterId);
        if (match === undefined) setFailure(t('streaming.adapterNotFound'));
        else setAdapter(match);
      })
      .catch(() => {
        if (!cancelled) setFailure(t('streaming.loadError'));
      });
    return () => {
      cancelled = true;
    };
  }, [adapterId, controller, t]);

  return (
    <section className="grid gap-5">
      <PageBar
        backTo={{ href: '/streaming', label: t('streaming.back') }}
        eyebrow={
          <>
            {t('nav.group.data')} · {t('nav.streaming')}
          </>
        }
        meta={
          adapter ? (
            <Badge variant={adapter.desiredState === 'ACTIVE' ? 'success' : 'warning'}>
              {adapter.desiredState}
            </Badge>
          ) : null
        }
        title={adapter?.name ?? adapterId}
        {...(adapter ? { description: adapter.topicFilter } : {})}
      />

      {failure ? <PageAlert tone="error">{failure}</PageAlert> : null}

      {!adapter && !failure ? (
        <Skeleton aria-label={t('state.loading')} className="h-[120px] rounded-xl" role="status" />
      ) : null}

      {adapter ? <DeviceManagementFeature adapterId={adapter.id} embedded /> : null}
    </section>
  );
}
