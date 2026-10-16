# M1 evidence and sign-off record

Status: OPEN until every gate below has an evidence path, reviewer, and date.

## Release identity

| Repository | Immutable SHA/tag | Evidence path |
| --- | --- | --- |
| Infra | | |
| Core | | |
| Web | | |
| Agent | | |
| Control Plane Web | | |

## Required evidence

| Gate | Owner | Acceptance condition | Evidence path | Result/date |
| --- | --- | --- | --- | --- |
| Source trust boundary | Security | `verify-m1-trust-boundary.sh` passes for the release set | | |
| Deployed negative matrix | Security | Every expected denial passes and has a request ID | | |
| Immutable audit correlation | Security | Every matrix request ID is present in the retained audit export | | |
| Exposure and identities | Platform | Routes, Services, NetworkPolicies and dedicated KSAs match the runbook | | |
| Rollback rehearsal | Platform | Immutable release set is restored inside the agreed RTO, with smoke tests passing | | |
| Privacy scope | Privacy/legal | M1 is acknowledged as a technical milestone, not GDPR compliance or SOC 2 attestation | | |

## Decision

- [ ] GO: all gates passed and evidence hashes verified.
- [ ] NO-GO: onboarding remains stopped; failed gate and rollback reference recorded below.

Decision notes:

Security owner/date:

Platform owner/date:

Privacy/legal owner/date:
