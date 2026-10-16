import { NextRequest, NextResponse } from 'next/server';

import { sessionCookieName } from '@/src/entities/models/session';

function htmlRedirect(url: string): NextResponse {
  const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${url}"></head></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return htmlRedirect(`/chat?oauth_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return htmlRedirect('/chat?oauth_error=missing_params');
  }

  const coreUrl = process.env.CORE_API_URL?.replace(/\/+$/u, '');
  if (!coreUrl) {
    return htmlRedirect('/chat?oauth_error=core_unavailable');
  }

  const session = request.cookies.get(sessionCookieName())?.value;
  const headers: Record<string, string> = {};
  if (session) {
    headers['Authorization'] = `Bearer ${session}`;
  }

  const callbackUrl = new URL(`${coreUrl}/google-drive-connector/oauth/callback`);
  callbackUrl.searchParams.set('code', code);
  callbackUrl.searchParams.set('state', state);

  const upstream = await fetch(callbackUrl, {
    headers,
    redirect: 'manual',
  });

  if (upstream.status >= 400) {
    return htmlRedirect('/chat?oauth_error=callback_failed');
  }

  return htmlRedirect('/chat?oauth_connected=google-drive');
}
