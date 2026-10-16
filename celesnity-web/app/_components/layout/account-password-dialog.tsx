'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/app/_components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { PasswordField, TextField } from '@/app/_components/ui/fields';
import { PageAlert } from '@/app/_components/ui/page-alert';
import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';
import { PasswordChangeError } from '@/src/entities/errors/application-errors';

interface AccountPasswordDialogProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
  readonly begin: (input: {
    readonly email: string;
    readonly currentPassword: string;
    readonly newPassword: string;
    readonly confirmPassword: string;
  }) => Promise<{ readonly kind: 'changed' } | { readonly kind: 'mfa-required' }>;
  readonly complete: (code: string, newPassword: string) => Promise<void>;
}

export function AccountPasswordDialog({
  opened,
  onClose,
  onChanged,
  begin,
  complete,
}: AccountPasswordDialogProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'credentials' | 'mfa'>('credentials');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey>();

  const resetAndClose = () => {
    setEmail('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setCode('');
    setStage('credentials');
    setError(undefined);
    onClose();
  };

  const submitCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await begin({ email, currentPassword, newPassword, confirmPassword });
      if (result.kind === 'mfa-required') setStage('mfa');
      else onChanged();
    } catch (cause) {
      setError(passwordChangeErrorKey(cause));
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await complete(code, newPassword);
      onChanged();
    } catch (cause) {
      setError(passwordChangeErrorKey(cause, true));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={opened}
      onOpenChange={(next) => {
        if (!next) resetAndClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('auth.changePasswordTitle')}</DialogTitle>
        </DialogHeader>
        {error ? <PageAlert tone="error">{t(error)}</PageAlert> : null}
        {stage === 'credentials' ? (
          <form
            className="mt-3 flex flex-col gap-4"
            onSubmit={(event) => void submitCredentials(event)}
          >
            <p className="m-0 text-sm text-muted-foreground">
              {t('auth.changePasswordDescription')}
            </p>
            <TextField
              autoComplete="email"
              label={t('auth.email')}
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <PasswordField
              autoComplete="current-password"
              label={t('auth.currentPassword')}
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.currentTarget.value)}
            />
            <PasswordField
              autoComplete="new-password"
              hint={t('auth.newPasswordHint')}
              label={t('auth.newPassword')}
              minLength={12}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.currentTarget.value)}
            />
            <PasswordField
              autoComplete="new-password"
              label={t('auth.confirmPassword')}
              minLength={12}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            />
            <div className="flex justify-end gap-2">
              <Button disabled={busy} type="button" variant="outline" onClick={resetAndClose}>
                {t('action.cancel')}
              </Button>
              <Button disabled={busy} type="submit">
                {t('auth.continuePasswordChange')}
              </Button>
            </div>
          </form>
        ) : (
          <form className="mt-3 flex flex-col gap-4" onSubmit={(event) => void submitMfa(event)}>
            <p className="m-0 text-sm text-muted-foreground">
              {t('auth.changePasswordMfaDescription')}
            </p>
            <TextField
              autoComplete="one-time-code"
              inputMode="numeric"
              label={t('auth.authenticatorCode')}
              maxLength={6}
              pattern="[0-9]{6}"
              required
              value={code}
              onChange={(event) => setCode(event.currentTarget.value)}
            />
            <div className="flex justify-end gap-2">
              <Button disabled={busy} type="button" variant="outline" onClick={resetAndClose}>
                {t('action.cancel')}
              </Button>
              <Button disabled={busy} type="submit">
                {t('auth.changePassword')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function passwordChangeErrorKey(cause: unknown, mfa = false): TranslationKey {
  if (cause instanceof PasswordChangeError) {
    const keys: Record<PasswordChangeError['reason'], TranslationKey> = {
      CURRENT_PASSWORD_INVALID: 'auth.currentPasswordInvalid',
      NEW_PASSWORD_MISMATCH: 'auth.newPasswordMismatch',
      NEW_PASSWORD_REUSED: 'auth.newPasswordReused',
      NEW_PASSWORD_WEAK: 'auth.newPasswordWeak',
      NO_PASSWORD_CHANGE_ACTIVE: 'auth.passwordChangeExpired',
    };
    return keys[cause.reason];
  }
  return mfa ? 'auth.changePasswordMfaError' : 'auth.changePasswordError';
}
