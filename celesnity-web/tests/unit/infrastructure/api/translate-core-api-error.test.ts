import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  FeatureAccessDeniedError,
  NotFoundError,
  RemoteServiceError,
} from '@/src/entities/errors/application-errors';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

describe('translateCoreApiError', () => {
  it('maps a 404 Core API error to NotFoundError with the original cause', () => {
    const cause = new CoreApiError(404, 'Execution not found.');

    const translated = translateCoreApiError(cause);

    expect(translated).toBeInstanceOf(NotFoundError);
    expect(translated).toMatchObject({ message: 'Execution not found.', cause });
  });

  it('maps a 409 Core API error to ConflictError with the original cause', () => {
    const cause = new CoreApiError(409, 'The connection is already archived.');

    const translated = translateCoreApiError(cause);

    expect(translated).toBeInstanceOf(ConflictError);
    expect(translated).toMatchObject({
      message: 'The connection is already archived.',
      cause,
    });
  });

  it('maps a feature-policy 403 to FeatureAccessDeniedError', () => {
    const cause = new CoreApiError(
      403,
      'The required workspace feature is not available to this account.',
      'FEATURE_ACCESS_DENIED',
    );

    const translated = translateCoreApiError(cause);

    expect(translated).toBeInstanceOf(FeatureAccessDeniedError);
    expect(translated).toMatchObject({ cause });
  });

  it('maps every other Core API status to RemoteServiceError with the original cause', () => {
    const cause = new CoreApiError(503, 'The Core API is unavailable.');

    const translated = translateCoreApiError(cause);

    expect(translated).toBeInstanceOf(RemoteServiceError);
    expect(translated).toMatchObject({
      message: 'The Core API is unavailable.',
      cause,
      exposeMessage: true,
    });
  });

  it('maps a non-Core API Error to RemoteServiceError with its message and cause', () => {
    const cause = new TypeError('fetch failed');

    const translated = translateCoreApiError(cause);

    expect(translated).toBeInstanceOf(RemoteServiceError);
    expect(translated).toMatchObject({ message: 'fetch failed', cause, exposeMessage: false });
  });

  it('uses a stable fallback for non-Error failures and preserves the cause', () => {
    const cause = { reason: 'connection reset' };

    const translated = translateCoreApiError(cause);

    expect(translated).toBeInstanceOf(RemoteServiceError);
    expect(translated).toMatchObject({
      message: 'The Core API request failed.',
      cause,
      exposeMessage: false,
    });
  });
});
