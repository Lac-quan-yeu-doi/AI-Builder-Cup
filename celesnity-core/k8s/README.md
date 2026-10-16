# Celesnity Core on GKE

This directory contains the application-owned Kubernetes resources for the Core API
and execution worker.

## Layout

- `base/`: workloads, Service, and worker RBAC shared by every environment.
- `overlays/gcp/common/`: GKE resources shared by development and production.
- `overlays/gcp/dev/`: development configuration, routing, scaling, and secret template.
- `overlays/gcp/prod/`: production configuration, routing, scaling, and secret template.

## Ownership

`celesnity-infra` creates the cluster, namespace, `celesnity` ServiceAccount, database
Secret, storage ConfigMap, Trino Secret, streaming Secret, shared Gateway, DNS,
certificates, and Cloud Armor policies. This repository references those resources but
does not create them.

This repository owns the Core Deployments, Service, worker RBAC, application ConfigMap,
runtime Secret template, HTTPRoute, per-Service GKE policies, HPA, PDB, and NetworkPolicy.

Apply Terraform before deploying either overlay.

## Render

```bash
kubectl kustomize k8s/overlays/gcp/dev
kubectl kustomize k8s/overlays/gcp/prod
```

Cloud Build injects the runtime Secret values and replaces the image tags before apply.
The committed image tags are readable defaults; deployed images are pinned to the build
commit by `cloudbuild.yaml`.

## Authorization gates and migrations

Cloud Build runs authorization preflight, migration/bootstrap, then authorization
readiness before applying API and worker workloads. Preflight validates every
active organization, including organizations other than the configured bootstrap
tenant. A missing or disabled service identity blocks the build before migrations.
Only a fresh schema without the organizations table defers this check until after
migration/bootstrap. Provision missing identities through the organization lifecycle;
never reactivate revoked identities or widen catalog grants to pass readiness.

These gates catch authorization prerequisites; they do not make destructive schema
changes compatible with old pods. Use staged migrations: add and backfill new storage,
deploy readers that support it, then remove obsolete columns in a later release after
all old readers are retired. If a migration has already succeeded and rollout fails,
preserve the migration ledger and finish a compatible rollout after repairing the
failed prerequisite. Do not roll back to an image that still requires removed columns.
