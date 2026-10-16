#!/usr/bin/env python3
"""Idempotently provision the SFTPGo FTPS demo account.

The helper deliberately owns only the demo folder and user.  It creates both
when absent and reconciles their non-secret settings when present.  Existing
user passwords are never sent on a normal update, so restarting Compose cannot
rotate a client credential unexpectedly.  An explicit FTPS_RESET_PASSWORD=1
run is the only path that sends the configured password to SFTPGo.
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,63}$")
TENANT_PREFIX_RE = re.compile(r"^tnt_[a-z0-9]{12,48}$")
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,63}$")


@dataclass(frozen=True)
class BootstrapConfig:
    admin_username: str
    admin_password: str
    status_username: str
    status_password: str
    username: str
    password: str
    bucket: str
    storage_backend: str
    minio_access_key: str
    minio_access_secret: str
    s3_endpoint: str
    s3_region: str
    tenant_prefix: str
    folder_name: str

    def __post_init__(self) -> None:
        if not self.admin_username or not self.admin_password:
            raise ValueError("SFTPGo bootstrap administrator credentials are required")
        if not USERNAME_RE.fullmatch(self.status_username):
            raise ValueError("FTPS status username must be lowercase and path-safe")
        if self.status_username == self.admin_username:
            raise ValueError("FTPS status username must differ from the bootstrap administrator")
        if not USERNAME_RE.fullmatch(self.username):
            raise ValueError("FTPS demo username must be lowercase and path-safe")
        if not TENANT_PREFIX_RE.fullmatch(self.tenant_prefix):
            raise ValueError("tenant prefix must match tnt_[a-z0-9]{12,48}")
        if not NAME_RE.fullmatch(self.folder_name):
            raise ValueError("SFTPGo folder name must be lowercase and path-safe")
        if self.storage_backend not in {"s3", "gcs"}:
            raise ValueError("storage backend must be one of: s3, gcs")
        required_fields = ["password", "status_password", "bucket"]
        if self.storage_backend == "s3":
            required_fields.extend(
                [
                    "minio_access_key",
                    "minio_access_secret",
                    "s3_endpoint",
                    "s3_region",
                ]
            )
        for field_name in required_fields:
            if not getattr(self, field_name):
                raise ValueError(f"{field_name} is required")


def build_storage_prefix(tenant_prefix: str, username: str) -> str:
    """Return the object-store prefix hidden behind the FTPS /incoming path."""

    if not TENANT_PREFIX_RE.fullmatch(tenant_prefix):
        raise ValueError("tenant prefix must match tnt_[a-z0-9]{12,48}")
    if not USERNAME_RE.fullmatch(username):
        raise ValueError("FTPS demo username must be lowercase and path-safe")
    return f"{tenant_prefix}/landing/ftps/{username}/incoming/"


def build_s3_folder_payload(config: BootstrapConfig) -> dict[str, Any]:
    """Build the local MinIO/S3 filesystem configuration."""

    return {
        "provider": 1,
        "s3config": {
            "bucket": config.bucket,
            "region": config.s3_region,
            "access_key": config.minio_access_key,
            "access_secret": {
                "status": "Plain",
                "payload": config.minio_access_secret,
            },
            "endpoint": config.s3_endpoint,
            "force_path_style": True,
            "key_prefix": build_storage_prefix(config.tenant_prefix, config.username),
        },
    }


def build_gcs_folder_payload(config: BootstrapConfig) -> dict[str, Any]:
    """Build the deployed GCS filesystem configuration using Workload Identity."""

    return {
        "provider": 2,
        "gcsconfig": {
            "bucket": config.bucket,
            "automatic_credentials": 1,
            "key_prefix": build_storage_prefix(config.tenant_prefix, config.username),
        },
    }


def build_folder_payload(config: BootstrapConfig, existing: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Build the selected SFTPGo virtual-folder payload without exposing credentials."""

    filesystem = (
        build_s3_folder_payload(config)
        if config.storage_backend == "s3"
        else build_gcs_folder_payload(config)
    )
    payload: dict[str, Any] = {
        "name": config.folder_name,
        "description": "Celesnity FTPS inbound drop folder",
        "mapped_path": "",
        "filesystem": filesystem,
    }
    if existing:
        if existing.get("id") is not None:
            payload["id"] = existing["id"]
        if existing.get("users") is not None:
            payload["users"] = existing["users"]
    return payload


def build_user_payload(
    config: BootstrapConfig,
    *,
    folder_id: int,
    include_password: bool,
    existing: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the upload-only virtual user payload.

    The password is included when creating a user or when an explicit reset is
    requested. SFTPGo preserves the current password when the field is omitted
    from a normal update request.
    """

    payload: dict[str, Any] = {
        "status": 1,
        "username": config.username,
        "description": (existing or {}).get("description", "Celesnity local FTPS demo user"),
        "expiration_date": 0,
        "home_dir": f"/srv/sftpgo/data/{config.username}",
        "virtual_folders": [
            {
                "id": folder_id,
                "name": config.folder_name,
                "mapped_path": "",
                "virtual_path": "/incoming",
                "quota_size": 0,
                "quota_files": 0,
            }
        ],
        "permissions": {
            "/": ["list"],
            "/incoming": ["list", "upload", "create_dirs"],
        },
        "filters": {"ftp_security": 1},
        "max_sessions": 0,
        "quota_size": 0,
        "quota_files": 0,
        "upload_bandwidth": 0,
        "download_bandwidth": 0,
        "upload_data_transfer": 0,
        "download_data_transfer": 0,
        "total_data_transfer": 0,
    }
    if include_password:
        payload["password"] = config.password
    return payload


def build_monitoring_admin_payload(
    config: BootstrapConfig,
    *,
    include_password: bool,
    existing: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the least-privileged SFTPGo admin used for connection status."""

    payload: dict[str, Any] = {
        "status": 1,
        "username": config.status_username,
        "description": (existing or {}).get(
            "description", "Celesnity FTPS active-connection monitor"
        ),
        "permissions": ["view_conns"],
    }
    if include_password:
        payload["password"] = config.status_password
    return payload


class SftpGoApiError(RuntimeError):
    """An SFTPGo API failure without echoing request/credential contents."""


class SftpGoApi:
    def __init__(self, endpoint: str, admin_username: str, admin_password: str, timeout: float = 15.0):
        self.base_url = endpoint.rstrip("/") + "/api/v2"
        self.admin_username = admin_username
        self.admin_password = admin_password
        self.timeout = timeout
        self._token: str | None = None

    def authenticate(self) -> None:
        raw = f"{self.admin_username}:{self.admin_password}".encode("utf-8")
        response = self._request("GET", "/token", headers={"Authorization": f"Basic {base64.b64encode(raw).decode()}"}, authenticated=False)
        token = response.get("access_token")
        if not token:
            raise SftpGoApiError("SFTPGo did not return an administrator token")
        self._token = token

    def get_folder(self, name: str) -> dict[str, Any] | None:
        return self._get_optional(f"/folders/{quote(name, safe='')}")

    def create_folder(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/folders", body=payload)

    def update_folder(self, name: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("PUT", f"/folders/{quote(name, safe='')}", body=payload)

    def get_user(self, username: str) -> dict[str, Any] | None:
        return self._get_optional(f"/users/{quote(username, safe='')}")

    def create_user(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/users", body=payload)

    def update_user(self, username: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("PUT", f"/users/{quote(username, safe='')}", body=payload)

    def get_admin(self, username: str) -> dict[str, Any] | None:
        return self._get_optional(f"/admins/{quote(username, safe='')}")

    def create_admin(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/admins", body=payload)

    def update_admin(self, username: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self._request("PUT", f"/admins/{quote(username, safe='')}", body=payload)

    def _get_optional(self, path: str) -> dict[str, Any] | None:
        try:
            return self._request("GET", path)
        except SftpGoApiError as error:
            if str(error) == "not-found":
                return None
            raise

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        authenticated: bool = True,
    ) -> dict[str, Any]:
        request_headers = {"Accept": "application/json"}
        if headers:
            request_headers.update(headers)
        if authenticated:
            if not self._token:
                raise SftpGoApiError("SFTPGo API is not authenticated")
            request_headers["Authorization"] = f"Bearer {self._token}"
        data = None
        if body is not None:
            request_headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        request = Request(self.base_url + path, data=data, headers=request_headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
        except HTTPError as error:
            if error.code == 404:
                raise SftpGoApiError("not-found") from error
            raise SftpGoApiError(f"SFTPGo API returned HTTP {error.code}") from error
        except (URLError, TimeoutError) as error:
            raise SftpGoApiError("SFTPGo API is unavailable") from error
        if not raw:
            return {}
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise SftpGoApiError("SFTPGo API returned invalid JSON") from error
        if not isinstance(parsed, dict):
            raise SftpGoApiError("SFTPGo API returned an unexpected response")
        return parsed


def reconcile_monitoring_admin(
    api: Any,
    config: BootstrapConfig,
    *,
    reset_password: bool = False,
) -> str:
    """Create or reconcile the read-only active-connection monitoring admin."""

    existing_admin = api.get_admin(config.status_username)
    admin_payload = build_monitoring_admin_payload(
        config,
        include_password=existing_admin is None or reset_password,
        existing=existing_admin,
    )
    if existing_admin is None:
        api.create_admin(admin_payload)
        return "created"
    api.update_admin(config.status_username, admin_payload)
    return "password-reset" if reset_password else "reconciled"


def reconcile(
    api: Any,
    config: BootstrapConfig,
    *,
    reset_password: bool = False,
    reset_status_password: bool = False,
) -> dict[str, str]:
    """Create or reconcile the owned folder, demo user, and monitor."""

    existing_folder = api.get_folder(config.folder_name)
    folder_payload = build_folder_payload(config, existing_folder)
    if existing_folder is None:
        folder = api.create_folder(folder_payload)
    else:
        folder = api.update_folder(config.folder_name, folder_payload)
    folder_id = folder.get("id") or existing_folder.get("id")
    if not isinstance(folder_id, int) or folder_id < 1:
        raise SftpGoApiError("SFTPGo folder response did not include a valid id")

    existing_user = api.get_user(config.username)
    user_payload = build_user_payload(
        config,
        folder_id=folder_id,
        include_password=existing_user is None or reset_password,
        existing=existing_user,
    )
    if existing_user is None:
        api.create_user(user_payload)
        user_action = "created"
    else:
        api.update_user(config.username, user_payload)
        user_action = "password-reset" if reset_password else "reconciled"
    return {
        "folder": "created" if existing_folder is None else "reconciled",
        "user": user_action,
        "monitoring_admin": reconcile_monitoring_admin(
            api,
            config,
            reset_password=reset_status_password,
        ),
    }


def config_from_env(environ: Mapping[str, str] | None = None) -> BootstrapConfig:
    env = environ or os.environ
    return BootstrapConfig(
        admin_username=env.get("FTPS_BOOTSTRAP_ADMIN_USERNAME", "ftps-bootstrap-admin"),
        admin_password=env.get("FTPS_BOOTSTRAP_ADMIN_PASSWORD", "replace-with-a-local-bootstrap-password"),
        status_username=env.get("FTPS_STATUS_USERNAME", "ftps-status-monitor"),
        status_password=env.get("FTPS_STATUS_PASSWORD", "replace-with-a-local-ftps-status-password"),
        username=env.get("FTPS_DEMO_USERNAME", "ftps-demo-user"),
        password=env.get("FTPS_DEMO_PASSWORD", "replace-with-a-local-ftps-password"),
        bucket=env.get("FTPS_INGRESS_BUCKET", "celesnity-ingress"),
        storage_backend=env.get("FTPS_STORAGE_BACKEND", "s3").strip().lower(),
        minio_access_key=env.get("FTPS_MINIO_ACCESS_KEY", "celesnity-ftps"),
        minio_access_secret=env.get("FTPS_MINIO_ACCESS_SECRET", "replace-with-a-local-storage-secret"),
        s3_endpoint=env.get("FTPS_S3_ENDPOINT", "http://minio:9000"),
        s3_region=env.get("MINIO_REGION", "ap-southeast-1"),
        tenant_prefix=env.get("FTPS_TENANT_PREFIX", "tnt_localdemo000"),
        folder_name=env.get("FTPS_SFTPGO_FOLDER_NAME", "ftps-demo-incoming"),
    )


def main() -> int:
    try:
        config = config_from_env()
        api = SftpGoApi(
            os.environ.get("FTPS_SFTPGO_API_URL", "http://sftpgo:8080"),
            config.admin_username,
            config.admin_password,
        )
        last_error: Exception | None = None
        for attempt in range(1, 31):
            try:
                api.authenticate()
                result = reconcile(
                    api,
                    config,
                    reset_password=os.environ.get("FTPS_RESET_PASSWORD", "").lower() in {"1", "true", "yes"},
                    reset_status_password=os.environ.get("FTPS_STATUS_RESET_PASSWORD", "").lower()
                    in {"1", "true", "yes"},
                )
                print(
                    "FTPS bootstrap complete: "
                    f"folder={config.folder_name}({result['folder']}), "
                    f"user={config.username}({result['user']}), "
                    f"monitor={config.status_username}({result['monitoring_admin']})"
                )
                return 0
            except SftpGoApiError as error:
                last_error = error
                if attempt == 30:
                    break
                time.sleep(2)
        raise RuntimeError(str(last_error or "unknown SFTPGo bootstrap error"))
    except Exception as error:  # pragma: no cover - exercised by the container entrypoint
        print(f"FTPS bootstrap failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
