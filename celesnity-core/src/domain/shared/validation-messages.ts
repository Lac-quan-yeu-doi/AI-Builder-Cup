/**
 * Validation messages shared by every bounded context.
 *
 * These four phrasings were each written out independently in the Script
 * Authoring, Execution Orchestration, and Query Workbench contexts. They are
 * labelled rather than fixed, so they are builders: the caller supplies which
 * field failed and the wording stays identical everywhere.
 *
 * Context-specific wording belongs in that context's own catalogue, not here.
 */
export const SharedValidationMessage = {
  mustBeValidUuid: (label: string): string => `${label} must be a valid UUID.`,
  mustBeValidDate: (label: string): string => `${label} must be a valid date.`,
  mustBeValidBucketName: (label: string): string =>
    `${label} must be a valid object-storage bucket name.`,
  mustBePositiveInteger: (label: string): string => `${label} must be a positive integer.`,

  // The text rule applied by TextGuard, and by the Catalog Exploration
  // identifier check which adds a character-set rule on top of it. Both produce
  // these exact phrasings, so they are stated once.
  isRequired: (label: string): string => `${label} is required.`,
  mustNotExceedCharacters: (label: string, maximum: number): string =>
    `${label} must not exceed ${maximum} characters.`,
  containsInvalidCharacter: (label: string): string => `${label} contains an invalid character.`,
} as const;
