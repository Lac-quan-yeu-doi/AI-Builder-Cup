import {
  ConflictError,
  FeatureAccessDeniedError,
  NotFoundError,
  RemoteServiceError,
} from '@/src/entities/errors/application-errors';

import { CoreApiError } from './core-api-client';

export function translateCoreApiError(error: unknown): Error {
  if (
    error instanceof CoreApiError &&
    error.status === 403 &&
    error.code === 'FEATURE_ACCESS_DENIED'
  ) {
    return new FeatureAccessDeniedError(error.message, { cause: error });
  }
  if (error instanceof CoreApiError && error.status === 404) {
    return new NotFoundError(error.message, { cause: error });
  }
  if (error instanceof CoreApiError && error.status === 409) {
    return new ConflictError(error.message, { cause: error });
  }
  if (error instanceof CoreApiError) {
    return new RemoteServiceError(error.message, { cause: error, exposeMessage: true });
  }
  return new RemoteServiceError(
    error instanceof Error ? error.message : 'The Core API request failed.',
    { cause: error, exposeMessage: false },
  );
}
