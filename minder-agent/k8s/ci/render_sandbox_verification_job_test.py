import copy
import importlib.util
import pathlib
import unittest

script = pathlib.Path(__file__).with_name("render-sandbox-verification-job.py")
spec = importlib.util.spec_from_file_location("sandbox_verification", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SandboxVerificationJobTest(unittest.TestCase):
    def setUp(self):
        self.resources = {"kind": "List", "items": [{
            "kind": "Deployment", "metadata": {"name": "minder-serve", "namespace": "minder"},
            "spec": {"template": {"spec": {
                "serviceAccountName": "privileged-agent-identity",
                "securityContext": {"runAsUser": 65532, "fsGroup": 65532},
                "containers": [
                    {"name": "minder-serve", "envFrom": [{"secretRef": {"name": "real-agent-secrets"}}]},
                    {"name": "sandbox-runner", "image": "runner@sha256:fixture",
                     "securityContext": {"appArmorProfile": {"type": "Unconfined"}, "capabilities": {"drop": ["ALL"]}},
                     "startupProbe": {"exec": {"command": ["probe"]}},
                     "volumeMounts": [{"name": "workspace", "mountPath": "/tmp/minder-workspaces"}]},
                ],
                "volumes": [{"name": "workspace", "emptyDir": {"sizeLimit": "2Gi"}},
                            {"name": "credentials", "secret": {"secretName": "real-agent-secrets"}}],
            }}},
        }]}

    def test_inherits_policy_image_and_mounts_without_agent_identity_or_secrets(self):
        original = copy.deepcopy(self.resources)
        job = module.verification_job(self.resources, "minder-sandbox-fixture")
        pod = job["spec"]["template"]["spec"]
        source = self.resources["items"][0]["spec"]["template"]["spec"]
        self.assertEqual(pod["securityContext"], source["securityContext"])
        self.assertEqual(pod["containers"][0]["securityContext"], source["containers"][1]["securityContext"])
        self.assertEqual(pod["containers"][0]["image"], "runner@sha256:fixture")
        self.assertEqual(pod["containers"][0]["command"], ["node", "/app/smoke-test.mjs"])
        self.assertNotIn("startupProbe", pod["containers"][0])
        self.assertNotIn("serviceAccountName", pod)
        self.assertFalse(pod["automountServiceAccountToken"])
        self.assertEqual(len(pod["volumes"]), 1)
        self.assertNotIn("real-agent-secrets", str(job))
        self.assertEqual(job["spec"]["backoffLimit"], 0)
        self.assertEqual(self.resources, original)

    def test_rejects_inherited_secret_environment(self):
        self.resources["items"][0]["spec"]["template"]["spec"]["containers"][1]["envFrom"] = [{"secretRef": {"name": "credentials"}}]
        with self.assertRaisesRegex(ValueError, "must not inherit secrets"):
            module.verification_job(self.resources, "minder-sandbox-fixture")

    def test_rejects_persistent_or_secret_mounts(self):
        self.resources["items"][0]["spec"]["template"]["spec"]["volumes"][0] = {"name": "workspace", "persistentVolumeClaim": {"claimName": "live-workspace"}}
        with self.assertRaisesRegex(ValueError, "disposable emptyDir"):
            module.verification_job(self.resources, "minder-sandbox-fixture")

    def test_rejects_invalid_job_name(self):
        with self.assertRaises(ValueError):
            module.verification_job(self.resources, "../another-job")
