'use client';

import { BoxIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/app/_components/ui/button';
import { EmptyState } from '@/app/_components/ui/empty-state';
import { PageBar } from '@/app/_components/ui/page-bar';
import { useTranslation } from '@/app/_i18n/use-translation';
import { getInjection } from '@/di/container';

const plantModel = getInjection('PlantModelController');

/**
 * The sidebar's Digital twin: there is one twin per plant, so this opens the
 * first plant's, and offers a way to create a plant when there is none.
 */
export function DigitalTwinEntry() {
  const { t } = useTranslation();
  const router = useRouter();
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let active = true;
    void plantModel.listSites().then(
      (sites) => {
        if (!active) return;
        const [first] = sites;
        if (first === undefined) setEmpty(true);
        else router.replace(`/plant-model/${encodeURIComponent(first.id)}/twin`);
      },
      () => {
        if (active) setEmpty(true);
      },
    );
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main
      className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 min-[900px]:p-6"
      aria-label={t('plantTwin.pick.title')}
    >
      <PageBar title={t('plantTwin.pick.title')} />
      {empty ? (
        <EmptyState
          mark={<BoxIcon />}
          title={t('plantTwin.pick.title')}
          description={t('plantTwin.pick.empty')}
          action={
            <Button asChild>
              <Link href="/plant-model/walkthrough">{t('plantTwin.pick.walk')}</Link>
            </Button>
          }
        />
      ) : (
        <p className="text-body-sm text-muted-foreground">{t('plantTwin.pick.description')}</p>
      )}
    </main>
  );
}
