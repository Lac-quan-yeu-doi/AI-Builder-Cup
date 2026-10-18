/**
 * The shared, read-only demo warehouses (Requirement: org demo database) are
 * reachable by every organization without a per-org grant row — there is no
 * code path that creates an Organization to attach one to. This is a
 * platform-level policy carve-out, not data: `AdministrationUseCases.
 * authorizeCatalog` checks this before consulting per-org grants at all.
 *
 * `iceberg.demo` is the generic fixture; the other two are the curated
 * warehouses of Demo Data 1 and 2. The compose `trino-seed` job loads all three
 * from `trino/seed/`.
 */
import type {
  CatalogPermission,
  CatalogResourceRef,
} from '@application/administration/catalog-authorization';

const DEMO_CATALOG = 'iceberg';
const DEMO_SCHEMA_IDS: readonly string[] = [
  'iceberg.demo',
  'iceberg.demo1_home_appliance',
  'iceberg.demo2_coffee_capsules',
];
const DEMO_READ_PERMISSIONS: readonly CatalogPermission[] = [
  'DISCOVER',
  'DESCRIBE',
  'PREVIEW',
  'SELECT',
];

const isUnderDemoSchema = (id: string): boolean =>
  DEMO_SCHEMA_IDS.some((schemaId) => id === schemaId || id.startsWith(`${schemaId}.`));

export function bypassesForDemoNamespace(
  permission: CatalogPermission,
  hierarchy: readonly CatalogResourceRef[],
): boolean {
  if (hierarchy.length === 0) return false;

  // The catalog-wide DISCOVER pre-check `listSchemas`/`submit()` issue before
  // per-schema filtering narrows the result down — safe to always allow,
  // since it does not itself reveal which schemas exist; the per-schema
  // check that runs immediately afterward still gates what a caller actually
  // sees, via real per-org grants for every schema except the demo ones.
  if (permission === 'DISCOVER' && hierarchy.length === 1 && hierarchy[0]?.type === 'CATALOG') {
    return hierarchy[0].id === DEMO_CATALOG;
  }

  if (!DEMO_READ_PERMISSIONS.includes(permission)) return false;
  // A bare catalog ref alone must not satisfy this — only DISCOVER gets that
  // shortcut, handled above. Everything else needs an actual schema/table/
  // column reference that resolves under a demo namespace.
  const hasDemoSpecificRef = hierarchy.some((ref) => isUnderDemoSchema(ref.id));
  if (!hasDemoSpecificRef) return false;
  return hierarchy.every(
    (ref) => (ref.type === 'CATALOG' && ref.id === DEMO_CATALOG) || isUnderDemoSchema(ref.id),
  );
}
