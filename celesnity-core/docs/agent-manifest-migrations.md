# Organization-scoped Agent manifest migration

Agent YAML definitions belong to an organization and its Identity Platform tenant.
The first-owner bootstrap organization is not an inventory of every organization.
Database selection (for example `kasa`) does not choose a manifest workspace.

Core exposes `GET /api/v1/internal/agent-manifest-organizations` exclusively through
the existing Agent workload-authentication guard. In GCP this requires a Google
ID token with Core's configured audience and the configured Agent service account.
A static shared secret is rejected in production. The response contains only the
IDs of active, tenant-bound organizations. Each returned organization receives a
correlated audit event; audit failure fails the request.

Deploy Core before Agent. Agent's version-pinned migration Job fetches the
inventory, applies checked-in manifest migrations independently in each scoped
workspace, and fails deployment if inventory retrieval or a migration fails.
Bootstrap organization/tenant secrets are no longer inputs to this Agent Job.
There are no new Secret Manager variables.

The production manifest loader runs the same pending migrations on the first
authenticated access to a workspace, covering organizations created after the
deployment. This is lazy workspace initialization, not synchronous provisioning
inside Core's organization-creation transaction. Completed migration markers
prevent repeat application; existing edits and deliberate deletion after migration
are preserved. A failed initialization is retried on the next request.

Manifest initialization creates definitions only. It does not enable a service
identity, assign user permissions, or create Agent catalog grants. User grants,
explicit Agent grants, and registered selected-database scope remain independent
authorization requirements.

Before promotion, verify Job completion for all expected organizations, confirm
`chat-assistant` appears in each organization's authenticated listing, and exercise
run start plus an allowed and denied tool call. Local tests and manifest rendering
do not prove deployment or live data-access recovery. Do not remove migration
markers or reset object storage as a rollback shortcut.
