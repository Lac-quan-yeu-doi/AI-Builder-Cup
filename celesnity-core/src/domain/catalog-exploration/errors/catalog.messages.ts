/**
 * Every validation message the Catalog Exploration context can raise.
 *
 * Kept beside {@link CatalogError} rather than inline at each `throw`. This
 * context is an anti-corruption layer over Trino, so the wording stays deliberately
 * generic: it names which identifier was rejected and never echoes Trino's own error
 * text.
 */
export const CatalogMessage = {
  // "is required" and "must not exceed N characters" are shared phrasings; see
  // SharedValidationMessage. Only the character-set rule is specific to this
  // context, because only here is an identifier interpolated into composed SQL.
  identifierUnsupportedCharacters: (label: string): string =>
    `${label} may only contain letters, digits, and underscores.`,

  columnTypeRequired: 'Column type is required.',
  columnTypeInvalid: 'Column type is invalid.',
  metadataTableSuffixInvalid: 'Metadata table suffix is invalid.',

  previewRowLimitInvalid: 'The configured preview row limit is invalid.',
  namespaceAlreadyExists: 'A database with this name already exists.',
  namespaceReserved: 'This database name is reserved and cannot be created.',
  namespaceNotFound: 'The database does not exist.',
} as const;
