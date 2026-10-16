# Celesnity administration, governance, GDPR, and SOC 2 plan

Status: active implementation plan  
Baseline date: 2026-08-23  
Milestone 0 status: technical implementation complete; human approvals pending  
Initial production target: EU regional cell  
SOC 2 scope: Security, Availability, Confidentiality, and Privacy  
Availability target: 99.9% monthly; RTO 4 hours; RPO 15 minutes

## 1. Purpose and use

This is the implementation and control register for administration, tenant
governance, GDPR readiness, and SOC 2 Type II readiness across
`celesnity-core`, `celesnity-web`, and `celesnity-infra`. It complements the
[GCP architecture and GDPR validation report](../gcp-gdpr-validation-report/report.html);
the report is the evidence snapshot and this file is the delivery roadmap.

Technical safeguards alone do not establish GDPR compliance, and using a
SOC-certified cloud provider does not make Celesnity SOC 2 compliant. This plan
therefore includes application, infrastructure, legal/privacy, workforce,
vendor, operational, and evidence controls. Legal conclusions and the final
SOC 2 examination remain the responsibility of qualified counsel and an
independent auditor.

Control status values are:

- `NOT_STARTED`: no approved design or operating control.
- `DESIGNED`: design and owner approved; implementation has not passed tests.
- `IMPLEMENTED`: implementation tests pass; operating evidence is not mature.
- `OPERATING`: the control is used on its required schedule.
- `VERIFIED`: owner, reviewer, test, evidence, and review date are recorded.
- `BLOCKED`: a named dependency prevents progress.
- `RISK_ACCEPTED`: executive-approved exception with compensating controls and expiry.
- `NOT_APPLICABLE`: documented scope analysis and reviewer approval exist.

A merged change is not enough to mark a control `VERIFIED`. Each control must
record requirement, current gap, feature, infrastructure control, procedure,
owner, evidence, test, milestone, status, and review date.

## 2. Milestone 0 baseline

### 2.1 Repository and deployment reconciliation

| Surface | Approved branch snapshot | Remote comparison | Live deployment on 2026-08-23 | Result |
| --- | --- | --- | --- | --- |
| Infra | `release/0.0.1` / `8bad472` | Matches `origin/release/0.0.1` | Live resources inspected in `cosmos3-mmad-research` | Repository baseline confirmed |
| Core | `release/0.0.1` / `4f66cc4` | Matches `origin/release/0.0.1` | API/worker image `40ea1eb`; metadata worker `c0ae879` | Drift: live images do not represent the release head |
| Web | `release/0.0.1` / `7d335b1` | Matches `origin/release/0.0.1` | Web image `9685021` | Drift: live image does not represent the release head |

The three currently staged files under `docs/gcp-gdpr-validation-report/`
(`artifact.json`, `report.html`, and `source-notes.md`) existed before this
implementation and must be preserved. The earlier workspace snapshot also
listed `evidence.sqlite`; it was absent from both the working tree and index at
the 2026-08-23 verification point and therefore is not claimed as current
evidence. No production deployment is authorized by Milestone 0.
Reconciliation means recording drift; replacing the live images requires a
separately approved deployment.

### 2.2 Current live GCP evidence

Read-only checks used account `dax.pham@celesnity.com`, project
`cosmos3-mmad-research`, and cluster context
`gke_cosmos3-mmad-research_asia-southeast1-a_celesnity-gcp-dev`.

| Area | Verified state | Compliance meaning | Required disposition |
| --- | --- | --- | --- |
| GKE | Zonal `asia-southeast1-a`; private nodes; public endpoint; Workload Identity enabled | Useful baseline but not the target EU regional/HA boundary | Replace with EU regional production cell; restrict administration |
| Network isolation | Six NetworkPolicy objects exist; GKE reports neither NetworkPolicy enforcement nor Dataplane V2 | Objects are effectively non-enforcing | Enable enforcement and test default-deny traffic |
| Core authentication | `API_AUTH_ENABLED=false` | Anonymous application access is a production launch blocker | Hard authentication cutover in Milestone 1 |
| Cloud SQL | `celesnity-gcp-dev-postgres`, PostgreSQL 17, zonal, private IP, `ENCRYPTED_ONLY` | Encryption foundation exists; resilience and recovery are insufficient | Regional HA, PITR, deletion protection, restore tests |
| Workloads | Core, Web, Trino, Grafana, EMQX, Redpanda, Loki and other critical components include singleton workloads | Does not meet the target availability design | Add HA or explicitly classify non-critical workloads |
| Monitoring | Loki/Grafana are deployed; managed service metrics, SLO alerts, and uptime evidence are incomplete | Logs alone are not an operating availability/security control | Central metrics, alerts, SLOs, paging, and evidence health |
| Release traceability | Live Core and Web image tags differ from release heads | Cannot prove the approved source is what is running | Add immutable provenance and deployment reconciliation |

### 2.3 Milestone 0 owners and accountability

Names are assigned in the company control system before a control becomes
`OPERATING`. Until then these roles are the accountable placeholders.

| Role | Accountabilities | Initial cadence |
| --- | --- | --- |
| Executive sponsor | Risk acceptance, budget, compliance scope, management review | Quarterly and on critical exceptions |
| Product owner | Product purpose, customer commitments, feature acceptance | Per release |
| Engineering owner | Core/Web design, authorization, privacy workflows, secure SDLC | Continuous; monthly review |
| Platform/SRE owner | GCP, IAM, networking, backups, SLOs, incident operations | Continuous; monthly review |
| Security/compliance owner | Risk register, SOC controls, evidence, vulnerability and access review | Monthly/quarterly |
| Privacy owner or DPO | ROPA, DPIA, rights, breach and transfer decisions | Monthly and change-triggered |
| Legal owner | Contracts, DPA, SCC/TIA, retention/legal-hold approval | Change-triggered; annual review |
| People/IT owner | Joiner/mover/leaver, training, workforce access and devices | Per event; quarterly review |
| Vendor owner | Due diligence, subprocessors, renewal and exit | Before onboarding; annual review |
| Independent reviewer | Control design/readiness and SOC 2 examination | At readiness gates |

One person may hold several roles during the startup phase, but the requester
and approver for production privileged access, risk acceptance, and evidence
review must not be the same person.

### 2.4 Controller and processor working assumptions

- Celesnity is normally the controller for workforce, applicant, prospect,
  customer-account, billing, product-usage, support, and platform-security data.
- Celesnity is normally the processor for industrial/customer datasets uploaded
  or streamed under customer instructions; the customer is normally the
  controller. Contracts and actual purposes override this default.
- Celesnity becomes a controller or joint controller for a customer dataset if
  it independently determines a new purpose, such as cross-customer model
  training or product analytics. Such use is prohibited until legal basis,
  notice, contract, DPIA, and opt-out/rights analysis are approved.
- Special-category personal data and children's data are prohibited by default.
- Operational logs and identifiers may be personal data even when machine
  telemetry is not. Classification is based on content and identifiability, not
  the database or topic name.
- The Identity Platform US processing decision is conditionally accepted only
  after DPA, SCC/TIA, notice, minimization, support-access, and vendor records
  are approved.

## 3. Target application capabilities

| ID | Capability | Required behavior and acceptance boundary |
| --- | --- | --- |
| F01 | Identity and sessions | Identity Platform sign-in, verification, reset, TOTP MFA, federation-ready interface, secure same-origin HTTP-only sessions, CSRF protection, expiry/revocation, no browser-visible static bearer token |
| F02 | Organization administration | Organization, home region, status, verified domains, membership, invitations, suspension, and controlled offboarding. One Identity Platform tenant maps to exactly one organization; organization switching is not a product feature. |
| F03 | Authorization | Default-deny resource/action policy; platform admin, support, org owner/admin, data engineer, analyst, viewer, auditor, and service-account roles; Core is authoritative |
| F04 | User lifecycle and access review | Invite, activate, suspend, terminate, expiring privilege, quarterly certification, exception and revocation evidence |
| F05 | Service identities | Organization-scoped credentials, scopes, expiry, rotation, owner, last-used, revocation, and Workload Identity preference |
| F06 | Support and break-glass access | Ticket, reason, tenant, approval, MFA, expiry, high-severity event, next-business-day review, customer-visible history |
| F07 | Immutable audit trail | Auth, authorization, data access/export/delete, privacy, retention, support, config and deployment events; redacted before/after metadata; searchable but not mutable |
| F08 | Data governance catalog | Asset owner/steward, tenant, region, classification, purpose, lawful basis, retention, lineage, source, recipients and downstream uses |
| F09 | Retention and deletion | Versioned policy, dry run, scheduled deletion, legal hold, derived-data cleanup, backup expiry, failure handling, and deletion certificate |
| F10 | Rights workflow | Access, rectification, erasure, restriction, portability, objection and automated-decision review with verification, deadline, approval, exception and evidence |
| F11 | Notice and consent | Versioned notices and terms; purpose and jurisdiction; consent/withdrawal only where consent is the lawful basis; non-essential tracking blocked until valid consent where required |
| F12 | Incident and breach cases | Severity, affected tenants/data, timeline, containment, evidence, notification decision, 72-hour workflow, communications and corrective actions |
| F13 | Monitoring administration | Tenant-safe system health, SLO, incident, ingestion backlog, failed job, quota and audit-log health views |
| F14 | AI governance | Model owner/purpose/version, data sources, validation, region, offline/shadow/production state, human review, explainability and deployment approval |
| F15 | Compliance evidence exporter | Signed/redacted evidence with source, collection time, hash, control mapping and retention; push to Probo with least privilege |
| F16 | Tenant data-plane provisioning | Idempotent and audited database/schema, storage, Kafka, Iceberg, Spark/query identity, quota, key and region provisioning/offboarding |

### 3.1 Public interface rules

- Core exposes versioned authenticated APIs for organizations, memberships,
  invitations, roles, policies, access reviews, service identities, audit events,
  governance assets, retention, legal holds, privacy requests, incidents, model
  registrations, and evidence exports.
- Authenticated context derives subject, organization, session, authentication
  strength, region, roles, and permissions from validated server-side state. A
  browser-supplied organization header never establishes authorization.
- Every organization-owned model has an immutable organization key and every
  repository/query entry point requires scoped context.
- Sensitive mutations require idempotency, authorization, audit outcome, and
  optimistic concurrency where conflicting edits are possible.
- Export, deletion, access-review, and evidence operations are asynchronous
  jobs with explicit state, approval, failure, retry, and completion evidence.
- Web follows Clean Architecture: React invokes controllers/use cases resolved
  through dependency injection; it never calls Core directly.

## 4. Target infrastructure capabilities

| ID | Control | Required implementation |
| --- | --- | --- |
| I01 | EU production cell | Separate production project, regional multi-zone GKE and Cloud SQL, region-local storage/processing, separate non-production/security/compliance projects |
| I02 | Identity boundary | Dedicated production Identity Platform config/tenant, MFA, domain/redirect allowlist, minimized attributes and audit logging |
| I03 | Edge/API boundary | Same-origin Web gateway, no anonymous public Core path, service-specific Cloud Armor, rate limiting, IAP/VPN/private admin tools, TLS |
| I04 | Network isolation | Dataplane V2 or enforced NetworkPolicy; namespace default-deny; explicit DNS, SQL, Kafka, storage, telemetry and Google API paths; controlled egress |
| I05 | IAM | One Kubernetes/Google service account per workload, minimum roles, token automount disabled unless required, quarterly IAM review and break-glass isolation |
| I06 | Secrets and keys | Secret Manager, rotation/expiry/owner, remove shared credentials and broad HMAC, CMEK where justified, separation of key and data administration |
| I07 | Database | Regional HA, PITR, deletion protection, private access, encrypted connections, quarterly restore test, separate app/migration/reporting/emergency roles |
| I08 | Data isolation | Tenant-aware bucket/prefix, topic, group, schema, Spark work area, Iceberg namespace and query authorization; authenticated tenant overrides client input |
| I09 | Observability | Restricted logging project, redaction, audit/application/platform logs, managed metrics, uptime, alerts, paging and evidence health |
| I10 | Supply chain | Protected releases, required review/checks, SAST/dependency/secret/container/IaC/license scans, SBOM, signed digest, provenance, admission and drift detection |
| I11 | Vulnerability management | Central findings, external exposure inventory, annual penetration test; critical 7-day, high 30-day and medium 90-day remediation unless approved exception |
| I12 | Availability/DR | Critical stateless replicas, disruption budgets, topology spread, autoscaling, RPO 15m/RTO 4h; quarterly restore, semiannual failover, annual DR exercise |
| I13 | Probo | Separate internal deployment/project, pinned and maintained release, isolated evidence bucket/identity, redacted evidence only, backup and restore test |
| I14 | Privileged administration | Workforce SSO/MFA, named accounts, time-bound elevation, approval, central audit and controlled database/cluster channels |
| I15 | Environment separation | Separate projects, identities, keys, domains, databases and buckets; synthetic test data; production data prohibited from non-production unless irreversibly anonymized and approved |

Default log retention is 400 days for security/admin audit events, 90 days for
ordinary operations, and 30 days for debug logs. The privacy/legal retention
schedule must approve or replace these defaults before production.

## 5. GDPR checklist

### Accountability and lawful processing

- [ ] `GDPR-GOV-01` Approve controller/processor roles and Article 28 customer DPA. Owner: Privacy/Legal. Features: F08/F15. Evidence: processing-role matrix and signed DPA.
- [ ] `GDPR-GOV-02` Record whether a statutory DPO is required and appoint privacy ownership. Owner: Executive/Legal. Evidence: approved assessment.
- [ ] `GDPR-GOV-03` Maintain ROPA entries for purpose, data, subject, recipients, region/transfer, retention and safeguards. Owner: Privacy. Features: F08. Evidence: versioned ROPA export.
- [ ] `GDPR-GOV-04` Perform annual and material-change privacy risk reviews. Owner: Privacy/Security. Evidence: review and remediation history.
- [ ] `GDPR-GOV-05` Complete DPIAs before high-risk monitoring, special-category processing or consequential AI. Owner: Privacy/Product. Features: F14.
- [ ] `GDPR-GOV-06` Require purpose and lawful basis before production ingestion. Owner: Data owner/Privacy. Features: F08/F16.

### Privacy by design, notice and minimization

- [ ] `GDPR-PBD-01` Default every tenant, role, asset and API to minimum access. Owner: Engineering/Security. Features: F02/F03. Controls: I03-I05.
- [ ] `GDPR-PBD-02` Publish versioned notices covering data, purpose, retention, recipients, transfers, rights and contacts. Owner: Privacy/Legal. Feature: F11.
- [ ] `GDPR-PBD-03` Record consent only where applicable and make withdrawal equally easy. Owner: Product/Privacy. Feature: F11.
- [ ] `GDPR-PBD-04` Classify/minimize fields and redact sensitive logs. Owner: Data owners/Security. Features: F07/F08. Controls: I09.
- [ ] `GDPR-PBD-05` Block special-category/children's data until contract, DPIA and controls are approved. Owner: Privacy/Product. Features: F08/F14.

### Data-subject rights

- [ ] `GDPR-DSR-01` Verify identity and record request intake without collecting excessive proof. Owner: Privacy/Support. Feature: F10.
- [ ] `GDPR-DSR-02` Search and export account, collaboration, audit and derived personal data in understandable and portable forms. Owner: Engineering/Privacy. Feature: F10.
- [ ] `GDPR-DSR-03` Rectify source and derived records or record why correction must occur at the source. Owner: Data owner. Feature: F10.
- [ ] `GDPR-DSR-04` Erase, restrict or apply objection while preserving documented legal-hold/statutory exceptions. Owner: Privacy/Legal. Features: F09/F10.
- [ ] `GDPR-DSR-05` Provide human review and explanation for qualifying automated decisions. Owner: Product/Privacy. Feature: F14.
- [ ] `GDPR-DSR-06` Complete verified requests within 30 calendar days by default and record lawful extensions. Owner: Privacy. Features: F10/F15.

### Retention and disposal

- [ ] `GDPR-RET-01` Approve retention by data class and purpose. Owner: Privacy/Legal/Data owners. Feature: F09.
- [ ] `GDPR-RET-02` Run and monitor automatic expiry with retry/exception handling. Owner: Platform/Data owner. Features: F09/F13.
- [ ] `GDPR-RET-03` Authorize, apply, expire and review legal holds. Owner: Legal. Feature: F09.
- [ ] `GDPR-RET-04` Cover primary, derived, search, cache, queue and backup lifecycle. Owner: Engineering/Platform. Controls: I07-I09.
- [ ] `GDPR-RET-05` Generate evidence that does not retain the deleted personal content. Owner: Privacy/Security. Features: F09/F15.

### Security, breach and transfers

- [ ] `GDPR-SEC-01` Enforce authentication, privileged MFA and session revocation. Features: F01. Controls: I02/I03.
- [ ] `GDPR-SEC-02` Enforce tenant authorization on every resource/query and run cross-tenant negative tests. Features: F02-F05/F16. Controls: I05/I08.
- [ ] `GDPR-SEC-03` Encrypt, rotate secrets/keys, isolate networks, audit access and test recovery. Features: F07/F13. Controls: I04-I12.
- [ ] `GDPR-BR-01` Acknowledge severe alerts within 15 minutes, assess within 4 hours, escalate to privacy/legal within 12 hours, and support the 72-hour regulatory decision. Feature: F12.
- [ ] `GDPR-BR-02` Preserve incident facts, affected data/tenants, notification decisions, communications and corrective action. Features: F12/F15.
- [ ] `GDPR-VEN-01` Review processors/subprocessors before use and annually by risk; maintain DPA, security, change, deletion and exit records. Owner: Vendor/Legal/Security.
- [ ] `GDPR-XFR-01` Record every international transfer and safeguard in ROPA/notices. Owner: Privacy/Legal. Feature: F08.
- [ ] `GDPR-XFR-02` Approve SCC/TIA safeguards for Identity Platform US processing and non-EU support access. Owner: Legal/Privacy. Controls: I02/I14.
- [ ] `GDPR-XFR-03` Block unapproved cross-region export/processing. Owner: Engineering/Platform. Features: F08/F16. Controls: I01/I08.

## 6. SOC 2 checklist

### Security/Common Criteria

- [ ] `SOC2-CC1` Approve security/privacy governance, ethics, policy ownership and management oversight. Evidence: policy approvals and quarterly minutes.
- [ ] `SOC2-CC2` Communicate policies, responsibilities, incidents, commitments and control changes to affected personnel/customers.
- [ ] `SOC2-CC3` Maintain enterprise, security, privacy, availability, vendor, fraud and change risk registers.
- [ ] `SOC2-CC4` Perform quarterly owner attestations, evidence checks, exception review and management reporting.
- [ ] `SOC2-CC5` Map each risk to preventive/detective controls, owner, frequency, evidence and escalation.
- [ ] `SOC2-CC6` Operate joiner/mover/leaver, MFA, least privilege, quarterly access review, tenant isolation and privileged-access evidence. Features: F01-F06. Controls: I02-I05/I14.
- [ ] `SOC2-CC7` Operate logging, monitoring, vulnerability, incident, threat detection and remediation. Features: F07/F12/F13. Controls: I09-I11.
- [ ] `SOC2-CC8` Require approved, tested, reviewed, traceable and reversible application/infrastructure changes. Control: I10.
- [ ] `SOC2-CC9` Govern vendors, risk acceptance, business continuity, contracts and recovery dependencies. Controls: I12/I13.

### Availability

- [ ] `SOC2-A1-01` Define service boundary and 99.9% monthly objective.
- [ ] `SOC2-A1-02` Monitor dependency health, capacity and error-budget burn.
- [ ] `SOC2-A1-03` Demonstrate RPO 15 minutes/RTO 4 hours using HA, PITR, backups and runbooks.
- [ ] `SOC2-A1-04` Run quarterly restore, semiannual failover and annual full DR exercises.
- [ ] `SOC2-A1-05` Review outages and close corrective actions.

### Confidentiality

- [ ] `SOC2-C1-01` Classify confidential/customer data and assign owners. Feature: F08.
- [ ] `SOC2-C1-02` Restrict, encrypt, monitor and review confidential-data access. Controls: I05-I09.
- [ ] `SOC2-C1-03` Control disclosure, export, transfer, retention and disposal. Features: F09/F10/F16.
- [ ] `SOC2-C1-04` Maintain employee, contractor and vendor confidentiality obligations.

### Privacy

- [ ] `SOC2-P1` Maintain accurate notices and privacy communications. Feature: F11.
- [ ] `SOC2-P2` Record choice/consent where applicable. Feature: F11.
- [ ] `SOC2-P3` Limit collection to approved purposes. Features: F08/F16.
- [ ] `SOC2-P4` Restrict use, retention and disposal. Features: F08/F09.
- [ ] `SOC2-P5` Operate access, correction and rights handling. Feature: F10.
- [ ] `SOC2-P6` Control disclosure, vendors and transfers. Features: F08/F15.
- [ ] `SOC2-P7` Correct material personal-data inaccuracies. Feature: F10.
- [ ] `SOC2-P8` Monitor complaints, privacy controls, incidents and remediation. Features: F12/F15.

### Workforce and recurring operations

- [ ] Complete proportionate pre-employment checks where legally permitted.
- [ ] Sign confidentiality, acceptable-use and security obligations.
- [ ] Complete security/privacy training at onboarding and annually.
- [ ] Disable terminated privileged access immediately and all scoped access within four hours.
- [ ] Review privileged access monthly and all scoped access quarterly.
- [ ] Review vendors before onboarding and annually according to risk.
- [ ] Review policies annually and following material change/incident.
- [ ] Conduct security/privacy tabletop exercises semiannually.
- [ ] Give every exception an owner, compensating control, approval and expiry.

## 7. Delivery milestones and gates

### Milestone 0 — Baseline and control ownership

- [x] Create this implementation/control-register source and link the validated report.
- [x] Confirm the three `release/0.0.1` heads match their remotes.
- [x] Recheck and record current live GKE, Cloud SQL, workload, auth and release state.
- [x] Define accountable roles and controller/processor working assumptions.
- [x] Close Core/Web lint, format and dependency-security failures and record evidence.
- [ ] Obtain management/privacy/legal approval for named role assignments and processing assumptions.

Exit: technical gates pass and the baseline has named human approvals. Production
remains prohibited while Milestone 1 launch blockers are open.

#### Milestone 0 verification evidence

| Surface | Verification result on 2026-08-23 |
| --- | --- |
| Core dependencies | `npm audit`: zero known vulnerabilities after pinning the patched `deepmerge-ts` transitive dependency |
| Core behavior | 97 suites / 1,199 tests passed; typecheck, lint, Prettier check, production build and Prisma validation passed |
| Web dependencies | `npm audit`: zero known vulnerabilities after upgrading the Vega family and pinning patched DOMPurify, js-yaml and nanoid transitive dependencies |
| Web behavior | 74 files / 546 tests passed; typecheck, architecture lint, Prettier check and production build passed |
| Web visuals | 21 Playwright visual/interaction checks passed; stale `/connections` baselines were replaced by `/database-services`; header overflow checks pass from 761 px through 1,920 px |
| Infra | Recursive Terraform formatting check, GCP dev/prod Terraform validation, and GCP dev/prod Kustomize rendering passed |
| Live reconciliation | Current GKE/Cloud SQL/auth/workload/image state was read and recorded in sections 2.1 and 2.2; no deployment or cloud mutation was performed |

Technical evidence closes the engineering portion of Milestone 0. The milestone
does not meet its full exit gate until actual people are assigned to the roles
in section 2.3 and management, privacy, and legal approve the working
assumptions in section 2.4.

### Milestone 1 — Trust boundary

Implement F01-F03/F07 and I02-I05. Make authentication a hard cutover, introduce
organization scope in every contract/store, remove anonymous Core access and
privatize operational tools.

Exit: anonymous, malformed-token, revoked-user, weak-MFA and cross-tenant tests
fail closed; privileged actions have complete audit evidence.

#### Milestone 1 implementation record — 2026-08-23

Repository implementation is complete for the human-user trust boundary, but
the milestone exit gate is **not yet closed in a deployed environment**. The
remaining rollout gates below are deliberate fail-closed prerequisites; setting
placeholder values or temporarily restoring anonymous/static-token access is
not an acceptable deployment workaround.

##### Application implementation

- [x] `F01` Add Identity Platform tenant configuration, email/password login,
  TOTP challenge handling, revocation-checked server sessions, secure
  `__Host-` session cookies, same-origin validation and double-submit CSRF.
- [x] `F01` Remove `API_AUTH_ENABLED` and `API_BEARER_TOKEN` compatibility from
  Core. Only health endpoints remain anonymous.
- [x] `F02` Add organization, identity, membership and invitation records plus
  active/suspended/revoked membership states. The later closure removed the
  original switching implementation: one identity tenant resolves exactly one
  organization and neither browser nor API selects another organization.
- [x] `F03` Add default-deny role-to-permission policy for platform admin,
  support, organization owner/admin, data engineer, analyst, viewer, auditor
  and service-account roles; privileged roles require verified MFA.
- [x] `F03` Bind the authenticated organization in server context and override
  client-supplied organization identifiers in Prisma reads and writes.
- [x] `F07` Add append-only audit events for authentication failures,
  authorization denials, data access and configuration changes; hash IP
  addresses with a dedicated secret and reject audit update/delete in the
  database.
- [x] Add `/api/v1/administration` endpoints for current identity,
  organization, memberships, invitation creation, membership role/status
  changes and audit-event retrieval.
- [x] Add a Web administration view and make all browser-to-Core traffic pass
  through a same-origin server gateway that supplies validated identity and
  organization context. No bearer credential is exposed through `NEXT_PUBLIC_*`.
- [ ] Add invitation acceptance, password reset, organization create/status
  transitions and complete joiner/mover/leaver workflows. These are the first
  `F04` tasks in Milestone 2; invitation issuance alone must not be represented
  as completed user lifecycle management.
- [ ] Carry organization identity through Kafka/outbox/background-worker events
  and machine credentials. Until `F05/F16` land in Milestone 2, background jobs
  use the bootstrap organization and are not approved for multi-organization
  production data.

##### Infrastructure implementation

- [x] `I02` Add Terraform-managed Identity Platform tenant settings with
  anonymous and tenant self-sign-up disabled, mandatory MFA and TOTP enabled.
- [x] Reconcile mandatory TOTP on the tenant resource through the supported
  Identity Toolkit tenant API. The Google Terraform provider currently exposes
  project-level MFA but not tenant `mfaConfig`; Cloud Build now applies it and
  plan builds fail if the live tenant drifts.
- [x] `I03` Remove production Core and Trino public routes and retain Web as the
  customer application edge. The operator control plane is a separate IAP edge
  restricted to verified `@celesnity.com` identities. Cloud Armor currently has
  default allow by explicit development decision; authentication rate limiting
  is deferred and must not be represented as an operating M1 control.
- [x] `I04` Enable GKE Dataplane V2 and add explicit ingress/egress policies for
  Core API, Core worker and Web, including DNS, metadata-server and required
  service destinations.
- [x] `I05` Split Core API, Core worker and Web Google/Kubernetes service
  accounts and add workload-specific Identity Platform permissions.
- [ ] Apply namespace-wide default-deny and split the remaining shared
  Trino/Spark/streaming/maintenance identity. This is required before the full
  `I04/I05` control can be marked operational and is tracked in Milestone 2/4
  because those workloads need end-to-end dependency tests during the split.

##### Verified engineering evidence

| Surface | Verification result on 2026-08-23 |
| --- | --- |
| Core | Typecheck, lint and production build passed; 99 suites / 1,201 tests passed; production dependency audit reports zero known vulnerabilities |
| Authentication/authorization | Automated negative tests cover missing credentials, malformed organization selector, revoked/invalid identity, cross-organization membership selection, viewer mutation denial and privileged access without MFA; authentication and authorization denials create audit evidence |
| Database | All 16 migrations, including `20260823150000_administration_trust_boundary`, applied successfully from an empty PostgreSQL 17 database using the production ownership contract |
| Web | Typecheck, architecture lint and production build passed; 75 files / 548 tests and all 21 Playwright visual/interaction checks passed; production dependency audit reports zero known vulnerabilities |
| Infrastructure | Recursive Terraform formatting and GCP dev/prod validation passed; Core, Web and platform GCP dev/prod Kustomize overlays rendered successfully |

##### Deployment and exit-gate checklist

Execute and retain the evidence defined in
[`m1-deployment-and-evidence-runbook.md`](./m1-deployment-and-evidence-runbook.md).

- [ ] Enable/apply Identity Platform in dev, replace project/tenant/domain
  placeholders, and verify that the Celesnity-only Control Plane atomically
  provisions a tenant, initial named owner identity, and active `ORG_OWNER`
  membership before first customer sign-in.
- [ ] Create and rotate `AUDIT_HASH_KEY`; deploy per-workload service accounts;
  apply Dataplane V2/network policies and Cloud Armor after reviewing the plan.
- [ ] Back up dev, apply the organization migration, deploy Web/Core together,
  and remove obsolete static bearer secrets from Secret Manager after rollback
  expires.
- [ ] Execute deployed anonymous, malformed-token, wrong audience/issuer,
  expired/revoked session, CSRF, weak-MFA, suspended user and suspended
  organization tests. Preserve request IDs and immutable audit rows for every
  denial. The multi-tenant identifier-swap matrix is deferred to M2; this does
  not introduce or restore organization switching.
- [x] Confirm Core, Trino, MCP-Trino and Agent have no public route; Grafana is
  private; customer traffic enters through Web; and the separate control-plane
  edge requires IAP plus the `celesnity.com` application-domain check.
- [ ] Test rollback without restoring anonymous access: roll back all three
  release artifacts together, retain the migrated additive schema, and revoke
  sessions issued during the failed rollout if identity semantics changed.
- [ ] Security owner signs the negative-test evidence; Platform owner signs the
  exposure/IAM/network evidence. Only then change Milestone 1 status to closed.

#### Milestone 1 closure implementation — 2026-08-25

The source closure below replaces the earlier organization-switching assumption.
One Identity Platform tenant maps to exactly one customer organization. A browser,
API caller, or background event cannot choose or switch the organization. These
changes are implemented but remain **undeployed and unsigned** until the exit-gate
tests above are executed in development.

1. [x] **Tenant-derived organization identity.** Persist the Identity Platform
   tenant ID on the organization and user identity, resolve membership only in
   that bound organization, ignore the obsolete organization header, and remove
   the Web organization cookie, switch endpoint, use case, controller, and UI.
2. [x] **Tenant-safe persistence and events.** Add organization predicates to
   raw source-catalog SQL. Carry `organizationId` from the outbox row into Kafka,
   reject delivery without it, validate it in queued crawler events, and restore
   that organization context before worker dispatch. Bind agent rooms to an
   organization through a human-authenticated Core call before accepting machine
   publications; never trust a caller-supplied organization header.
3. [x] **Tenant-bound groups and named-resource grants.** Add organization-owned
   groups, group membership, direct/group grants, explicit allow/deny, grant
   validity windows, grant option, hierarchical CATALOG/SCHEMA/TABLE/COLUMN
   resources, descendant inheritance, and deny precedence. Tags are deliberately
   excluded from this first model.
4. [x] **Default deny and catalog visibility.** Hide catalogs, schemas and tables
   without `DISCOVER`; require `DESCRIBE` for metadata, `PREVIEW` for samples,
   `ALTER` for namespace creation and `SELECT` before submitting a Trino query.
   The check runs in Core immediately before the Trino-facing use case, so hiding
   a control in Web is never the enforcement boundary. Organization owners are
   placed in an explicit `Organization Owners` group with an inheritable `OWN`
   grant rather than receiving an undocumented bypass.
5. [x] **Governance API.** Add tenant-scoped administration endpoints to create
   and list groups, add/remove group members, create/list/delete catalog grants,
   list memberships and audit evidence. Audit retrieval now includes an explicit
   organization predicate.
6. [x] **Fail-closed request evidence.** Mutation CSRF now requires matching,
   non-empty cookie/header values and an allowed Origin. Successful/failed human
   requests await append-only audit persistence; a successful privileged request
   is not returned if its audit evidence cannot be written.
7. [x] **Private development data tools.** Remove the development Trino and
   MCP-Trino HTTPRoutes and external backend policies from the rendered platform
   overlay. Both remain ClusterIP-only and are reached by in-cluster workloads or
   operator port-forward. Remove the agent HTTPRoute and admit agent ingress only
   from the Web workload through NetworkPolicy.
8. [x] **Agent Workload Identity.** Terraform now owns the dedicated agent GSA,
   namespace and annotated KSA. Agent/Core calls obtain short-lived Google ID
   tokens from the GKE metadata server, validate audience plus the exact service
   account email in Core, and bind access to the persisted room organization.
   `AGENT_SERVICE_TOKEN` and `agent-service-token` are removed from Core, Agent,
   Kubernetes Secret templates, agent definitions and both Cloud Build pipelines.

Compliance contribution: items 1–8 implement technical measures supporting GDPR
Articles 5(1)(f), 25 and 32 and SOC 2 CC6/CC7. They do not by themselves establish
legal compliance or SOC 2 attestation. Notices, lawful basis, rights operations,
retention/deletion, processor contracts, incident procedures, operating evidence,
rollback proof and accountable-owner approval remain separate gates.

##### Post-closure hardening evidence — 2026-08-27

The following review found and repaired three authorization/credential regressions
that were not covered by the original closure record. They are part of the M1
source implementation, but they do not close the deployed-environment checklist.

- [x] Scope Agent room enumeration to the authenticated caller in both the
  in-memory and PostgreSQL stores. A caller can no longer enumerate another
  caller's rooms through `GET /rooms`.
- [x] Reject historical Agent runs that have neither a session nor a room owner
  relationship. Compatibility with an unscoped row is no longer treated as
  authorization.
- [x] Scope Core message-block list and SSE reads by both room ID and the
  authenticated organization ID. Knowing another tenant's room UUID is
  insufficient to read its published blocks.
- [x] Remove the last executable `AGENT_SERVICE_TOKEN` consumer from the
  document MCP adapter. It now obtains a short-lived Google identity token for
  `CELESNITY_CORE_AUDIENCE`, matching the chart adapter and Core's exact
  audience/service-account verification.
- [x] Add `scripts/verify-m1-trust-boundary.sh`. The gate renders all development
  overlays and fails if Core, Agent, Trino or MCP-Trino becomes publicly routed,
  if Web ceases to be the single public edge, if the Agent ingress policies or
  per-workload service accounts disappear, or if a legacy static authentication
  setting returns to executable configuration.

Verification on 2026-08-27:

| Surface | Result |
| --- | --- |
| Core targeted isolation tests | 4 suites / 15 tests passed |
| Core typecheck, lint, formatting and production build | Passed |
| Core full Jest run | 103 suites / 1,218 tests passed; the zero-byte `chart.use-cases.spec.ts` placeholder that caused Jest to fail after running all real tests was removed |
| Agent release compilation | `minder-serve`, `mcp-chart` and `mcp-document` compiled successfully with Rust 1.94 in the production builder |
| Agent behavioral tests | `mcp-document` 7, `minder-serve` 68, `minder-session` 51 and `minder-store-pg` 28 tests passed with Rust 1.94. PostgreSQL tests ran serially against a fresh disposable PostgreSQL instance; the store now creates a pool per Tokio test runtime instead of retaining a pool after its runtime exits. |
| Live Agent isolation | A real `minder-serve` process backed by disposable PostgreSQL returned `401` without a caller, listed only the authenticated caller's room for two independent callers, and returned `404` for a historical run with no session/room owner. |
| Local Core/Web authentication | All 17 migrations applied to fresh disposable PostgreSQL and the four local personas were seeded. A real Web local-owner session resolved through the Web proxy to the seeded `ORG_OWNER`; anonymous access returned `401`, a token without MFA returned `401`, logout without CSRF returned `403`, valid logout returned `204`, and the cleared session returned `401`. Five focused Web auth/proxy test files / 28 tests also passed. |
| Live Core message-block isolation | A room containing one block for the authenticated organization and one deliberately inserted foreign-organization block returned only the authenticated organization's block through both Core and the Web proxy. The database held two rows for the same room ID while the API returned one. |
| Local Workload Identity behavior | `mcp-document` has no static-token fallback and failed closed when run outside GKE because the Google metadata identity endpoint was unavailable. Functional machine-publication testing therefore remains a GKE/development-cluster acceptance item, not a workstation test. |
| Local container stack | Docker Desktop remained unavailable because its snapshot metadata store failed to recover. Direct host-process and disposable-PostgreSQL tests above replaced the container test path without resetting Docker or deleting project volumes. |
| Rendered trust-boundary gate | Passed for Infra, Core, Web and Agent development overlays |

The current SQL authorization boundary remains Core. Direct MCP-Trino access is
cluster-private and is not a substitute for a delegated end-user authorization
decision. Exposing MCP to external assistants requires a later identity-aware MCP
gateway, delegated user/tenant context, per-request policy evaluation, Trino-side
enforcement and audit correlation. `validate_sql` is only one defense and must not
be represented as complete authorization.

##### Authorization acceptance checklist

The platform deliberately has no organization-switch feature: one Identity
Platform tenant maps to one organization. The two-tenant adversarial matrix below
tests isolation against forged identifiers; it is not a switching workflow. Per
the current delivery decision, that matrix is deferred to M2 and is not an M1
closure gate. Do not mark it passed without retained deployed evidence.

- [ ] A user from tenant A cannot resolve, enumerate, bind, query or preview a
  tenant B resource by changing any UUID, room ID, cookie, header or request body.
- [ ] A user with no matching grant sees no catalog resource and receives
  `CATALOG_ACCESS_DENIED` for direct access; an explicit DENY overrides every
  matching ALLOW, including ancestor grants.
- [ ] Group membership removal and grant expiry take effect on the next request;
  suspended/revoked organization memberships remain denied before catalog policy.
- [ ] A schema descendant grant exposes only its descendants. A table grant does
  not expose sibling tables. Column-level grants are stored and evaluated, while
  column-filtering/masking remains a later, explicitly unimplemented capability.
- [ ] Read-only SQL submission requires a catalog/schema `SELECT` grant. Do not
  claim arbitrary table-level SQL parsing or row/column filtering in this release.
- [ ] An unbound agent room is rejected, a Google token with the wrong audience or
  service-account email is rejected, and no static-token fallback exists.
- [ ] Rendered development manifests contain no Trino, MCP-Trino or Agent public
  HTTPRoute and no `AGENT_SERVICE_TOKEN` key.
- [ ] Preserve request IDs, audit rows, Kafka headers and worker logs for the M2
  isolation matrix.

### Milestone 2 — Administration and isolation

Implement F04-F06/F13/F16 and I04-I08/I14. Deliver user/service identity
lifecycle, reviews, support access, provisioning, quotas, and isolation across
database, object storage, Kafka, Spark, Iceberg, Trino, monitoring and logs.

Exit: the full tenant-isolation matrix passes without client-selected tenant
override.

### Milestone 3 — GDPR lifecycle and governance

Implement F08-F12/F14 and approve ROPA, DPIAs, DPA, transfer assessment,
subprocessor register and retention schedule.

Exit: rights, retention/deletion, transfer blocking, AI review and breach
tabletop evidence are accepted by privacy ownership.

### Milestone 4 — Production hardening and availability

Implement I01/I03-I12/I15 in a fresh EU production cell. Do not migrate
disposable development data.

Exit: external exposure, tenant isolation, signed deployment, restore, failover,
alerting, 99.9% SLO, RPO 15m and RTO 4h tests pass.

### Milestone 5 — Evidence operation and SOC 2 readiness

Deploy I13, implement F15, load controls/risks/vendors/policies into Probo, and
operate every scoped recurring control. Start the six-month Type II evidence
window only when no unresolved critical design/operation exception exists.

Exit: independent readiness reviewer confirms evidence completeness and audit
scope. Processing Integrity is excluded from the first examination.

## 8. Verification matrix

- Authentication: expiry, revocation, wrong audience/issuer, CSRF, replay,
  disabled membership, step-up MFA and session termination.
- Authorization: every role/action/resource combination, identifier swapping,
  unscoped-query detection and denied-event audit.
- Privacy: every right, identity verification, derived data, multi-tenant
  identity, legal hold, backup lifecycle, portability and automated decisions.
- Retention: dry run, approval, expiry, partial failure/retry, legal hold,
  certificate and audit evidence.
- Infrastructure: NetworkPolicy enforcement, IAM denial, private admin,
  secrets/keys, Cloud Armor, environment separation and external exposure.
- Availability: pod/zone/database failure, PITR, restore, alert delivery and
  measured RTO/RPO.
- Supply chain: secret/vulnerability gate, SBOM, unsigned image rejection,
  provenance, drift detection and rollback.
- Logging: coverage, redaction, tamper resistance, tenant filtering, correlation,
  retention and ingestion-health alerts.
- Incident: detection through assessment, regulator/customer decision,
  communications and corrective action.
- Probo: evidence hash/redaction/least privilege, failed-export retry, backup and
  proof that it cannot access raw customer telemetry.

## 9. Probo boundary

Probo is an internal GRC/evidence system, not part of the Celesnity runtime trust
boundary. It may manage controls, risks, vendors, policies, audits, privacy
records and evidence. It must not enforce authorization or become required for
customer workloads to run. The inspected source does not provide a complete
native GCP connector, so Celesnity will push signed/redacted evidence through
F15. If S3-compatible GCS access requires HMAC, use a dedicated limited identity
and isolated evidence bucket. Keep Probo current because its security policy
supports only the latest release.

## 10. Assumptions and unresolved approvals

- The EU is the first production customer-data region.
- Development data is disposable and no legacy tenant migration is required.
- Identity Platform US processing is conditionally accepted with DPA/SCC/TIA,
  notice, minimization and access controls.
- Authentication has no anonymous compatibility period.
- Regional cells use a centralized governance control plane and region-local
  customer data planes.
- Probo does not replace legal review, runtime controls or independent audit.
- The privacy/legal owner must approve controller/processor allocation,
  retention, transfers, notice, DPA and DPO assessment before production.
- The auditor must confirm the final system boundary and six-month observation
  window before the Type II period begins.

## 11. Authoritative references

- [GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)
- [EDPB privacy by design/default guidance](https://www.edpb.europa.eu/documents/guideline/guidelines-42019-on-article-25-data-protection-by-design-and-by-default_en)
- [EDPB data-subject rights](https://www.edpb.europa.eu/topics/key-gdpr-concepts/data-subject-rights_en)
- [AICPA Trust Services Criteria](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022)
- [Google Cloud SOC 2](https://cloud.google.com/security/compliance/soc-2)
- [Identity Platform multi-tenancy](https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-managing-tenants)
- [Identity Platform TOTP MFA](https://docs.cloud.google.com/identity-platform/docs/admin/enabling-totp-mfa)
- [Google/Firebase privacy and security](https://firebase.google.com/support/privacy)
- [Google data-processing terms](https://firebase.google.com/terms/data-processing-terms)
- [Probo repository snapshot](https://github.com/getprobo/probo/tree/5d717eaefbf631119dcb1fd405537dacd4cde93a)
- [Probo security policy](https://github.com/getprobo/probo/blob/5d717eaefbf631119dcb1fd405537dacd4cde93a/SECURITY.md)
