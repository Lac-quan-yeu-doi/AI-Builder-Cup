/** Validation messages owned by the MySQL connection adapter. */
export const MysqlConnectionMessage = {
  passwordEmpty: 'Database password must not be empty.',
  passwordInvalidCharacter: 'Database password contains an invalid character.',
  passwordTooLong: (maximum: number): string =>
    `Database password must not exceed ${maximum} characters.`,

  urlMalformed: 'Connection URL must be a valid MySQL URL.',
  urlSchemeUnsupported: 'Only MySQL connection URLs are supported.',
  urlFragmentUnsupported: 'Connection URL fragments are not supported.',
  urlMultipleDatabases: 'Connection URL must identify exactly one database.',
  urlPartNotEncoded: (label: string): string => `Connection URL ${label} is not correctly encoded.`,
  urlOptionUnsupported: (option: string): string => `Unsupported MySQL URL option: ${option}.`,
  urlOptionRepeated: (option: string): string =>
    `MySQL URL option ${option} must be specified once.`,
  urlAndStructuredFields: 'Submit either a MySQL URL or structured connection fields, not both.',
  fieldUnsupported: (field: string): string => `Unsupported MySQL connection field: ${field}.`,
  sslModeUnsupported: (supported: readonly string[]): string =>
    `SSL mode must be one of: ${supported.join(', ')}.`,
} as const;
