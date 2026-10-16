import { SetMetadata } from '@nestjs/common';

/**
 * Opts a route out of the global bearer-authentication and authorization
 * guards entirely — for a route that must enforce its own, different
 * access control instead. There is no other way to reach an unauthenticated route in this
 * app: `BearerAuthenticationGuard`/`AuthorizationGuard` check this flag
 * before anything else and are the only two guards registered globally.
 *
 * Use sparingly and only alongside a replacement guard on the same route —
 * `@Public()` alone means no access control at all.
 */
export const IS_PUBLIC = 'celesnity.is-public';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
