---
name: deployment-and-operations
description: Use when changing Docker images, Kubernetes manifests, Cloud Build, health checks, runtime environment, rollout behavior, or operational configuration
---

# Deployment and Operations

## Runtime shape

- `Dockerfile` builds the TypeScript service image.
- `k8s/base/` contains shared deployment and monitoring resources.
- `k8s/overlays/gcp-dev/` is the active development deployment; production
  manifests are render-validated unless explicitly requested.
- `cloudbuild.verify-phase-0.yaml` verifies without deployment;
  `cloudbuild.yaml` builds, pushes, applies, and waits for rollout.

## Rules

- Trace each runtime value from `cloudbuild.yaml` or the Kustomize overlay
  through ConfigMap/Secret to the process environment. Check whether it is a
  build input or a pod value before changing it.
- Keep secrets in deployment secret configuration, never committed manifests,
  logs, images, or test fixtures.
- Health/readiness endpoints must reflect the actual serving process. Verify
  port ownership and container command before diagnosing stale responses.
- NetworkPolicy changes require checking both egress and destination ingress.
- A rollout is not complete after image push or HTTP `202`; verify the running
  pod, endpoint, logs, and the intended dependency path.
- Render manifests before applying them:

```bash
npm run k8s:render:dev
npm run k8s:render:prod
```

## Change procedure

1. Locate the source file: `Dockerfile` for image/runtime issues,
   `k8s/base/` for shared resources, an overlay for environment differences,
   and Cloud Build YAML for build or rollout behavior.
2. Trace the value or port end to end. For example, a new environment variable
   needs a source (ConfigMap or Secret), a pod mapping, and a consumer in the
   service. Keep a secret's value out of the render and logs.
3. Render both overlays and inspect the changed manifests. For image changes,
   build and run `src/tests/phase-0/container-smoke.sh` with a local image.
4. If a deployment was requested, verify the built image, running pod,
   endpoint, logs, and dependency path after rollout. An image push or build
   success alone is not service verification.

Example: a failing `/api/v1/healthz` probe first requires checking the
container command, listening address, Service target port, and pod readiness;
editing the probe alone may hide a process that never started.

## Verification

For image changes run the phase-0 container smoke test. For deployment changes,
render and inspect the diff first, then use the smallest authorized environment.
Never deploy, push an image, or mutate a cluster unless the user explicitly
asks.
