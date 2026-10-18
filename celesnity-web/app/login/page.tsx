import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { defaultLocale } from '@/app/_i18n/locales';
import { translate } from '@/app/_i18n/translate';
import { LoginScreen } from './login-screen';

export const metadata: Metadata = { title: translate(defaultLocale, 'auth.signIn') };

interface LoginPageProps {
  readonly searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // Read the auth mode per request: prerendered at build time, it would never be set.
  await connection();
  // Local development signs in as the owner automatically; there is no screen to show.
  if (process.env.CELESNITY_AUTH_MODE === 'local-development') {
    const { returnTo } = await searchParams;
    const target = typeof returnTo === 'string' ? returnTo : '/';
    redirect(`/api/auth/local-session?returnTo=${encodeURIComponent(target)}`);
  }
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
