import type { Metadata } from 'next';
import { Suspense } from 'react';
import { defaultLocale } from '@/app/_i18n/locales';
import { translate } from '@/app/_i18n/translate';
import { LoginScreen } from './login-screen';

export const metadata: Metadata = { title: translate(defaultLocale, 'auth.signIn') };
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginScreen />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <p className="text-sm text-muted-foreground">{translate(defaultLocale, 'auth.preparing')}</p>
    </main>
  );
}
