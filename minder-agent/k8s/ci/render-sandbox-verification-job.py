"""Derive a secret-free verification Job from kubectl's rendered Deployment JSON."""
import copy
import json
import re
import sys


def verification_job(resources, name):
    if not re.fullmatch(r"minder-sandbox-[a-z0-9-]{1,40}", name):
        raise ValueError("Invalid sandbox verification Job name")
    items = resources.get("items", [resources])
    deployment = next(
        item for item in items
        if item.get("kind") == "Deployment" and item["metadata"]["name"] == "minder-serve"
    )
    template = deployment["spec"]["template"]["spec"]
    runner = copy.deepcopy(next(c for c in template["containers"] if c["name"] == "sandbox-runner"))
    # Never copy Agent envFrom, service credentials or its identity into this Job.
    allowed_environment = {"MINDER_SANDBOX_SOCKET", "MINDER_WORKSPACE_CACHE", "MINDER_SANDBOX_SCRATCH"}
    if runner.get("envFrom") or any(
        "valueFrom" in e or e["name"] not in allowed_environment
        for e in runner.get("env", [])
    ):
        raise ValueError("Sandbox verification must not inherit secrets or external configuration")
    for key in ("startupProbe", "readinessProbe", "livenessProbe", "ports", "args"):
        runner.pop(key, None)
    runner["command"] = ["node", "/app/smoke-test.mjs"]
    mounted = {mount["name"] for mount in runner["volumeMounts"]}
    volumes = [copy.deepcopy(v) for v in template["volumes"] if v["name"] in mounted]
    if any(set(v) != {"name", "emptyDir"} for v in volumes):
        raise ValueError("Sandbox verification accepts only disposable emptyDir volumes")
    return {
        "apiVersion": "batch/v1", "kind": "Job",
        "metadata": {"name": name, "namespace": deployment["metadata"]["namespace"]},
        "spec": {
            "backoffLimit": 0, "activeDeadlineSeconds": 120, "ttlSecondsAfterFinished": 86400,
            "template": {
                "metadata": {"labels": {"app.kubernetes.io/name": "minder-sandbox-verify"}},
                "spec": {
                    "automountServiceAccountToken": False,
                    "restartPolicy": "Never",
                    "securityContext": copy.deepcopy(template["securityContext"]),
                    "containers": [runner], "volumes": volumes,
                },
            },
        },
    }


if __name__ == "__main__":
    json.dump(verification_job(json.load(sys.stdin), sys.argv[1]), sys.stdout, indent=2)
    sys.stdout.write("\n")
