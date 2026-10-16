import { UnprocessableEntityException, type ValidationError } from '@nestjs/common';

export interface FieldValidationDetail {
  readonly code: string;
  readonly field: string;
  readonly message: string;
}

export function requestValidationException(
  errors: readonly ValidationError[],
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'VALIDATION_ERROR',
    message: 'The request contains invalid fields.',
    details: { fields: errors.flatMap((error) => fieldDetails(error)) },
  });
}

function fieldDetails(error: ValidationError, parent = ''): readonly FieldValidationDetail[] {
  const field = parent === '' ? error.property : `${parent}.${error.property}`;
  const own = Object.entries(error.constraints ?? {}).map(([code, message]) => ({
    field,
    code: error.value === undefined || error.value === null ? 'REQUIRED' : validationCode(code),
    message,
  }));
  return [...own, ...(error.children ?? []).flatMap((child) => fieldDetails(child, field))];
}

function validationCode(code: string): string {
  const known: Readonly<Record<string, string>> = {
    isDefined: 'REQUIRED',
    isNotEmpty: 'REQUIRED',
    isString: 'INVALID_TYPE',
    isInt: 'INVALID_TYPE',
    isNumber: 'INVALID_TYPE',
    isArray: 'INVALID_TYPE',
    isObject: 'INVALID_TYPE',
    isIn: 'INVALID_VALUE',
    min: 'OUT_OF_RANGE',
    max: 'OUT_OF_RANGE',
    maxLength: 'TOO_LONG',
    arrayMaxSize: 'TOO_LARGE',
    whitelistValidation: 'UNKNOWN_FIELD',
  };
  return known[code] ?? 'INVALID_VALUE';
}
