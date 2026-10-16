from __future__ import annotations

import re
import unittest
from pathlib import Path


WORKLOAD_PATH = (
    Path(__file__).resolve().parents[2]
    / "infra"
    / "modules"
    / "gcp"
    / "ftps"
    / "workload.tf"
)
DEFAULT_TARGET_TCP_PROXY_QUOTA = 10
PROTOTYPE_PASSIVE_PORT_COUNT = 3


def integer_local(source: str, name: str) -> int:
    match = re.search(rf"^\s*{re.escape(name)}\s*=\s*(\d+)\s*$", source, re.MULTILINE)
    if match is None:
        raise AssertionError(f"Unable to read {name} from {WORKLOAD_PATH}")
    return int(match.group(1))


class FtpsNetworkQuotaTests(unittest.TestCase):
    def test_prototype_exposes_three_passive_ports(self) -> None:
        source = WORKLOAD_PATH.read_text(encoding="utf-8")
        passive_start = integer_local(source, "ftps_passive_port_start")
        passive_end = integer_local(source, "ftps_passive_port_end")

        self.assertEqual(
            passive_end - passive_start + 1,
            PROTOTYPE_PASSIVE_PORT_COUNT,
            "The first FTPS prototype should expose exactly three passive data ports.",
        )

    def test_public_ports_fit_the_default_target_tcp_proxy_quota(self) -> None:
        source = WORKLOAD_PATH.read_text(encoding="utf-8")
        passive_start = integer_local(source, "ftps_passive_port_start")
        passive_end = integer_local(source, "ftps_passive_port_end")
        target_tcp_proxy_count = 1 + passive_end - passive_start + 1

        self.assertLessEqual(
            target_tcp_proxy_count,
            DEFAULT_TARGET_TCP_PROXY_QUOTA,
            "Each public FTPS port creates one Target TCP Proxy: "
            f"{target_tcp_proxy_count} requested, but the default global quota is "
            f"{DEFAULT_TARGET_TCP_PROXY_QUOTA}.",
        )


class FtpsWorkloadRolloutTests(unittest.TestCase):
    def test_rwo_sqlite_deployment_uses_recreate_strategy(self) -> None:
        source = WORKLOAD_PATH.read_text(encoding="utf-8")
        marker = 'resource "kubernetes_deployment_v1" "sftpgo" {'
        deployment_start = source.find(marker)
        deployment_end = source.find("wait_for_rollout", deployment_start)

        self.assertGreaterEqual(deployment_start, 0, "Unable to find the SFTPGo Deployment")
        self.assertGreater(
            deployment_end,
            deployment_start,
            "Unable to find the end of the SFTPGo Deployment",
        )
        self.assertRegex(
            source[deployment_start:deployment_end],
            r'strategy\s*\{\s*type\s*=\s*"Recreate"\s*\}',
            "The single-replica SFTPGo Deployment must stop its current Pod "
            "before a replacement can mount the ReadWriteOnce SQLite PVC.",
        )


if __name__ == "__main__":
    unittest.main()
