import { PipelineCompilationError } from '@domain/pipeline-compilation/errors/pipeline-compilation.error';

/** Renders JSON-like values as safe Python literals without evaluating user input. */
export function pythonLiteral(value: unknown): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw PipelineCompilationError.issue(
        'NODE_CONFIG_INVALID',
        'Non-finite numbers cannot be represented in generated Python.',
      );
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(pythonLiteral).join(', ')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${pythonLiteral(key)}: ${pythonLiteral(value[key])}`)
      .join(', ')}}`;
  }
  throw PipelineCompilationError.issue(
    'NODE_CONFIG_INVALID',
    'The node configuration contains a value that cannot be represented in Python.',
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
