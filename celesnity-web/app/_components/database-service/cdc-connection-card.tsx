'use client';

import { useEffect, useState } from 'react';

import type { CdcConnectionProfileInput } from '@/src/entities/models/database-service';
import { NotFoundError } from '@/src/entities/errors/application-errors';
import type { CdcConnectionProfileController } from '@/src/interface-adapters/controllers/database-services/cdc-connection-profile.controller';
import type { CdcConnectionProfileViewModel } from '@/src/interface-adapters/presenters/database-service.presenter';
import { contextualErrorMessage } from '@/app/_components/shared/error-message';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/_components/ui/alert-dialog';
import { Badge, type BadgeVariant } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/_components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/_components/ui/dialog';
import { InlineError } from '@/app/_components/ui/page-alert';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { useTranslation } from '@/app/_i18n/use-translation';

import { CdcConnectionForm } from './cdc-connection-form';

interface CdcConnectionCardProps {
  readonly connectorType: string;
  readonly controller: CdcConnectionProfileController;
  readonly databaseServiceId: string;
}

const statusTone: Record<CdcConnectionProfileViewModel['verificationStatus'], BadgeVariant> = {
  untested: 'outline',
  ready: 'success',
  'setup-required': 'warning',
  failed: 'danger',
};

export function CdcConnectionCard({
  connectorType,
  controller,
  databaseServiceId,
}: CdcConnectionCardProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<CdcConnectionProfileViewModel>();
  const [loaded, setLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    controller
      .get(databaseServiceId)
      .then((loadedProfile) => {
        if (!cancelled) setProfile(loadedProfile);
      })
      .catch((error: unknown) => {
        if (!cancelled && !(error instanceof NotFoundError)) {
          setFailure(contextualErrorMessage(error, t('source.cdc.loadError')));
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [controller, databaseServiceId, t]);

  const save = async (input: CdcConnectionProfileInput): Promise<void> => {
    const saved = await controller.save(databaseServiceId, input);
    setProfile(saved);
    setFailure(undefined);
    setDialogOpen(false);
  };

  const validate = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFailure(undefined);
    try {
      setProfile(await controller.validate(databaseServiceId));
    } catch (error) {
      setFailure(contextualErrorMessage(error, t('source.cdc.validateError')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFailure(undefined);
    try {
      await controller.remove(databaseServiceId);
      setProfile(undefined);
      setRemoveOpen(false);
    } catch (error) {
      setFailure(contextualErrorMessage(error, t('source.cdc.removeError')));
      setRemoveOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = profile
    ? t(`source.cdc.${profile.verificationStatus}`)
    : t('source.cdc.notConfigured');

  return (
    <>
      <Card className="gap-4 p-5">
        <CardHeader className="grid-cols-[1fr_auto] gap-3 p-0">
          <div className="grid gap-1">
            <CardTitle>{t('source.cdc.title')}</CardTitle>
            <CardDescription>{t('source.cdc.description')}</CardDescription>
          </div>
          {loaded ? (
            <Badge variant={profile ? statusTone[profile.verificationStatus] : 'outline'}>
              {statusLabel}
            </Badge>
          ) : (
            <Skeleton className="h-5 w-20" />
          )}
        </CardHeader>

        <CardContent className="grid gap-4 p-0">
          {profile ? (
            <dl className="m-0 grid text-body-sm">
              <div className="flex items-baseline justify-between gap-6 border-b border-border py-2">
                <dt className="text-caption text-muted-foreground">{t('source.cdc.endpoint')}</dt>
                <dd className="m-0 truncate text-right font-mono text-caption">
                  {profile.endpointSummary}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-6 border-b border-border py-2">
                <dt className="text-caption text-muted-foreground">{t('source.cdc.setupMode')}</dt>
                <dd className="m-0 text-caption">
                  {profile.setupMode === 'existing'
                    ? t('source.cdc.existing')
                    : t('source.cdc.managed')}
                </dd>
              </div>
              {profile.lastTestedAt ? (
                <div className="flex items-baseline justify-between gap-6 py-2">
                  <dt className="text-caption text-muted-foreground">
                    {t('source.cdc.lastTested')}
                  </dt>
                  <dd className="m-0 text-caption">
                    {new Date(profile.lastTestedAt).toLocaleString()}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : loaded ? (
            <p className="m-0 text-body-sm text-muted-foreground">
              {t('source.cdc.notConfiguredHint')}
            </p>
          ) : null}

          {profile?.verificationMessage ? (
            <p className="m-0 text-body-sm text-muted-foreground">{profile.verificationMessage}</p>
          ) : null}
          {failure ? <InlineError>{failure}</InlineError> : null}

          {loaded ? (
            <div className="flex flex-wrap justify-end gap-2">
              {profile ? (
                <>
                  <Button disabled={busy} onClick={() => setRemoveOpen(true)} variant="ghost">
                    {t('source.cdc.remove')}
                  </Button>
                  <Button disabled={busy} onClick={() => setDialogOpen(true)} variant="outline">
                    {t('source.cdc.replace')}
                  </Button>
                  <Button disabled={busy} onClick={() => void validate()}>
                    {t('source.cdc.validate')}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setDialogOpen(true)}>{t('source.cdc.configure')}</Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('source.cdc.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('source.cdc.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <CdcConnectionForm
            connectorType={connectorType}
            {...(profile ? { initialProfile: profile } : {})}
            onCancel={() => setDialogOpen(false)}
            onSave={save}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setRemoveOpen} open={removeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('source.cdc.removeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('source.cdc.removeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('source.cdc.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void remove()} variant="destructive">
              {t('source.cdc.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
