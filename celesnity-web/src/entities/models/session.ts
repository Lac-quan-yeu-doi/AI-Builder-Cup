export const SESSION_COOKIE = '__Host-celesnity_session';
export const LOCAL_SESSION_COOKIE = 'celesnity_session';

export function sessionCookieName(): string {
  return process.env.CELESNITY_AUTH_MODE === 'local-development'
    ? LOCAL_SESSION_COOKIE
    : SESSION_COOKIE;
}
export const CSRF_COOKIE = 'celesnity_csrf';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export const LOCAL_DEVELOPMENT_PERSONAS = [
  'local-owner',
  'local-data-engineer',
  'local-analyst',
  'local-viewer',
] as const;

export type LocalDevelopmentPersona = (typeof LOCAL_DEVELOPMENT_PERSONAS)[number];
export type AuthenticationMode = 'identity-platform' | 'local-development';
