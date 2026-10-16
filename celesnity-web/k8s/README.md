# Celesnity Web on GKE

This directory contains the application-owned Kubernetes resources for the frontend.

## Layout

- `base/`: the frontend Deployment and Service.
- `overlays/gcp/common/`: GKE resources shared by development and production.
- `overlays/gcp/dev/`: development configuration, routing, scaling, and policy values.
- `overlays/gcp/prod/`: production configuration, routing, scaling, and policy values.

## Ownership

`celesnity-infra` creates the cluster, namespace, `celesnity` ServiceAccount, shared
Gateway, DNS, certificates, Artifact Registry repository, and Cloud Armor policies.
This repository references those resources but does not create them.

This repository owns the frontend Deployment, Service, application ConfigMap,
HTTPRoute, per-Service GKE policies, HPA, PDB, and NetworkPolicy.

Apply Terraform before deploying either overlay.

## Runtime trust-boundary configuration

The browser calls the same-origin `/api/core` gateway. `CORE_API_URL`,
`WEB_ORIGIN`, and Identity Platform settings are runtime values in the Web
ConfigMap, so one image digest can be promoted across environments. The gateway
validates the secure session and CSRF token, strips client-supplied authorization
and organization headers, then calls the private Core Service.

## Render

```bash
kubectl kustomize k8s/overlays/gcp/dev
kubectl kustomize k8s/overlays/gcp/prod
```
