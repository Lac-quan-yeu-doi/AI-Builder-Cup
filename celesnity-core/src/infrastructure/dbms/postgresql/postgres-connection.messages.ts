/** Validation messages owned by the PostgreSQL connection adapter. */
export const PostgresConnectionMessage = {
  passwordEmpty: 'Database password must not be empty.',
  passwordInvalidCharacter: 'Database password contains an invalid character.',
  passwordTooLong: (maximum: number): string =>
    `Database password must not exceed ${maximum} characters.`,

  applicationNameTooLong: 'Application name must not exceed 63 characters.',
  applicationNameInvalidCharacter: 'Application name contains an invalid character.',

  urlMalformed: 'Connection URL must be a valid PostgreSQL URL.',
  urlSchemeUnsupported: 'Only PostgreSQL connection URLs are supported.',
  urlFragmentUnsupported: 'Connection URL fragments are not supported.',
  urlMultipleDatabases: 'Connection URL must identify exactly one database.',
  urlOptionUnsupported: (option: string): string => `Unsupported PostgreSQL URL option: ${option}.`,
  urlOptionRepeated: (option: string): string =>
    `PostgreSQL URL option ${option} must be specified once.`,
  urlPartNotEncoded: (label: string): string => `Connection URL ${label} is not correctly encoded.`,
  urlAndStructuredFields:
    'Submit either a PostgreSQL URL or structured connection fields, not both.',

  sslModeUnsupported: (supported: readonly string[]): string =>
    `SSL mode must be one of: ${supported.join(', ')}.`,
} as const;
