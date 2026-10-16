# Milestone 1 deployment and evidence runbook

Status: development implementation deployed; single-tenant negative evidence,
rollback rehearsal, and owner sign-off pending.

This runbook closes the operational part of the M1 trust boundary. It does not
declare GDPR compliance or SOC 2 attestation. Execute it first in development,
preserve the evidence, and stop on any fail-open result.

## 1. Reauthenticate and establish scope

Application Default Credentials are for application libraries. Kubernetes and
most `gcloud` commands use the active gcloud user session, which must also be
valid.

```bash
gcloud auth login dax.pham@celesnity.com
gcloud config set account dax.pham@celesnity.com
gcloud config set project cosmos3-mmad-research
gcloud container clusters get-credentials celesnity-gcp-dev \
  --zone asia-southeast1-a \
  --project cosmos3-mmad-research

gcloud auth list --filter=status:ACTIVE
kubectl config current-context
kubectl auth can-i get deployments -n celesnity
```

Do not print secret payloads into a terminal transcript used as evidence.

## 2. Freeze and identify the release

Record the exact commit SHA for Infra, Core, Web, Agent and Control Plane Web. All M1 source changes
must be committed and reviewed before the rollout. Do not deploy a mixture of old
and new authentication contracts.

```bash
for repository in celesnity-infra celesnity-core celesnity-web celesnity-agent celesnity-control-plane-web; do
  git -C "../${repository}" status --short
  git -C "../${repository}" rev-parse HEAD
done

./scripts/verify-m1-trust-boundary.sh
```

The working trees must be clean and the verification command must pass. Attach
the SHAs and command output to the rollout record.

## 3. Infrastructure preflight

Run the existing development Terraform/Cloud Build plan. Review it before apply.
The plan must not replace the cluster, database, state bucket, KMS keys or
persistent data. Confirm that it contains the intended Identity Platform,
Workload Identity, Dataplane V2, NetworkPolicy and Cloud Armor changes.

Before apply, confirm by metadata only that the required secrets exist and have
an enabled version:

```bash
for secret_name in \
  gcp-dev-audit-hash-key \
  gcp-dev-initial-admin-password; do
  gcloud secrets describe "${secret_name}" \
    --project cosmos3-mmad-research \
    --format='table(name,replication.automatic)'
  gcloud secrets versions list "${secret_name}" \
    --project cosmos3-mmad-research \
    --filter='state=ENABLED' \
    --limit=1 \
    --format='table(name,state,createTime)'
done
```

Never restore `API_BEARER_TOKEN`, `API_AUTH_ENABLED`, `AGENT_SERVICE_TOKEN` or
`agent-service-token` as a rollout workaround.

## 4. Database backup and migration

Create a development backup using the established Cloud SQL backup workflow and
record its operation ID. Apply the additive organization/authorization migration
before starting the new Core pods. Verify migration state through
`prisma migrate status`; do not edit the migration table by hand.

The migration is retained during rollback. Rolling back by dropping tenant or
audit columns would destroy evidence and is not an approved recovery path.

## 5. Coordinated application rollout

Use the normal reviewed Cloud Build triggers. Deploy in this order:

1. Infra/IAM/network prerequisites.
2. Agent with its dedicated Workload Identity and no public route.
3. Core migration and Core API/worker.
4. Web immediately after Core, in the same change window.
5. Control Plane Web when its operator or onboarding contract changed.

Record image digests rather than mutable tags:

```bash
kubectl -n celesnity rollout status deployment/celesnity-core --timeout=10m
kubectl -n celesnity rollout status deployment/celesnity-core-worker --timeout=10m
kubectl -n celesnity rollout status deployment/celesnity-web --timeout=10m
kubectl -n minder rollout status deployment/minder-serve --timeout=10m

kubectl -n celesnity get deployment \
  celesnity-core celesnity-core-worker celesnity-web \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{range .spec.template.spec.containers[*]}{.image}{" "}{end}{"\n"}{end}'
kubectl -n minder get deployment minder-serve \
  -o jsonpath='{range .spec.template.spec.containers[*]}{.image}{"\n"}{end}'
```

## 6. Exposure and identity evidence

```bash
kubectl get httproutes.gateway.networking.k8s.io -A -o yaml
kubectl -n celesnity get service celesnity-core trino-coordinator mcp-trino -o wide
kubectl -n minder get service minder-serve -o wide
kubectl -n celesnity get networkpolicy -o yaml
kubectl -n celesnity get serviceaccount \
  celesnity-core-api celesnity-core-worker celesnity-web \
  celesnity-trino celesnity-spark-runtime celesnity-spark-job \
  celesnity-iceberg-maintenance celesnity-mcp-trino \
  celesnity-redpanda-connect celesnity-redpanda-bootstrap -o yaml
kubectl -n minder get serviceaccount celesnity-agent -o yaml
kubectl get secret -A -o name | rg '(agent-service-token|api-bearer)' && exit 1 || true
```

Pass conditions:

- no HTTPRoute backend targets Core, Agent, Trino, MCP-Trino or Grafana;
- those services are `ClusterIP` only;
- customer traffic enters through Web; the separate operator Control Plane edge
  requires IAP and accepts only a verified `@celesnity.com` identity;
- Agent has default-deny ingress and a Web-only allow policy;
- Core API, Core worker, Web and Agent use distinct service accounts;
- no obsolete static bearer secret remains.

## 7. Live negative matrix

M1 uses one real Identity Platform tenant and its bound organization. Create one
owner, one non-privileged member and one suspended member. There is no tenant or
organization switch feature, and no browser/API-selected organization context.

Execute and retain request ID, response status, timestamp and matching immutable
audit row for each case:

Use `scripts/m1/run-http-negative-matrix.sh` with a reviewed copy of
`scripts/m1/negative-matrix.example.tsv`. Tokens stay in environment variables;
the evidence files contain request/response data and hashes, never bearer tokens.

| Case | Expected result |
| --- | --- |
| No session, malformed token, wrong issuer/audience | `401` |
| Expired or revoked session | `401` |
| Unverified email or missing required MFA | `401` or authentication challenge; never a session |
| Missing/mismatched CSRF token or disallowed Origin on mutation | `403` |
| Suspended/revoked membership or suspended organization | `401`/`403` before resource lookup |
| No catalog grant | resource absent from listing and `CATALOG_ACCESS_DENIED` on direct access |
| Explicit deny plus inherited allow | deny wins |
| Removed group membership or expired grant | denied on the next request |
| Unbound Agent room, wrong Google audience or wrong Agent GSA | denied; no static-token fallback |

The two-real-tenant identifier-swap matrix is deferred to M2. It remains a
required isolation test before multiple customer organizations are processed;
it is adversarial authorization testing, not an organization-switch feature.

Also verify that authentication denial, authorization denial, privileged success,
Agent publication and background-event organization IDs correlate through request
IDs, audit events and logs without storing raw credentials or full IP addresses.

## 8. Rollback and sign-off

Use `scripts/m1/rollback-release-set.sh plan` with immutable target image digests
before the change window, retain the evidence bundle, and have Security and
Platform owners approve it. During an authorized rehearsal or incident, rerun it
with `execute` and the same digest inputs. If any case fails open, stop onboarding
and roll back Agent, Core and Web as one release set. Keep the additive database
migration, do not restore anonymous/static bearer access, and revoke sessions
issued during the failed rollout if identity semantics changed.

After the rollback window passes, remove obsolete static bearer secrets from
Secret Manager and Kubernetes. Record deletion time and recovery policy.

M1 closes only when:

- Security owner signs the negative-test and immutable-audit evidence;
- Platform owner signs the route, service-account, NetworkPolicy, Cloud Armor and
  rollback evidence;
- Privacy/legal owners acknowledge that M1 is a technical-control milestone, not
  completion of lawful basis, notices, rights, retention, DPA/DPIA or transfer
  obligations.
