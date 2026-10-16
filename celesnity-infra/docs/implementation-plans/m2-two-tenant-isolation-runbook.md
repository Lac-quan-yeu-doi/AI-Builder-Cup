# M2 two-tenant isolation runbook

Status: source controls implemented; two-real-tenant deployed evidence pending.

This is adversarial authorization testing, not a tenant-switch feature. Create
two disposable organizations through the Control Plane and provision genuinely
different users, Identity Platform tenants, catalog namespaces, rooms and data.

## Preconditions

- Both organizations are active and bound to different Identity Platform tenant IDs.
- Tenant A and Tenant B each have a unique database, table, pipeline, execution,
  document, chart, agent room, member and catalog grant.
- The tester has captured identifiers but has not copied credentials between tenants.
- The deployed release uses dedicated Trino, Spark, maintenance, MCP and streaming
  service accounts and the namespace-wide default-deny NetworkPolicy.

## Matrix

Copy `scripts/m2/two-tenant-matrix.example.tsv`, replace placeholders, export
short-lived tokens, and run it with `scripts/m1/run-http-negative-matrix.sh`.
Repeat the identifier swaps through path, query, JSON body, cookie and any legacy
tenant/organization header. A `200` with an empty body is a failure: direct access
must deny before lookup, while listings must omit foreign resources.

Also verify:

- Tenant A cannot bind, publish to, subscribe to, or resume Tenant B's Agent room.
- Tenant A cannot discover Tenant B through catalog, crawler, execution, document,
  chart, group, grant or audit listings.
- Explicit DENY overrides direct/group/descendant ALLOW immediately.
- Removed group membership and expired grants deny on the next request.
- Trino custom SQL resolves every referenced catalog/schema/table and requires
  `SELECT`; unsupported syntax fails closed.
- Background jobs and events carry the server-derived organization ID; caller
  headers and body fields cannot replace it.

## Exit gate

M2 closes only when all swaps deny, every denial has request/audit correlation,
both tenant owners confirm their listings contain only their resources, and
Security reviews the rendered identity and network-policy evidence. Any cross-
tenant success stops additional onboarding and triggers coordinated rollback.
