import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieName } from '@/src/entities/models/session';

export function proxy(request: NextRequest) {
  if (request.cookies.has(sessionCookieName())) return NextResponse.next();
  const login = new URL('/login', request.url);
  login.searchParams.set('returnTo', request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!api|health|login|_next/static|_next/image|favicon.ico).*)'],
};
