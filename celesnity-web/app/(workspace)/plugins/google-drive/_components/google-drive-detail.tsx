'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ChevronRightIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';

import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { PageAlert } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import { CSRF_COOKIE } from '@/src/entities/models/session';
import { useTranslation } from '@/app/_i18n/use-translation';

import { GoogleDriveIcon } from '../../_components/google-drive-icon';
import { PLUGINS } from '../../_components/plugin-registry';
import { usePluginStatus } from '../../_components/use-plugin-status';

const plugin = PLUGINS.find((p) => p.id === 'google-drive')!;

function readCsrfCookie(): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function GoogleDriveDetail() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { data, loading, refresh } = usePluginStatus(plugin.statusEndpoint);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('oauth_connected') === 'google-drive') {
      void refresh();
    }
    if (searchParams.get('oauth_error')) {
      setError(t('plugins.connectionError'));
    }
  }, [searchParams, refresh, t]);

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    setError(null);
    try {
      const csrf = readCsrfCookie();
      const res = await fetch(plugin.disconnectEndpoint, {
        method: 'DELETE',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      if (!res.ok && res.status !== 204) {
        setError('Failed to disconnect.');
        return;
      }
      setSuccess(t('plugins.disconnected'));
      await refresh();
    } catch {
      setError('Failed to disconnect.');
    } finally {
      setDisconnecting(false);
    }
  }, [refresh, t]);

  const handleConnect = () => {
    window.location.href = plugin.authorizeUrl;
  };

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link className="hover:text-foreground" href="/plugins">
          {t('plugins.title')}
        </Link>
        <ChevronRightIcon className="size-3.5" />
        <span className="text-foreground">{t(plugin.nameKey)}</span>
      </nav>

      {error ? (
        <PageAlert className="mb-6" tone="error">
          {error}
        </PageAlert>
      ) : null}
      {success ? (
        <PageAlert className="mb-6" tone="success">
          {success}
        </PageAlert>
      ) : null}

      {/* Header */}
      <div className="flex items-start gap-5">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted">
          <GoogleDriveIcon size={36} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t(plugin.nameKey)}</h1>
          <p className="text-sm text-muted-foreground">{t(plugin.descriptionKey)}</p>
        </div>
      </div>

      {/* Sign-in banner (when not connected) */}
      {!loading && data?.status !== 'connected' ? (
        <div className="mt-6 flex items-center gap-4 rounded-lg bg-status-warning-light px-5 py-3.5">
          <p className="flex-1 text-sm text-status-warning-dark">
            {t('plugins.signInBanner').replace('{name}', t(plugin.nameKey))}
          </p>
          <Button onClick={handleConnect} size="sm" variant="outline">
            {t('plugins.signIn')}
          </Button>
        </div>
      ) : null}

      {/* Description */}
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        {t(plugin.longDescriptionKey)}
      </p>

      {/* Connected accounts */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('plugins.connectedAccounts')}</h2>

        {loading ? (
          <div className="mt-4 flex justify-center py-8">
            <Spinner />
          </div>
        ) : data?.status === 'connected' && data.email ? (
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            <div className="flex items-center gap-4 px-4 py-3.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">
                {data.email.charAt(0)}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm">{data.email}</span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="Account options"
                    disabled={disconnecting}
                    size="icon"
                    variant="ghost"
                  >
                    <MoreHorizontalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    disabled={disconnecting}
                    onSelect={() => void handleDisconnect()}
                  >
                    {disconnecting ? t('plugins.disconnecting') : t('plugins.disconnect')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <button
              className="flex w-full items-center gap-4 px-4 py-3.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={handleConnect}
              type="button"
            >
              <div className="flex size-9 shrink-0 items-center justify-center">
                <PlusIcon className="size-4" />
              </div>
              {t('plugins.connectAnother')}
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-border px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">{t('plugins.notConnected')}</p>
            <Button className="mt-4" onClick={handleConnect} size="sm">
              {t('plugins.signIn')}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
