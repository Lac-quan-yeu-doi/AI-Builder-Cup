/**
 * The Prisma error codes this application reacts to.
 *
 * Prisma reports constraint violations as opaque `P####` codes on the thrown
 * error. Naming them here keeps the codes out of `catch` blocks, where a bare
 * `'P2002'` says nothing about which constraint was hit or why the repository
 * cares.
 *
 * @see https://www.prisma.io/docs/orm/reference/error-reference
 */
export enum PrismaErrorCode {
  /** A unique constraint was violated. */
  UNIQUE_VIOLATION = 'P2002',
  /** A foreign key constraint was violated. */
  FOREIGN_KEY_VIOLATION = 'P2003',
}

/**
 * Narrows an unknown thrown value to a Prisma error carrying one of `codes`.
 *
 * Structural rather than `instanceof`: the generated client and the query engine
 * can surface distinct error classes for the same condition, and only the `code`
 * field is contractual.
 */
export function hasPrismaErrorCode(error: unknown, ...codes: PrismaErrorCode[]): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const actual = (error as { readonly code?: unknown }).code;
  return codes.some((code) => code === actual);
}
