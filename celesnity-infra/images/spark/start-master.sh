#!/usr/bin/env bash
# Spark standalone master.
# --host is set to the Compose service name so the address the master announces
# to workers and drivers is resolvable inside the celesnity network.
set -Eeuo pipefail

exec "${SPARK_HOME}/bin/spark-class" org.apache.spark.deploy.master.Master \
  --host "${SPARK_MASTER_HOST:-spark-master}" \
  --port "${SPARK_MASTER_INTERNAL_PORT:-7077}" \
  --webui-port 8080
