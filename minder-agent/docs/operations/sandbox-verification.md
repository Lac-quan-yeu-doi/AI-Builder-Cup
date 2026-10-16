# Sandbox deployment verification

The development runner uses a container-level AppArmor `Unconfined` exception.
Containerd's default AppArmor profile denies the namespace-local mounts that
Bubblewrap needs. The Agent container keeps its default profile. The runner
retains UID/GID 65532, dropped capabilities, no privilege escalation and a
read-only root filesystem. This exception removes outer AppArmor enforcement;
the real command/isolation verification is therefore a deployment prerequisite.

The exception is only in `k8s/overlays/gcp-dev/sandbox-security-patch.yaml`.
Production retains its existing policy and must pass the same verification Job
before rollout. Provision and validate a restricted Bubblewrap-compatible
AppArmor profile on all eligible production nodes before promoting this change;
the development exception is not inherited by production.

## Verified development candidate, 2026-09-28

The failing runner reproduced `bwrap: Failed to make / slave: Permission denied`
with `cri-containerd.apparmor.d (enforce)`, despite its seccomp profile already
being `Unconfined`. Containerd's default AppArmor policy denied the mounts.
The earlier architecture fallback, socket ownership and quoted image-tag fixes
addressed separate failures; increasing the rollout timeout did not repair this
runtime prerequisite.

[Isolated Cloud Build b7b81140](https://console.cloud.google.com/cloud-build/builds;region=asia-southeast1/b7b81140-ec3c-4883-9863-9e369ae57ca0?project=cosmos3-mmad-research)
succeeded on 2026-09-28. The native amd64 container smoke and the GKE Job
`minder-sandbox-b7b81140` both passed all 12 sandbox checks. The Job completed
with exit code 0, using runner image digest
`sha256:5eea8057b409f5f775b188fd500ed8424f11895ad674ca8757a19af57a3a2c6a`.
The rendered policy retained UID/GID 65532, dropped all capabilities, disabled
privilege escalation, kept a read-only root filesystem and mounted no service
account token.

Local runner unit tests, focused pipeline/deployment tests, Job-generator tests,
TypeScript checking, lint and application compilation also passed. This proves
the repaired runner candidate starts and enforces the tested isolation rules;
it does not establish Agent rollout or a caller-authorized Core request. The
existing Agent Deployment was not changed by this verification build.

## Report dependency downloads

[Development build f1747036](https://console.cloud.google.com/cloud-build/builds;region=asia-southeast1/f1747036-eb08-4bf6-9539-23e84015749e?project=cosmos3-mmad-research)
failed while building the runner image, before secrets or deployment. PyPI's
`/simple/python-dateutil/` request timed out through every retry. Pip then
reported no matching distribution; the same dependency had installed in the
successful candidate above, so this was not a Python-version incompatibility.

The runner installs the complete tested report dependency set from the
architecture-specific `sandbox-runner/report-requirements.*.lock` files. These
contain exact CPython 3.11 Linux wheel URLs and SHA-256 hashes from PyPI release
metadata. Installation disables package-index lookup and dependency resolution,
requires hashes, accepts wheels only, and checks dependency compatibility with
`pip check`, following [pip's repeatable-install guidance](https://pip.pypa.io/en/stable/topics/repeatable-installs/).
Download socket timeout is 60 seconds, with five retries and normal
TLS verification. Wheel downloads still require `files.pythonhosted.org` access;
this removes the failing index-resolution path, not all network dependencies.

[Verification build b290d6ae](https://console.cloud.google.com/cloud-build/builds;region=asia-southeast1/b290d6ae-6814-4df5-9d36-02c4de88d9ba?project=cosmos3-mmad-research)
succeeded with the locked dependencies on 2026-09-28. It ran the normal node-test
and image-smoke steps from `cloudbuild.verify-phase-0.yaml`, including both
native amd64 image builds, the Agent/PostgreSQL startup smoke and all 12 runner
smoke checks. The local native arm64 image build and all 12 runner checks also
passed. This build did not publish images or mutate Kubernetes workloads.

When upgrading Python or report dependencies, update both amd64 and arm64 lock
files from reviewed upstream release metadata. Keep the complete dependency
closure, require unyanked wheels compatible with the base image, and run native
image builds plus the sandbox rendering smoke test for each supported
architecture. Never work around download errors by disabling TLS or hash checks.

## Local checks

```bash
npm ci --ignore-scripts --prefix sandbox-runner
npm test --prefix sandbox-runner
npm run test:phase-0 -- src/tests/phase-0/cloudbuild.test.ts src/tests/phase-0/sandbox-deployment.test.ts
python3 -m unittest discover -s k8s/ci -p '*_test.py'
docker build --tag minder-sandbox-runner:verify -f sandbox-runner/Dockerfile .
bash src/tests/phase-0/sandbox-container-smoke.sh minder-sandbox-runner:verify
```

Use the Docker host's native architecture. Running amd64 through Mac ARM
emulation can fail at `prctl(PR_SET_SECCOMP)` and does not prove GKE compatibility.
The smoke script mounts root-owned, group-writable temporary directories to
reproduce emptyDir/fsGroup ownership. It executes requests through the actual
runner socket and checks sensitive-file and sibling-workspace isolation,
symlink/path traversal, direct/proxied network denial, report rendering, and
disconnect cancellation with scratch cleanup. It uses only synthetic fixtures.

## Isolated development GKE verification

After approval for the image publication and temporary verification Job:

```bash
gcloud builds submit . \
  --config cloudbuild.verify-sandbox-gke.yaml \
  --project cosmos3-mmad-research --region asia-southeast1 \
  --service-account projects/cosmos3-mmad-research/serviceAccounts/cloudbuild-sa@cosmos3-mmad-research.iam.gserviceaccount.com
```

Check source-upload exclusions before submission; do not upload developer env
files or credentials. This pipeline tests the runner on the Cloud Build native
amd64 host, publishes a unique `sandbox-verify-<build-id>` tag and runs a Job in
`minder`. It does not change Agent configuration, migrations, the Deployment or
moving image tags. The Job is derived from the rendered runner's actual image,
pod/container security settings, environment and volume mounts. It uses only
emptyDirs, no Agent secrets, no Agent service account, and no mounted service
account token. It has a 120-second deadline, no retries and one-day TTL so failed
logs remain available. Its label cannot match the Agent Service selector.

Both normal Cloud Build pipelines run the container smoke test. The deployment
pipeline additionally requires the GKE Job to complete before applying Agent
configuration or running manifest migrations. A failed Job or rollout prints
pod conditions, container states, events and current/previous container logs.
It does not print rendered Secret manifests or pod environment values.

## Recovery acceptance

After approved feature delivery and development deployment, verify:

1. Cloud Build and the sandbox Job succeed for the intended immutable images.
2. The new Agent pod is `2/2` ready; its runner stays ready without restarts.
3. The runner reports AppArmor `unconfined`; the Agent retains the default
   AppArmor/seccomp policy. Both remain non-root without effective capabilities.
4. The old ReplicaSet scales down only after the new pod becomes ready.
5. A caller-authorized request through Core exercises a sandbox-backed tool and
   report creation; ordinary health endpoints alone do not establish recovery.

Keep the healthy old pod while verification is pending. Do not delete it to
force a failed replacement through rollout. Any subsequent sandbox prerequisite
failure must be diagnosed and fixed without bypassing the verification gate.
