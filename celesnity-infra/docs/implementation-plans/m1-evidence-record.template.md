# Milestone 1 evidence and sign-off record

Status: DRAFT — no checkbox is evidence by itself.

## Release identity

| Repository/workload | Commit or immutable image digest |
| --- | --- |
| Infra | |
| Core API and worker | |
| Web | |
| Agent | |

Evidence bundle path and SHA-256: `________________`

## Acceptance results

| Control | Result | Timestamp | Request/evidence reference |
| --- | --- | --- | --- |
| Anonymous and malformed authentication fail closed | | | |
| Expired/revoked session fails closed | | | |
| Missing MFA/unverified email cannot establish a session | | | |
| Missing/mismatched CSRF and disallowed Origin fail closed | | | |
| Suspended membership and organization fail closed | | | |
| Privileged success and denial have immutable audit rows | | | |
| Core, Agent, Trino, MCP-Trino and Grafana are private | | | |
| Control Plane requires IAP and a `celesnity.com` identity | | | |
| Static bearer compatibility remains absent | | | |
| Coordinated rollback plan/rehearsal passed | | | |

The two-tenant identifier-swap matrix is tracked in M2. It is not an
organization-switch feature and must pass before multiple customer organizations
are processed.

## Exceptions

- Cloud Armor authentication throttling is intentionally deferred. Current
  policy is default allow and is not claimed as an operating security control.
- GDPR legal/governance work and SOC 2 operating-period evidence remain outside
  this technical milestone.

## Approval

Security owner: `________________`  Date: `________________`

Platform owner: `________________`  Date: `________________`

Privacy/Legal acknowledgement: `________________`  Date: `________________`

Approval means the referenced evidence was reviewed. It does not declare GDPR
compliance or SOC 2 attestation.
