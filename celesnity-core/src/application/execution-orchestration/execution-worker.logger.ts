/**
 * Minimal logging seam so the framework-free application layer never imports a
 * framework logger. The worker module wires a NestJS `Logger`, which already
 * satisfies this shape.
 */
export interface ExecutionWorkerLogger {
  warn(message: string): void;
  error(message: string): void;
}
