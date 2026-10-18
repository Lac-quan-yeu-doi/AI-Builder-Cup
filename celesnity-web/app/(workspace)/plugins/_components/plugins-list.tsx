'use client';

import Link from 'next/link';

import { Badge } from '@/app/_components/ui/badge';
import { PageBar } from '@/app/_components/ui/page-bar';
import { Spinner } from '@/app/_components/ui/spinner';
import { useTranslation } from '@/app/_i18n/use-translation';

import { GoogleDriveIcon } from './google-drive-icon';
import { PLUGINS, type PluginDefinition } from './plugin-registry';
import { usePluginStatus } from './use-plugin-status';

function PluginRow({ plugin }: { readonly plugin: PluginDefinition }) {
  const { t } = useTranslation();
  const { data, loading } = usePluginStatus(plugin.statusEndpoint);

  return (
    <Link
      className="flex items-center gap-4 rounded-lg px-4 py-3.5 transition-colors hover:bg-accent"
      href={`/plugins/${plugin.id}`}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {plugin.id === 'google-drive' ? (
          <GoogleDriveIcon size={22} />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">{plugin.iconLabel}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{t(plugin.nameKey)}</p>
        <p className="text-sm text-muted-foreground">{t(plugin.descriptionKey)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {loading ? (
          <Spinner />
        ) : data?.status === 'connected' ? null : (
          <Badge variant="warning">{t('plugins.needsSignIn')}</Badge>
        )}
      </div>
    </Link>
  );
}

export function PluginsList() {
  const { t } = useTranslation();

  return (
    <div className="grid gap-5">
      <PageBar
        description={t('plugins.description')}
        eyebrow={
          <>
            {t('nav.group.tools')} · {t('nav.plugins')}
          </>
        }
        title={t('plugins.title')}
      />

      <div className="divide-y divide-border rounded-lg border border-border">
        {PLUGINS.map((plugin) => (
          <PluginRow key={plugin.id} plugin={plugin} />
        ))}
      </div>
    </div>
  );
}
