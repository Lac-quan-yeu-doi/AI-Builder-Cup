export class ChartError extends Error {
  public readonly code: string;

  private constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ChartError';
  }

  public static notFound(id: string): ChartError {
    return new ChartError('CHART_NOT_FOUND', `Chart not found: ${id}`);
  }

  public static queryInvalid(reason: string): ChartError {
    return new ChartError('QUERY_INVALID', `QUERY_INVALID: ${reason}`);
  }

  public static bindingInvalid(reason: string): ChartError {
    return new ChartError('CHART_BINDING_INVALID', `CHART_BINDING_INVALID: ${reason}`);
  }

  public static unsupportedChartType(type: string): ChartError {
    return new ChartError('CHART_TYPE_UNSUPPORTED', `CHART_TYPE_UNSUPPORTED: ${type}`);
  }

  public static statementForbidden(reason: string): ChartError {
    return new ChartError('QUERY_STATEMENT_FORBIDDEN', `QUERY_STATEMENT_FORBIDDEN: ${reason}`);
  }

  public static previewMismatch(): ChartError {
    return new ChartError('CHART_PREVIEW_MISMATCH', 'CHART_PREVIEW_MISMATCH');
  }

  public static authorizationDenied(): ChartError {
    return new ChartError('CHART_ACCESS_DENIED', 'Chart access is denied.');
  }

  /** Preserve a typed, sanitized query failure across the application boundary. */
  public static executionFailed(code: string, message: string): ChartError {
    const safeCode = /^[A-Z0-9_]{1,64}$/u.test(code) ? code : 'QUERY_EXECUTION_FAILED';
    return new ChartError(safeCode, message.slice(0, 4_000));
  }

  public static invalidChartType(chartType: string): ChartError {
    return new ChartError('INVALID_CHART_TYPE', `Unsupported chart type: ${chartType}`);
  }

  public static missingData(): ChartError {
    return new ChartError('MISSING_DATA', 'Chart data must not be empty.');
  }

  public static missingSql(): ChartError {
    return new ChartError('MISSING_SQL', 'Chart SQL is required.');
  }

  public static missingEncodings(): ChartError {
    return new ChartError(
      'MISSING_ENCODINGS',
      'At least one of encodings.x or encodings.y is required.',
    );
  }

  public static specAssemblyFailed(reason: string): ChartError {
    return new ChartError('SPEC_ASSEMBLY_FAILED', `Failed to assemble Vega-Lite spec: ${reason}`);
  }

  public static versionConflict(): ChartError {
    return new ChartError(
      'CHART_VERSION_CONFLICT',
      'The chart version has changed. Refetch the chart and retry with the current version.',
    );
  }
}
