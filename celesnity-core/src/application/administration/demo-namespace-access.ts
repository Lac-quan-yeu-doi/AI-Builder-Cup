/**
 * The shared, read-only demo warehouse (Requirement: org demo database) is
 * reachable by every organization without a per-org grant row — there is no
 * code path that creates an Organization to attach one to. This is a
 * platform-level policy carve-out, not data: `AdministrationUseCases.
 * authorizeCatalog` checks this before consulting per-org grants at all.
 */
import type {
  CatalogPermission,
  CatalogResourceRef,
} from '@application/administration/catalog-authorization';

const DEMO_CATALOG = 'iceberg';
const DEMO_SCHEMA_ID = 'iceberg.demo';
const DEMO_READ_PERMISSIONS: readonly CatalogPermission[] = [
  'DISCOVER',
  'DESCRIBE',
  'PREVIEW',
  'SELECT',
];

export function bypassesForDemoNamespace(
  permission: CatalogPermission,
  hierarchy: readonly CatalogResourceRef[],
): boolean {
  if (hierarchy.length === 0) return false;

  // The catalog-wide DISCOVER pre-check `listSchemas`/`submit()` issue before
  // per-schema filtering narrows the result down — safe to always allow,
  // since it does not itself reveal which schemas exist; the per-schema
  // check that runs immediately afterward still gates what a caller actually
  // sees, via real per-org grants for every schema except demo.
  if (permission === 'DISCOVER' && hierarchy.length === 1 && hierarchy[0]?.type === 'CATALOG') {
    return hierarchy[0].id === DEMO_CATALOG;
  }

  if (!DEMO_READ_PERMISSIONS.includes(permission)) return false;
  // A bare catalog ref alone must not satisfy this — only DISCOVER gets that
  // shortcut, handled above. Everything else needs an actual schema/table/
  // column reference that resolves under the demo namespace.
  const hasDemoSpecificRef = hierarchy.some(
    (ref) => ref.id === DEMO_SCHEMA_ID || ref.id.startsWith(`${DEMO_SCHEMA_ID}.`),
  );
  if (!hasDemoSpecificRef) return false;
  return hierarchy.every(
    (ref) =>
      (ref.type === 'CATALOG' && ref.id === DEMO_CATALOG) ||
      ref.id === DEMO_SCHEMA_ID ||
      ref.id.startsWith(`${DEMO_SCHEMA_ID}.`),
  );
}
