# Release 0.4.0 remediation implementation status

Branch in each repository: `codex/release-0.4.0-auth-hardening`.
This is a remediation working record, not evidence of deployed recovery. The
original assessment continues to describe its pinned release commits.

## Implemented locally

| Finding | Change | Remaining acceptance evidence |
| --- | --- | --- |
| AUTH-001 | Document MCP requires room/user delegation. Document repository requires organization context, scopes reads/lists/cursors, and attaches ownership on create. New object keys include organization ID. Migration adds a nullable FK and index. | Database migration rehearsal, verified legacy ownership mapping, two-real-tenant tests and storage IAM negatives. Existing NULL-owner documents are deliberately inaccessible. Non-null enforcement follows verified backfill. |
| AUTH-002 | Production executable exits on composition failure or missing authenticated runtime. Separate `/livez` and `/readyz`; startup/readiness probes use readiness. | Readiness currently proves composition, not continuous downstream health. Deployed dependency-failure and rollback evidence remain open. |
| AUTH-003 | Production composition uses a shared PostgreSQL replay table with unique UUID insert; verifier awaits consumption. No in-memory fallback in production. | Real PostgreSQL concurrent-replica/restart tests, permissions, cleanup load and clock-skew review. |
| AUTH-004 | All six Core MCP controllers use a common workload-identity guard. Agent obtains a Google ID token for each request to allowlisted Core MCP paths on the configured Core origin. Fixed audience/service-account verification reuses Core's workload verifier. No static-secret downgrade in production, token forwarding to other MCP origins, or credential-bearing redirects. | Coordinated Core/Agent rollout and live wrong-audience/wrong-service-account tests. Remove obsolete static-secret provisioning after all consumers are inventoried; local Docker compatibility still uses it. |
| AUTH-005 | `/catalog` uses the same owner/assertion resolver as other application endpoints. | Deployed BFF/Agent negative matrix. Local compatibility server retains its existing test/development behavior. |
| AUTH-006 | BFF removes `Forwarded` and every `x-forwarded-*` header. | Deployed mixed-case/duplicate header probe. |
| NET-002 | Production ingress permits only Core-labelled pods in `celesnity-prod` on Agent port 8080, alongside existing callers. | Live allowed/denied pod probes; NetworkPolicy uses namespace/pod selectors, not service-account selectors. |

## Migration and rollout constraints

### Authorization implementation follow-up (2026-09-21)

Core HTTP authorization and all six delegated MCP controller paths now use the
same `decideAccess` / `requireAccess` evaluator. Requirements are server-owned:
active organization, matching resource organization when supplied, organization
MFA policy, role permission and workspace feature access. Features do not grant
write permission, and platform roles do not bypass a supplied resource boundary.

An explicit MCP server/tool registry classifies read versus write operations.
Unregistered operations are denied. MCP transport POST does not imply a write;
the registered tool action does. Skill tools require the existing Administration
feature (matching Web's skill-route gate); workflows require Automations.
Room delegation is re-resolved on every call, rather than caching prior grants.

Catalog authorization now also requires the common role/MFA/organization checks
before evaluating grants. Existing catalog ownership checks, group membership,
grant expiry, descendant inheritance and explicit-deny precedence remain in the
repository. The existing shared read-only demo namespace is still a documented
exception to per-organization grants, not newly broadened by this change.

Agent-native handlers now enforce Core-evaluated signed `permissions` alongside
signed feature grants in the shared owner resolver. Core computes these grants
using the common policy evaluator, so Agent does not derive permissions from a
second role map. Missing permissions deny access; absent Core feature lists are
encoded as empty rather than unrestricted. Denials return 403 before resource
lookup. Existing resource ownership predicates and the stricter admin-only
manifest mutation check remain in place. Analytics-only blocking requests are
restricted to chart-encoding-inference, not arbitrary agent execution.

This is a bounded, at-most-60-second authorization snapshot, not online revocation.
Existing streams/runs do not continuously reauthorize. Persisted per-organization
background identities and explicit job grants are implemented locally, with a
fail-closed resolver and provisioning runbook. Legacy background-resource ownership
migration, operational endpoints, and per-operation route coverage still need
completion. Existing collection ACLs and database organization
predicates remain additional enforcement layers. Do not mark the entire
authorization redesign or assessment closed.

### Deployment prerequisites

1. Apply the document schema migration before deploying the new Core image.
2. Never assign all legacy documents to `DEFAULT_ORGANIZATION_ID`. Build an
   explicit document-ID to organization-ID mapping from verified business records.
   Reconcile storage objects separately and preserve rollback evidence. Until
   ownership is verified, NULL-owner documents remain quarantined.
3. Roll out replay protection without a mixed old/new Agent pool accepting traffic:
   old replicas still use process-local state. Drain old traffic and wait out the
   60-second assertion lifetime before declaring the cluster-wide guarantee active.
4. Agent startup needs database permission to create its replay table/index in the
   configured runtime schema. Initialization failure stops startup.
5. Development and production use `NODE_ENV=production` and therefore both use the
   durable replay implementation. Local compatibility tests may use in-memory state.
6. Deploy Core and Agent as a coordinated pair with traffic drained during the
   authentication cutover. New Core rejects old Agent static-secret requests; new
   Agent omits that secret and is incompatible with old Core MCP guards. This is
   not a zero-downtime rolling change. Verify the configured Core origin/audience,
   Agent KSA/GSA binding, and expected service-account email in each environment
   before restoring traffic. Rollback must restore the compatible pair, not one
   image independently; replay guarantees do not survive rollback to old Agent.
7. Workload identity authenticates the Agent service, not a human's right to data.
   Existing room/user delegation, feature, role and organization checks remain
   mandatory. Never substitute the Agent service account for a delegated user.
8. New Agent enforcement requires the signed `permissions` claim from new Core.
   Old assertions authenticate but authorize no application operation. Include
   this assertion-contract dependency in the paired rollout and rollback checks.
9. Apply and rehearse the organization-service-identity migration, then provision
   a distinct reviewed identity for every organization that runs jobs or accepts
   device callbacks before starting the new API/workers. No binding is created by
   the migration and missing/revoked bindings fail closed. Follow Core's
   `docs/organization-service-identities.md`; never reassign the historical shared
   worker UUID or bulk-copy its resource/catalog ownership.

## Still open — do not mark the assessment closed

- AUTH-004 follow-up: obsolete static-secret configuration cleanup and deployed
  workload-token verification. Local tests do not establish operating effectiveness.
- AUTH-007: distributed login-bootstrap throttling and enumeration policy.
- NET-001: narrow public device-callback routing must be designed and tested before
  removing general Core routes; simply deleting ingress could break device traffic.
- AUD-001: transactional audit intent/outbox for privileged operations, idempotent
  delivery and failure alerts. Throwing after mutation is not a valid substitute.
- IAM-001 / EDGE-001: storage identity/permission migration, HMAC rotation,
  protected Grafana access and edge policy changes.
- TEST-001: full clean release gates and both-environment trust-boundary tests.
- SUPPLY-001: dependency advisory remediation and verification.
- M3/M5: Privacy/Legal governance artifacts, control owners, operating evidence,
  access reviews and independent audit decisions cannot be inferred from code.

## Validation

- Core signed-permission and organization-service-identity full suite: 264 suites /
  2,212 tests passed.
  Includes protocol-level denied-write/no-side-effect and revoked-delegation tests,
  plus catalog parent inheritance and explicit-deny precedence. Typecheck/build
  and changed-file ESLint results are recorded in the task output.
- Agent signed-permission serve/auth suite: 65 test-file runs / 236 tests passed with one worker;
  typecheck and build passed. Parallel execution had one timing-sensitive room
  keepalive failure (test releases its stream after a fixed 20 ms sleep). The
  passing serial rerun does not establish that the timing sensitivity is fixed.
- Web full suite: 1,666 passed; typecheck and build passed. Repository lint and
  formatting retain pre-existing failures; these are not a clean release gate.
- Agent dev/prod Kustomize rendering passed.
- Core full-suite validation caught a missing Nest module export for the shared
  workload verifier. Export corrected. A subsequent real local API boot exposed
  that the Trino and Plant Model MCP sibling modules also had to import the
  exporting Security module. Both imports are now explicit and the composition
  regression covers them (41 tests); rebuilt API and worker started healthy.
- Agent MCP transport regressions cover refresh, credential acquisition failure,
  third-party origins and unrelated paths. Targeted ESLint passes.
- ESLint passes for all changed Core and Agent TypeScript files. Core/Agent diff
  whitespace checks pass. Existing staged assessment documents retain whitespace
  warnings; they were not rewritten as part of this implementation.
- The complete 62-migration Core chain, including the new service-identity and
  document-boundary migrations, applied successfully to a disposable PostgreSQL
  17 database after creating the repository's required owner role/schema. The new
  table had seven expected columns and zero rows, confirming no implicit grants.
- No GCP deployment, secret rotation, production migration or live test performed.
- Local operating proof: both new migrations applied, deterministic organization
  service identity seeded, Core liveness/readiness returned 200, local-owner login
  returned 204, and the authenticated Web-to-Core `/administration/me` path returned
  200. This proves only the local environment, not dev/prod operating effectiveness.
