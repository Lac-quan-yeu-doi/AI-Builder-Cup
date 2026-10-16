#!/usr/bin/env bash
set -uo pipefail
namespace="${1:?namespace required}"
selector="${2:?label selector required}"

kubectl -n "$namespace" get pods -l "$selector" -o wide || true
for pod in $(kubectl -n "$namespace" get pods -l "$selector" -o name); do
  # Describe pod conditions/events without printing configured env values.
  kubectl -n "$namespace" get "$pod" -o jsonpath='{.metadata.name}{"\n"}{.status.conditions}{"\n"}{.status.containerStatuses}{"\n"}' || true
  pod_name="${pod#pod/}"
  kubectl -n "$namespace" get events --field-selector "involvedObject.name=$pod_name" --sort-by=.metadata.creationTimestamp || true
  for container in $(kubectl -n "$namespace" get "$pod" -o jsonpath='{.spec.containers[*].name}'); do
    kubectl -n "$namespace" logs "$pod" -c "$container" --tail=80 || true
    kubectl -n "$namespace" logs "$pod" -c "$container" --previous --tail=80 2>/dev/null || true
  done
done
