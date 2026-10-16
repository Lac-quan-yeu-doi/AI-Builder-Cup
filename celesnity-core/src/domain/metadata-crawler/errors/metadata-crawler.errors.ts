import { MetadataCrawlerMessage } from '@domain/metadata-crawler/errors/metadata-crawler.messages';

export enum MetadataCrawlerErrorCode {
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  TRANSITION = 'TRANSITION',
  ASSIGNMENT_CONFLICT = 'ASSIGNMENT_CONFLICT',
  ACTIVE_RUN_CONFLICT = 'ACTIVE_RUN_CONFLICT',
  UNSUPPORTED_CONNECTOR = 'UNSUPPORTED_CONNECTOR',
  INVALID_SCHEDULE = 'INVALID_SCHEDULE',
  CONCURRENCY = 'CONCURRENCY',
}

export class MetadataCrawlerError extends Error {
  public readonly code: MetadataCrawlerErrorCode;

  public constructor(code: MetadataCrawlerErrorCode, message: string) {
    super(message);
    this.name = 'MetadataCrawlerError';
    this.code = code;
  }

  public static validation(message: string): MetadataCrawlerError {
    return new MetadataCrawlerError(MetadataCrawlerErrorCode.VALIDATION, message);
  }

  public static notFound(): MetadataCrawlerError {
    return new MetadataCrawlerError(
      MetadataCrawlerErrorCode.NOT_FOUND,
      'The metadata crawler was not found.',
    );
  }

  public static transition(from: string, to: string): MetadataCrawlerError {
    return new MetadataCrawlerError(
      MetadataCrawlerErrorCode.TRANSITION,
      MetadataCrawlerMessage.transition(from, to),
    );
  }

  public static assignmentConflict(): MetadataCrawlerError {
    return new MetadataCrawlerError(
      MetadataCrawlerErrorCode.ASSIGNMENT_CONFLICT,
      MetadataCrawlerMessage.assignmentConflict,
    );
  }

  public static activeRunConflict(): MetadataCrawlerError {
    return new MetadataCrawlerError(
      MetadataCrawlerErrorCode.ACTIVE_RUN_CONFLICT,
      MetadataCrawlerMessage.activeRunConflict,
    );
  }

  public static unsupportedConnector(connectorType: string): MetadataCrawlerError {
    return new MetadataCrawlerError(
      MetadataCrawlerErrorCode.UNSUPPORTED_CONNECTOR,
      `No metadata source is registered for connector type ${connectorType}.`,
    );
  }

  public static invalidSchedule(): MetadataCrawlerError {
    return new MetadataCrawlerError(
      MetadataCrawlerErrorCode.INVALID_SCHEDULE,
      'The metadata crawler schedule is invalid.',
    );
  }

  public static concurrency(): MetadataCrawlerError {
    return new MetadataCrawlerError(
      MetadataCrawlerErrorCode.CONCURRENCY,
      'The metadata crawler changed while it was being updated. Retry with the latest state.',
    );
  }
}
