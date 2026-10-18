import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieName } from '@/src/entities/models/session';
import { isPausedWorkspaceRoute } from '@/app/_components/layout/route-features';

export function proxy(request: NextRequest) {
  if (request.cookies.has(sessionCookieName())) {
    if (isPausedWorkspaceRoute(request.nextUrl.pathname)) {
      return NextResponse.rewrite(new URL('/not-found', request.url));
    }
    return NextResponse.next();
  }
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  // Local development has no login screen: sign in as the owner and come back.
  if (process.env.CELESNITY_AUTH_MODE === 'local-development') {
    const signIn = new URL('/api/auth/local-session', request.url);
    signIn.searchParams.set('returnTo', returnTo);
    return NextResponse.redirect(signIn);
  }
  const login = new URL('/login', request.url);
  login.searchParams.set('returnTo', request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!api|health|login|_next/static|_next/image|favicon.ico).*)'],
};
