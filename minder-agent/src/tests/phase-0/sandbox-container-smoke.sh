#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: sandbox-container-smoke.sh IMAGE}"
name="minder-sandbox-smoke-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT

# Root-owned, group-writable mounts reproduce GKE emptyDir + fsGroup. The
# non-root runner must work without chmod'ing their parent directories.
docker run --name "$name" --read-only --user 65532:65532 \
  --cap-drop ALL --security-opt no-new-privileges \
  --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  --memory 512m --cpus 1 \
  --tmpfs /tmp:rw,uid=0,gid=65532,mode=1777,size=128m \
  --tmpfs /tmp/minder-workspaces:rw,uid=0,gid=65532,mode=2770,size=128m \
  --tmpfs /run/minder-sandbox:rw,uid=0,gid=65532,mode=2770,size=16m \
  --tmpfs /sandbox-scratch:rw,uid=0,gid=65532,mode=2770,size=256m \
  "$image" node smoke-test.mjs
