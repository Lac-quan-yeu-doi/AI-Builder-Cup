export class DashboardError extends Error {
  public readonly code: string;

  private constructor(code: string, message: string) {
    super(message);
    this.name = 'DashboardError';
    this.code = code;
  }

  public static validation(reason: string): DashboardError {
    return new DashboardError('DASHBOARD_INVALID', `DASHBOARD_INVALID: ${reason}`);
  }

  public static notFound(): DashboardError {
    return new DashboardError('DASHBOARD_NOT_FOUND', 'DASHBOARD_NOT_FOUND');
  }

  public static accessDenied(): DashboardError {
    return new DashboardError('DASHBOARD_ACCESS_DENIED', 'DASHBOARD_ACCESS_DENIED');
  }

  public static revisionConflict(): DashboardError {
    return new DashboardError(
      'DASHBOARD_REVISION_CONFLICT',
      'DASHBOARD_REVISION_CONFLICT: Reload the dashboard or save the draft as a copy.',
    );
  }
}
