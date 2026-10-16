import {
  ConflictError,
  InputParseError,
  NotFoundError,
  RemoteServiceError,
} from '@/src/entities/errors/application-errors';

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Shows only messages explicitly classified as safe at the application boundary. */
export function contextualErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof ConflictError ||
    error instanceof InputParseError ||
    error instanceof NotFoundError ||
    (error instanceof RemoteServiceError && error.exposeMessage)
  ) {
    return error.message || fallback;
  }
  return fallback;
}
