# Cloud Build deployment

`cloudbuild.yaml` is the shared GCP infrastructure pipeline. Trigger
substitutions select exactly one environment; the build validates the target,
uses locked remote state, applies Terraform, provisions runtime secrets, builds
the Spark image, and deploys the matching Kustomize overlay.

The checked trigger definitions are in `.cloudbuild/triggers/`. Import them with
`gcloud builds triggers import --region=<trigger-region> --source=<file>`.

## Trino Secret Manager contract

Terraform does not generate or recover Trino private keys from state. Before an
environment's first plan, an operator creates fresh TLS and authentication
material directly in four environment-scoped, regional Secret Manager secrets:

```bash
scripts/trino/bootstrap-tls-secret-manager.sh \
  --project cosmos3-mmad-research \
  --environment gcp-dev \
  --namespace celesnity \
  --locations asia-southeast1
```

For production, use the production project and namespace. A separate GCP project
is the preferred production IAM boundary; if development and production still
share a project, their `celesnity-gcp-dev-*` and `celesnity-gcp-prod-*` secret
names prevent accidental value reuse but do not provide project-level isolation.

```bash
scripts/trino/bootstrap-tls-secret-manager.sh \
  --project celesnity-minder-platform \
  --environment gcp-prod \
  --namespace celesnity-prod \
  --locations europe-west2
```

Copy the four returned version numbers into the matching
`terraform.tfvars.example`. Terraform and Cloud Build deliberately use those
exact versions rather than the `latest` alias. To rotate, rerun the command with
`--rotate`, update all pinned versions, increment
`trino_kubernetes_secret_revision`, review the plan, and deploy Core and Trino
together. Running the command without `--rotate` is idempotent and never changes
an existing certificate.

Terraform reads the pinned versions through ephemeral provider resources and
writes Kubernetes Secret payloads through write-only attributes. The private key
therefore remains absent from Terraform configuration, plan files, and state.
Cloud Build fails before planning if any pinned version is missing or not
readable.

## Trigger contract

### Development

- Event: push to the exact branch `development`.
- Action: apply `infra/environments/gcp-dev` and
  `deploy/overlays/gcp-dev`.
- Cluster: zonal `celesnity-gcp-dev` in `asia-southeast1-a`.
- State: `gs://celesnity-gcp-dev-tfstate-cosmos3-mmad-research/` with prefix
  `celesnity-infra/gcp-dev`.

Required substitutions:

```text
_ACTION=apply
_CONFIRM_TARGET=celesnity-gcp-dev
_REQUIRE_RELEASE_TAG=false
_ENV=gcp-dev
_REGION=asia-southeast1
_CLUSTER=celesnity-gcp-dev
_CLUSTER_LOCATION_TYPE=zone
_CLUSTER_LOCATION=asia-southeast1-a
_NAMESPACE=celesnity
_STATE_BUCKET=celesnity-gcp-dev-tfstate-cosmos3-mmad-research
_SPARK_REPOSITORY=asia-southeast1-docker.pkg.dev/cosmos3-mmad-research/celesnity-gcp-dev-spark/spark
```

The original development environment was created with local Terraform state.
That state is no longer present. The development trigger must remain disabled
until all existing live resources have been adopted into the remote backend and
a no-replacement plan has been reviewed. The pipeline fails closed when it sees
a live cluster and an empty remote state.

Before enabling or rerunning the infrastructure trigger, reconcile its required
Google APIs and IAM roles with:

```bash
infra/environments/gcp-dev/cloudbuild-setup.sh
```

The bootstrap is idempotent and uses the same permission contract as production.
Feature-specific permissions such as Monitoring Editor are also managed by the
environment Terraform roots, so a promoted revision enforces the same binding
in development and production. The bootstrap remains necessary only for the
initial project-level authority that Terraform cannot grant to its own runner.

### Production

- Event: a semantic version tag matching `vMAJOR.MINOR.PATCH`, optionally with a
  suffix, for example `v1.2.3` or `v1.2.3-rc.1`.
- Release rule for `v0.1.0`: create the tag from the reviewed
  `release/0.1.0` head.
- Action: apply `infra/environments/gcp-prod` and
  `deploy/overlays/gcp-prod`.
- Cluster: regional `celesnity-gcp-prod` in `europe-west2`.

Required substitutions:

```text
_ACTION=apply
_CONFIRM_TARGET=celesnity-gcp-prod
_REQUIRE_RELEASE_TAG=true
_ENV=gcp-prod
_REGION=europe-west2
_CLUSTER=celesnity-gcp-prod
_CLUSTER_LOCATION_TYPE=region
_CLUSTER_LOCATION=europe-west2
_NAMESPACE=celesnity-prod
_STATE_BUCKET=celesnity-gcp-prod-tfstate-celesnity-minder-platform
_SPARK_REPOSITORY=europe-west2-docker.pkg.dev/celesnity-minder-platform/celesnity-gcp-prod-spark/spark
```

The build derives the Agent namespace from `_ENV` and reads the workload Google
service account directly from Terraform output. Do not duplicate either value
as a trigger substitution; stale copies can target the wrong namespace or GSA.

Cloud Build triggers match either a branch or a tag; a tag trigger cannot also
assert that its commit belongs to a release branch. Protect release-tag creation
and verify that the tag commit is the reviewed `release/0.1.0` head. The
pipeline independently rejects missing or malformed release tags.

## Source-control requirement

Triggers build committed source from GitHub. Local uncommitted files are not
included. Merge `cloudbuild.yaml`, the environment roots, modules, images, and
overlays before enabling a trigger or creating a production release tag.
