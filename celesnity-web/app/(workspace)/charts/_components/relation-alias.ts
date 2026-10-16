/** Creates a deterministic SQL-safe alias without changing the physical identifier. */
export function createRelationAlias(
  table: string,
  fallback: 'source' | 'join',
  existing: readonly string[] = [],
): string {
  const normalized = table
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base =
    normalized === ''
      ? fallback
      : /^[0-9]/.test(normalized)
        ? `${fallback}_${normalized}`
        : normalized;
  if (!existing.includes(base)) return base;
  let index = 2;
  while (existing.includes(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}
