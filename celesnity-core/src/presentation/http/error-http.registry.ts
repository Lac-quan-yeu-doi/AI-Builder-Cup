import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CatalogAccessDeniedError } from '@application/catalog-exploration/catalog-access-authorizer';

import {
  ConnectionAccessError,
  ConnectionAccessErrorCode,
} from '@application/database-service/errors/connection-access.error';
import {
  ExecutionPortError,
  ExecutionPortErrorCode,
} from '@application/execution-orchestration/errors/execution-port.error';
import { QueryPortError } from '@application/query-workbench/errors/query-port.error';
import {
  ArtifactError,
  ArtifactErrorCode,
} from '@application/script-authoring/errors/artifact.error';
import {
  ScriptPublicationError,
  ScriptPublicationErrorCode,
} from '@application/script-authoring/errors/script-publication.error';
import { PendingActionError } from '@application/actions/pending-action.errors';
import {
  WorkflowAuthoringError,
  WorkflowAuthoringErrorCode,
} from '@application/data-workflow/workflow-authoring.error';
import {
  WorkflowRunError,
  WorkflowRunErrorCode,
} from '@application/data-workflow/workflow-run.error';
import { CsvIngestionError } from '@application/chart/csv-ingestion';
import { CatalogError, CatalogErrorCode } from '@domain/catalog-exploration/errors/catalog.errors';
import { ChartError } from '@domain/chart/errors/chart.errors';
import { ChartCollectionError } from '@domain/chart-collection/errors/chart-collection.errors';
import { DashboardError } from '@domain/dashboard/errors/dashboard.errors';
import {
  ConnectionError,
  ConnectionErrorCode,
} from '@domain/database-service/errors/connection.errors';
import {
  ExecutionError,
  ExecutionErrorCode,
} from '@domain/execution-orchestration/errors/execution.errors';
import { MessageBlockError } from '@domain/message-block/errors/message-block.errors';
import {
  SqlExecutionError,
  SqlExecutionErrorCode,
} from '@domain/query-workbench/errors/sql-execution.errors';
import { ScriptError, ScriptErrorCode } from '@domain/script-authoring/errors/script.errors';
import {
  NodeCatalogError,
  NodeCatalogErrorCode,
} from '@domain/node-catalog/errors/node-catalog.errors';
import {
  PipelineError,
  PipelineErrorCode,
} from '@domain/pipeline-authoring/errors/pipeline.errors';
import { PipelineCompilationError } from '@domain/pipeline-compilation/errors/pipeline-compilation.error';
import { StreamingError, StreamingErrorCode } from '@domain/streaming/errors/streaming.errors';
import { DeviceError, DeviceErrorCode } from '@domain/device-management/errors/device.errors';
import {
  MetadataCrawlerError,
  MetadataCrawlerErrorCode,
} from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import {
  PlantModelError,
  PlantModelErrorCode,
} from '@domain/plant-model/errors/plant-model.errors';
import { TutorialError } from '@domain/tutorial/errors/tutorial.errors';

/**
 * The single owner of error-to-HTTP translation.
 *
 * Replaces five duplicated mappers: inline private methods in the connection,
 * script, and SQL-execution controllers, a shared function used by the two
 * execution controllers, and a switch in the catalog controller.
 *
 * Two behaviours from those mappers are deliberately preserved:
 *
 *  - Some responses substitute a fixed message instead of echoing
 *    `error.message`. Those entries carry an explicit `detail`. Everything else
 *    surfaces the error's own message, which the domain guarantees is safe.
 *  - An error with no entry here yields a generic 500 with no message leakage.
 *    `QueryPortError` is intentionally absent: the query gateway is only reached
 *    from the background runner, so it never had an HTTP mapping.
 */

/** How one error code becomes a response. `detail` overrides `error.message`. */
interface Translation {
  readonly exception: new (response: string | object) => HttpException;
  readonly detail?: string;
}

/**
 * A per-code table for one error type. `Record` rather than `Partial<Record>` so
 * adding a code to an enum fails the build until its status is decided here.
 */
type CodeTable<TCode extends string> = Readonly<Record<TCode, Translation>>;

const ARTIFACT_UNAVAILABLE = 'The published script artifact is unavailable.';
const PUBLICATION_UNAVAILABLE = 'Script publication is temporarily unavailable.';
const ORCHESTRATION_UNAVAILABLE = 'Execution orchestration is temporarily unavailable.';

/**
 * Resolution of the one case the old mappers genuinely disagreed on.
 *
 * A failure to reach the artifact store is raised on both the publication path
 * and the execution path. The script controller answered 503 'Script publication
 * is temporarily unavailable.'; the execution controller answered 503 'Execution
 * orchestration is temporarily unavailable.' for the identical error. A single
 * filter has no caller context to choose between them, so the port's own message
 * is used: accurate from either entry point, and still a fixed string rather
 * than anything derived from the underlying cause.
 *
 * This is the only response text in the codebase that Task 5 changes. The other
 * apparent disagreements were all unreachable from the second controller, so
 * their original messages are preserved below.
 */
const ARTIFACT_STORE_UNAVAILABLE = 'The script artifact store is temporarily unavailable.';

const CONNECTION: CodeTable<ConnectionErrorCode> = {
  [ConnectionErrorCode.VALIDATION]: { exception: BadRequestException },
  [ConnectionErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [ConnectionErrorCode.NAME_CONFLICT]: { exception: ConflictException },
  [ConnectionErrorCode.ARCHIVED]: { exception: ConflictException },
  [ConnectionErrorCode.CHANGED_DURING_TEST]: { exception: ConflictException },
  [ConnectionErrorCode.UNSUPPORTED_DBMS]: { exception: UnprocessableEntityException },
  [ConnectionErrorCode.CDC_PROFILE_IN_USE]: { exception: ConflictException },
  [ConnectionErrorCode.CDC_PROFILE_CHANGED]: { exception: ConflictException },
  [ConnectionErrorCode.DATABASE_NOT_FOUND]: { exception: NotFoundException },
  [ConnectionErrorCode.DATABASE_SERVICE_NOT_FOUND]: { exception: NotFoundException },
  [ConnectionErrorCode.DATASOURCE_USED_BY_PIPELINES]: { exception: ConflictException },
  [ConnectionErrorCode.DATASOURCE_STILL_LINKED]: { exception: ConflictException },
};

const CONNECTION_ACCESS: CodeTable<ConnectionAccessErrorCode> = {
  [ConnectionAccessErrorCode.INVALID_ID]: { exception: BadRequestException },
  [ConnectionAccessErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [ConnectionAccessErrorCode.NOT_VERIFIED]: { exception: ConflictException },
  [ConnectionAccessErrorCode.DESTINATION_REJECTED]: { exception: BadRequestException },
};

const CATALOG: CodeTable<CatalogErrorCode> = {
  [CatalogErrorCode.VALIDATION]: { exception: BadRequestException },
  [CatalogErrorCode.CONFLICT]: { exception: ConflictException },
  [CatalogErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [CatalogErrorCode.UNAVAILABLE]: { exception: ServiceUnavailableException },
  [CatalogErrorCode.QUERY]: { exception: BadGatewayException },
};

const CHART: Readonly<Record<string, Translation>> = {
  CHART_NOT_FOUND: { exception: NotFoundException },
  QUERY_INVALID: { exception: BadRequestException },
  QUERY_STATEMENT_FORBIDDEN: { exception: UnprocessableEntityException },
  CHART_TYPE_UNSUPPORTED: { exception: BadRequestException },
  CHART_BINDING_INVALID: { exception: BadRequestException },
  CHART_PREVIEW_MISMATCH: { exception: ConflictException },
  CHART_ACCESS_DENIED: { exception: ForbiddenException },
  INVALID_CHART_TYPE: { exception: BadRequestException },
  MISSING_DATA: { exception: BadRequestException },
  MISSING_ENCODINGS: { exception: BadRequestException },
  SPEC_ASSEMBLY_FAILED: { exception: UnprocessableEntityException },
  CHART_VERSION_CONFLICT: { exception: ConflictException },
};

const CHART_COLLECTION: Readonly<Record<string, Translation>> = {
  COLLECTION_NOT_FOUND: { exception: NotFoundException },
  COLLECTION_ACCESS_DENIED: { exception: ForbiddenException },
  COLLECTION_MOVE_INVALID: { exception: BadRequestException },
  COLLECTION_INVALID: { exception: BadRequestException },
};

const DASHBOARD: Readonly<Record<string, Translation>> = {
  DASHBOARD_INVALID: { exception: BadRequestException },
  DASHBOARD_NOT_FOUND: { exception: NotFoundException },
  DASHBOARD_ACCESS_DENIED: { exception: ForbiddenException },
  DASHBOARD_REVISION_CONFLICT: { exception: ConflictException },
};

const TUTORIAL: Readonly<Record<string, Translation>> = {
  TUTORIAL_INVALID: { exception: BadRequestException },
  TUTORIAL_NOT_FOUND: { exception: NotFoundException },
  TUTORIAL_ACCESS_DENIED: { exception: ForbiddenException },
  TUTORIAL_RUN_CONFLICT: { exception: ConflictException },
};

const PENDING_ACTION: Readonly<Record<string, Translation>> = {
  PENDING_ACTION_NOT_FOUND: { exception: NotFoundException },
  PENDING_ACTION_ALREADY_DECIDED: { exception: ConflictException },
  PENDING_ACTION_UNKNOWN_ACTION: { exception: UnprocessableEntityException },
  PENDING_ACTION_EXPIRED: { exception: ConflictException },
};

const WORKFLOW_AUTHORING: CodeTable<WorkflowAuthoringErrorCode> = {
  [WorkflowAuthoringErrorCode.INVALID_GRAPH]: { exception: BadRequestException },
  [WorkflowAuthoringErrorCode.INVALID_NAME]: { exception: BadRequestException },
  [WorkflowAuthoringErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [WorkflowAuthoringErrorCode.REVISION_CONFLICT]: { exception: ConflictException },
};

const WORKFLOW_RUN: CodeTable<WorkflowRunErrorCode> = {
  [WorkflowRunErrorCode.ACTIVE_RUN_CONFLICT]: { exception: ConflictException },
  [WorkflowRunErrorCode.INVALID_PARAMETERS]: { exception: BadRequestException },
  [WorkflowRunErrorCode.LEASE_MISMATCH]: { exception: ConflictException },
  [WorkflowRunErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [WorkflowRunErrorCode.NOT_PUBLISHED]: { exception: ConflictException },
  [WorkflowRunErrorCode.REVISION_CONFLICT]: { exception: ConflictException },
  [WorkflowRunErrorCode.RETRY_ACKNOWLEDGEMENT_REQUIRED]: { exception: ConflictException },
  [WorkflowRunErrorCode.RETRY_NOT_ALLOWED]: { exception: ConflictException },
};

const CSV_INGESTION: Readonly<Record<string, Translation>> = {
  CSV_TOO_LARGE: { exception: BadRequestException },
  CSV_TOO_MANY_ROWS: { exception: BadRequestException },
  CSV_EMPTY: { exception: BadRequestException },
  CSV_MALFORMED: { exception: BadRequestException },
};

const NODE_CATALOG: CodeTable<NodeCatalogErrorCode> = {
  [NodeCatalogErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [NodeCatalogErrorCode.DISABLED]: { exception: ConflictException },
  [NodeCatalogErrorCode.INVALID_CONFIGURATION]: { exception: InternalServerErrorException },
};

const PIPELINE: CodeTable<PipelineErrorCode> = {
  [PipelineErrorCode.VALIDATION]: { exception: BadRequestException },
  [PipelineErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [PipelineErrorCode.NAME_CONFLICT]: { exception: ConflictException },
  [PipelineErrorCode.VERSION_CONFLICT]: { exception: ConflictException },
  [PipelineErrorCode.PREVIEW_FAILED]: { exception: BadGatewayException },
};

const PLANT_MODEL: CodeTable<PlantModelErrorCode> = {
  [PlantModelErrorCode.VALIDATION]: { exception: BadRequestException },
  [PlantModelErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [PlantModelErrorCode.NAME_CONFLICT]: { exception: ConflictException },
  [PlantModelErrorCode.VERSION_CONFLICT]: { exception: ConflictException },
  [PlantModelErrorCode.ALREADY_PUBLISHED]: { exception: ConflictException },
  [PlantModelErrorCode.CATALOG_LOOKUP_AMBIGUOUS]: { exception: ConflictException },
};

const STREAMING: CodeTable<StreamingErrorCode> = {
  [StreamingErrorCode.VALIDATION]: { exception: BadRequestException },
  [StreamingErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [StreamingErrorCode.NAME_CONFLICT]: { exception: ConflictException },
  [StreamingErrorCode.STATE_CONFLICT]: { exception: ConflictException },
};

const DEVICE: CodeTable<DeviceErrorCode> = {
  [DeviceErrorCode.VALIDATION]: { exception: BadRequestException },
  [DeviceErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [DeviceErrorCode.ADAPTER_NOT_FOUND]: { exception: NotFoundException },
  [DeviceErrorCode.ID_CONFLICT]: { exception: ConflictException },
  [DeviceErrorCode.STATE_CONFLICT]: { exception: ConflictException },
};

const METADATA_CRAWLER: CodeTable<MetadataCrawlerErrorCode> = {
  [MetadataCrawlerErrorCode.VALIDATION]: { exception: BadRequestException },
  [MetadataCrawlerErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [MetadataCrawlerErrorCode.TRANSITION]: { exception: ConflictException },
  [MetadataCrawlerErrorCode.ASSIGNMENT_CONFLICT]: { exception: ConflictException },
  [MetadataCrawlerErrorCode.ACTIVE_RUN_CONFLICT]: { exception: ConflictException },
  [MetadataCrawlerErrorCode.UNSUPPORTED_CONNECTOR]: { exception: UnprocessableEntityException },
  [MetadataCrawlerErrorCode.INVALID_SCHEDULE]: { exception: BadRequestException },
  [MetadataCrawlerErrorCode.CONCURRENCY]: { exception: ConflictException },
};

const MESSAGE_BLOCK: Readonly<Record<string, Translation>> = {
  MESSAGE_BLOCK_CURSOR_INVALID: { exception: ConflictException },
  INVALID_BLOCK_TYPE: { exception: BadRequestException },
  MISSING_PAYLOAD: { exception: BadRequestException },
  MISSING_FALLBACK_TEXT: { exception: BadRequestException },
};

const SCRIPT: CodeTable<ScriptErrorCode> = {
  [ScriptErrorCode.VALIDATION]: { exception: BadRequestException },
  [ScriptErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [ScriptErrorCode.VERSION_NOT_FOUND]: { exception: NotFoundException },
  [ScriptErrorCode.ARCHIVED]: { exception: ConflictException },
  [ScriptErrorCode.DRAFT]: { exception: ConflictException },
  [ScriptErrorCode.METADATA_CONFLICT]: { exception: ConflictException },
  [ScriptErrorCode.PUBLICATION_CONFLICT]: { exception: ConflictException },
};

const EXECUTION: CodeTable<ExecutionErrorCode> = {
  [ExecutionErrorCode.VALIDATION]: { exception: BadRequestException },
  [ExecutionErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [ExecutionErrorCode.TRANSITION]: { exception: ConflictException },
  [ExecutionErrorCode.NOT_CANCELLABLE]: { exception: ConflictException },
  [ExecutionErrorCode.CONCURRENCY]: { exception: ConflictException },
};

const SQL_EXECUTION: CodeTable<SqlExecutionErrorCode> = {
  [SqlExecutionErrorCode.VALIDATION]: { exception: BadRequestException },
  [SqlExecutionErrorCode.READ_ONLY_VIOLATION]: { exception: UnprocessableEntityException },
  [SqlExecutionErrorCode.NOT_FOUND]: { exception: NotFoundException },
  [SqlExecutionErrorCode.ILLEGAL_TRANSITION]: { exception: ConflictException },
  [SqlExecutionErrorCode.STATE_CONFLICT]: { exception: ConflictException },
};

const ARTIFACT: CodeTable<ArtifactErrorCode> = {
  [ArtifactErrorCode.ALREADY_EXISTS]: { exception: ConflictException },
  [ArtifactErrorCode.MISSING]: {
    exception: InternalServerErrorException,
    detail: ARTIFACT_UNAVAILABLE,
  },
  [ArtifactErrorCode.INTEGRITY]: {
    exception: InternalServerErrorException,
    detail: ARTIFACT_UNAVAILABLE,
  },
  [ArtifactErrorCode.STORAGE_UNAVAILABLE]: {
    exception: ServiceUnavailableException,
    detail: ARTIFACT_STORE_UNAVAILABLE,
  },
  // Only raised while rolling back a failed publication, so the publication
  // wording the script controller used stays correct.
  [ArtifactErrorCode.CLEANUP_FAILED]: {
    exception: ServiceUnavailableException,
    detail: PUBLICATION_UNAVAILABLE,
  },
  // Only raised while preparing to publish, for the same reason.
  [ArtifactErrorCode.VERSIONING_REQUIRED]: {
    exception: ServiceUnavailableException,
    detail: PUBLICATION_UNAVAILABLE,
  },
};

const SCRIPT_PUBLICATION: CodeTable<ScriptPublicationErrorCode> = {
  [ScriptPublicationErrorCode.LOCK_UNAVAILABLE]: {
    exception: ServiceUnavailableException,
    detail: PUBLICATION_UNAVAILABLE,
  },
};

const EXECUTION_PORT: CodeTable<ExecutionPortErrorCode> = {
  [ExecutionPortErrorCode.LOG_STORE_UNAVAILABLE]: {
    exception: ServiceUnavailableException,
    detail: ORCHESTRATION_UNAVAILABLE,
  },
  // The adapter attaches a redacted cause for logs; the response substitutes a
  // generic message, exactly as the mapper this replaces did.
  [ExecutionPortErrorCode.SPARK_UNAVAILABLE]: {
    exception: ServiceUnavailableException,
    detail: ORCHESTRATION_UNAVAILABLE,
  },
};

/**
 * Finds the translation for an error, or `undefined` when it has none.
 *
 * `QueryPortError` is listed so its absence from the response mapping is a
 * stated decision rather than an oversight.
 */
function translationFor(error: unknown): Translation | undefined {
  if (error instanceof CatalogAccessDeniedError) {
    return { exception: ForbiddenException };
  }
  if (error instanceof ConnectionError) {
    return CONNECTION[error.code];
  }
  if (ConnectionAccessError.is(error)) {
    return CONNECTION_ACCESS[error.code];
  }
  if (error instanceof CatalogError) {
    return CATALOG[error.code];
  }
  if (error instanceof ChartError) {
    return CHART[error.code];
  }
  if (error instanceof ChartCollectionError) {
    return CHART_COLLECTION[error.code];
  }
  if (error instanceof DashboardError) {
    return DASHBOARD[error.code];
  }
  if (error instanceof TutorialError) {
    return TUTORIAL[error.code];
  }
  if (error instanceof PendingActionError) {
    return PENDING_ACTION[error.code];
  }
  if (error instanceof WorkflowAuthoringError) {
    return WORKFLOW_AUTHORING[error.code];
  }
  if (error instanceof WorkflowRunError) {
    return WORKFLOW_RUN[error.code];
  }
  if (error instanceof CsvIngestionError) {
    return CSV_INGESTION[error.code];
  }

  if (error instanceof NodeCatalogError) {
    return NODE_CATALOG[error.code];
  }
  if (error instanceof PipelineError) {
    return PIPELINE[error.code];
  }
  if (error instanceof PlantModelError) {
    return PLANT_MODEL[error.code];
  }
  if (error instanceof PipelineCompilationError) {
    return {
      exception:
        error.issues[0]?.code === 'PIPELINE_ARTIFACT_NOT_FOUND'
          ? NotFoundException
          : BadRequestException,
      detail: error.message,
    };
  }
  if (error instanceof StreamingError) {
    return STREAMING[error.code];
  }
  if (error instanceof DeviceError) {
    return DEVICE[error.code];
  }
  if (error instanceof MetadataCrawlerError) {
    return METADATA_CRAWLER[error.code];
  }
  if (error instanceof MessageBlockError) {
    return MESSAGE_BLOCK[error.code];
  }
  if (error instanceof ScriptError) {
    return SCRIPT[error.code];
  }
  if (error instanceof ExecutionError) {
    return EXECUTION[error.code];
  }
  if (error instanceof SqlExecutionError) {
    return SQL_EXECUTION[error.code];
  }
  if (ArtifactError.is(error)) {
    return ARTIFACT[error.code];
  }
  if (ScriptPublicationError.is(error)) {
    return SCRIPT_PUBLICATION[error.code];
  }
  if (ExecutionPortError.is(error)) {
    return EXECUTION_PORT[error.code];
  }
  if (QueryPortError.is(error)) {
    // Reached only from the background query runner, never from a request.
    return undefined;
  }
  return undefined;
}

/**
 * Translates a domain or port error into an HTTP exception, or returns
 * `undefined` when the error has no mapping so the caller can surface a generic
 * 500 without leaking its message.
 */
export function toHttpException(error: unknown): HttpException | undefined {
  const translation = translationFor(error);
  if (translation === undefined) {
    return undefined;
  }
  const message =
    translation.detail ?? (error instanceof Error ? error.message : 'The request failed.');
  const code = apiCodeFor(error);
  return new translation.exception({
    code,
    message,
    details: error instanceof ConnectionError ? (error.details ?? null) : null,
  });
}

function apiCodeFor(error: unknown): string {
  if (error instanceof CatalogAccessDeniedError) return 'CATALOG_ACCESS_DENIED';
  if (error instanceof PipelineCompilationError) {
    return error.issues[0]?.code ?? 'PIPELINE_NOT_COMPILABLE';
  }
  if (error instanceof ConnectionError) {
    return `CONNECTION_${error.code}`;
  }
  if (error instanceof NodeCatalogError) {
    const codes: Readonly<Record<NodeCatalogErrorCode, string>> = {
      [NodeCatalogErrorCode.NOT_FOUND]: 'NODE_DEFINITION_NOT_FOUND',
      [NodeCatalogErrorCode.DISABLED]: 'NODE_TYPE_DISABLED',
      [NodeCatalogErrorCode.INVALID_CONFIGURATION]: 'NODE_DEFINITION_INVALID_CONFIGURATION',
    };
    return codes[error.code];
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'INTERNAL_ERROR';
}
