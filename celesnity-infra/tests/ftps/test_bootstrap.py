from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "ftps" / "bootstrap.py"
SPEC = importlib.util.spec_from_file_location("ftps_bootstrap_under_test", MODULE_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - a repository layout error
    raise RuntimeError(f"Unable to load {MODULE_PATH}")

bootstrap = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = bootstrap
SPEC.loader.exec_module(bootstrap)


class BootstrapStorageBackendTests(unittest.TestCase):
    def make_config(self, **overrides: str) -> object:
        values = {
            "admin_username": "ftps-bootstrap-admin",
            "admin_password": "bootstrap-password-not-real",
            "status_username": "ftps-status-monitor",
            "status_password": "status-password-not-real",
            "username": "ftps-demo-user",
            "password": "demo-password-not-real",
            "bucket": "celesnity-gcp-dev-ftps-ingress",
            "minio_access_key": "celesnity-ftps",
            "minio_access_secret": "minio-secret-not-real",
            "s3_endpoint": "http://minio:9000",
            "s3_region": "ap-southeast-1",
            "tenant_prefix": "tnt_gcpdev000001",
            "folder_name": "ftps-demo-incoming",
            "storage_backend": "s3",
        }
        values.update(overrides)
        return bootstrap.BootstrapConfig(**values)

    def test_gcs_folder_payload_uses_application_default_credentials(self) -> None:
        config = self.make_config(
            storage_backend="gcs",
            minio_access_key="",
            minio_access_secret="",
            s3_endpoint="",
            s3_region="",
        )

        payload = bootstrap.build_folder_payload(config)

        self.assertEqual(payload["filesystem"]["provider"], 2)
        self.assertEqual(
            payload["filesystem"]["gcsconfig"],
            {
                "bucket": "celesnity-gcp-dev-ftps-ingress",
                "automatic_credentials": 1,
                "key_prefix": "tnt_gcpdev000001/landing/ftps/ftps-demo-user/incoming/",
            },
        )
        self.assertNotIn("s3config", payload["filesystem"])

    def test_s3_folder_payload_keeps_local_minio_settings(self) -> None:
        config = self.make_config()

        payload = bootstrap.build_folder_payload(config)

        self.assertEqual(payload["filesystem"]["provider"], 1)
        self.assertEqual(
            payload["filesystem"]["s3config"]["endpoint"],
            "http://minio:9000",
        )
        self.assertEqual(payload["filesystem"]["s3config"]["force_path_style"], True)
        self.assertEqual(
            payload["filesystem"]["s3config"]["access_secret"]["payload"],
            "minio-secret-not-real",
        )

    def test_gcs_environment_does_not_require_minio_credentials(self) -> None:
        config = bootstrap.config_from_env(
            {
                "FTPS_STORAGE_BACKEND": "gcs",
                "FTPS_BOOTSTRAP_ADMIN_USERNAME": "ftps-bootstrap-admin",
                "FTPS_BOOTSTRAP_ADMIN_PASSWORD": "bootstrap-password-not-real",
                "FTPS_STATUS_USERNAME": "ftps-status-monitor",
                "FTPS_STATUS_PASSWORD": "status-password-not-real",
                "FTPS_DEMO_USERNAME": "ftps-demo-user",
                "FTPS_DEMO_PASSWORD": "demo-password-not-real",
                "FTPS_INGRESS_BUCKET": "celesnity-gcp-dev-ftps-ingress",
                "FTPS_MINIO_ACCESS_KEY": "",
                "FTPS_MINIO_ACCESS_SECRET": "",
                "FTPS_S3_ENDPOINT": "",
                "MINIO_REGION": "",
                "FTPS_TENANT_PREFIX": "tnt_gcpdev000001",
                "FTPS_SFTPGO_FOLDER_NAME": "ftps-demo-incoming",
            }
        )

        self.assertEqual(config.storage_backend, "gcs")
        self.assertEqual(config.minio_access_key, "")

    def test_rejects_unknown_storage_backend(self) -> None:
        with self.assertRaisesRegex(ValueError, "storage backend"):
            self.make_config(storage_backend="azure")


if __name__ == "__main__":
    unittest.main()
