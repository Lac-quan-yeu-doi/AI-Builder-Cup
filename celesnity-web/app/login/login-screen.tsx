'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';

import { Alert, AlertDescription } from '@/app/_components/ui/alert';
import { Button } from '@/app/_components/ui/button';
import { Card, CardContent } from '@/app/_components/ui/card';
import { Field, FieldLabel } from '@/app/_components/ui/field';
import { Input } from '@/app/_components/ui/input';
import { useTranslation } from '@/app/_i18n/use-translation';
import { getInjection } from '@/di/container';
import type { AuthenticationMode, LocalDevelopmentPersona } from '@/src/entities/models/session';

type LoginStage =
  | 'credentials'
  | 'email-verification-required'
  | 'mfa-challenge'
  | 'mfa-enrollment'
  | 'mfa-enrollment-complete';

interface EnrollmentDetails {
  readonly qrCodeUrl: string;
  readonly secretKey: string;
}

export function LoginScreen() {
  const controller = getInjection('AuthController');
  const router = useRouter();
  const search = useSearchParams();
  const { t } = useTranslation();
  const [organizationSlug, setOrganizationSlug] = useState(
    () => search.get('organization')?.trim().toLowerCase() ?? '',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [stage, setStage] = useState<LoginStage>('credentials');
  const [enrollment, setEnrollment] = useState<EnrollmentDetails>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [authenticationMode, setAuthenticationMode] =
    useState<AuthenticationMode>('identity-platform');

  useEffect(() => {
    let current = true;
    controller
      .authenticationMode()
      .then((mode) => {
        if (current) setAuthenticationMode(mode);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [controller]);

  const finish = () => router.replace(safeReturnTo(search.get('returnTo')));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      if (stage === 'mfa-challenge') {
        await controller.completeTotp(totp);
        finish();
        return;
      }
      if (stage === 'mfa-enrollment') {
        await controller.completeTotpEnrollment(totp);
        setTotp('');
        setEnrollment(undefined);
        setStage('mfa-enrollment-complete');
        return;
      }
      const result = await controller.signIn({ organizationSlug, email, password });
      setPassword('');
      if (result.kind === 'mfa-required') {
        setStage('mfa-challenge');
      } else if (result.kind === 'mfa-enrollment-required') {
        setEnrollment(result);
        setStage('mfa-enrollment');
      } else if (result.kind === 'email-verification-required') {
        setStage('email-verification-required');
      } else {
        finish();
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setEnrollment(undefined);
    setFailed(false);
    setPassword('');
    setTotp('');
    setStage('credentials');
  };

  const signInAsLocalPersona = async (persona: LocalDevelopmentPersona) => {
    setBusy(true);
    setFailed(false);
    try {
      await controller.signInAsLocalPersona(persona);
      finish();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <Card asChild className="w-full max-w-md">
        <section>
          <CardContent className="flex flex-col gap-4">
            <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">{t('auth.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('auth.subtitle')}</p>
              </div>

              {failed ? (
                <Alert role="alert" variant="destructive">
                  <AlertDescription>{t('auth.error')}</AlertDescription>
                </Alert>
              ) : null}

              {authenticationMode === 'local-development' ? (
                <Alert role="status">
                  <AlertDescription>{t('auth.localDevelopmentNotice')}</AlertDescription>
                </Alert>
              ) : null}
              {search.get('passwordChanged') === '1' ? (
                <Alert role="status">
                  <AlertDescription>{t('auth.passwordChanged')}</AlertDescription>
                </Alert>
              ) : null}

              {stage === 'email-verification-required' ? (
                <Alert role="status">
                  <AlertDescription>{t('auth.emailVerificationRequired')}</AlertDescription>
                </Alert>
              ) : null}
              {stage === 'mfa-enrollment-complete' ? (
                <Alert role="status">
                  <AlertDescription>{t('auth.enrollmentComplete')}</AlertDescription>
                </Alert>
              ) : null}

              {stage === 'credentials' && authenticationMode === 'identity-platform' ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="login-organization">{t('auth.organization')}</FieldLabel>
                    <Input
                      autoComplete="organization"
                      id="login-organization"
                      onChange={(event) =>
                        setOrganizationSlug(event.currentTarget.value.toLowerCase())
                      }
                      pattern="[a-z][a-z0-9-]{1,62}"
                      required
                      value={organizationSlug}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="login-email">{t('auth.email')}</FieldLabel>
                    <Input
                      autoComplete="username"
                      id="login-email"
                      onChange={(event) => setEmail(event.currentTarget.value)}
                      required
                      type="email"
                      value={email}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="login-password">{t('auth.password')}</FieldLabel>
                    <Input
                      autoComplete="current-password"
                      id="login-password"
                      onChange={(event) => setPassword(event.currentTarget.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </Field>
                </>
              ) : null}

              {stage === 'credentials' && authenticationMode === 'local-development' ? (
                <div className="grid gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => void signInAsLocalPersona('local-owner')}
                    type="button"
                  >
                    {t('auth.localOwner')}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void signInAsLocalPersona('local-data-engineer')}
                    type="button"
                    variant="secondary"
                  >
                    {t('auth.localDataEngineer')}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void signInAsLocalPersona('local-analyst')}
                    type="button"
                    variant="secondary"
                  >
                    {t('auth.localAnalyst')}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => void signInAsLocalPersona('local-viewer')}
                    type="button"
                    variant="secondary"
                  >
                    {t('auth.localViewer')}
                  </Button>
                </div>
              ) : null}

              {stage === 'mfa-enrollment' && enrollment !== undefined ? (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-foreground">{t('auth.enrollmentInstructions')}</p>
                  <div className="flex justify-center rounded border border-border bg-card p-4">
                    <QRCodeSVG
                      aria-label={t('auth.enrollmentQrLabel')}
                      role="img"
                      size={200}
                      value={enrollment.qrCodeUrl}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">{t('auth.manualSecret')}</p>
                  <code className="break-all rounded bg-muted p-3 text-sm text-foreground">
                    {enrollment.secretKey}
                  </code>
                </div>
              ) : null}

              {stage === 'mfa-challenge' || stage === 'mfa-enrollment' ? (
                <Field>
                  <FieldLabel htmlFor="login-totp">{t('auth.authenticatorCode')}</FieldLabel>
                  <Input
                    autoComplete="one-time-code"
                    id="login-totp"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setTotp(event.currentTarget.value)}
                    pattern="[0-9]{6}"
                    required
                    value={totp}
                  />
                </Field>
              ) : null}

              {stage === 'email-verification-required' || stage === 'mfa-enrollment-complete' ? (
                <Button onClick={restart} type="button" variant="secondary">
                  {t('auth.returnToSignIn')}
                </Button>
              ) : authenticationMode === 'identity-platform' ? (
                <Button aria-busy={busy} disabled={busy} type="submit">
                  {stage === 'mfa-enrollment'
                    ? t('auth.enrollAuthenticator')
                    : stage === 'mfa-challenge'
                      ? t('auth.verify')
                      : t('auth.signIn')}
                </Button>
              ) : null}
            </form>
          </CardContent>
        </section>
      </Card>
    </main>
  );
}

function safeReturnTo(value: string | null): string {
  return value !== null && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
